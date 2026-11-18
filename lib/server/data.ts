// Server-side reads shared by the API routes. Everything here runs with the secret key, so each caller
// must have checked the person first (requireUser / requireMember).
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentUserId } from "@/lib/supabase/server";
import type { MasterRow, Model } from "@/lib/budget";
import { actsForAll, canSeeProject, kindOf, ROLE_NAME, roleOf, type Kind, type Role } from "@/lib/roles";
import { DEPTS, dn, type Dept, type Status } from "@/lib/workflow";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export interface ProjectRow {
  id: string; region: string; name: string; status: Status; template: string | null;
  inputs: Record<string, unknown>; rates: Record<string, unknown>; rates_template: string | null;
  last_rev: number | null; revision_reason: string; grand_total: number | null; base_total: number | null;
  location: string | null; acre: number | null; created_by: string | null; created_at: string; kind: Kind;
}
export interface VersionRow {
  project_id: string; rev: number; inputs: Record<string, unknown>; rates: Record<string, unknown>;
  master: MasterRow[];
  calc: Record<string, unknown>; grand_total: number | null; reason: string; dept: string;
  template: string | null; xlsx_path: string | null; frozen_by: string | null; frozen_at: string;
}

export interface Me { id: string; name: string; email: string; is_admin: boolean; is_subadmin: boolean; role: Role }

export async function requireUser() {
  const id = await currentUserId();
  if (!id) throw new HttpError(401, "Please sign in.");
  const db = createAdminClient();
  const { data: p } = await db.from("profiles").select("*").eq("id", id).single();
  if (!p) throw new HttpError(403, "Your account has no profile yet. Ask an admin to invite you again.");
  const me: Me = { id: p.id, name: p.name, email: p.email, is_admin: !!p.is_admin, is_subadmin: !!p.is_subadmin, role: roleOf(p) };
  return { db, me };
}

/** For reading a project (its pages, Excel and files). Admins see every project, sub-admins every Live project,
 *  everyone else only the projects they're on (lib/roles.ts). A project you can't see is simply "not found". */
export async function requireViewer(projectId: string) {
  const { db, me } = await requireUser();
  const { data: row } = await db.from("projects").select("*").eq("id", projectId).single();
  if (!row) throw new HttpError(404, "Project not found.");
  const project = { ...row, kind: kindOf(row) } as ProjectRow;
  const { data: rows } = await db.from("project_members").select("user_id, dept").eq("project_id", projectId);
  const team = (rows ?? []) as { user_id: string; dept: Dept }[];
  const ownDepts = team.filter((r) => r.user_id === me.id).map((r) => r.dept);
  if (!canSeeProject(me.role, project.kind, ownDepts.length > 0)) throw new HttpError(404, "Project not found.");
  return { db, me, project, team, ownDepts };
}

/** For changes: the project and this person's departments on it. The team changes a project; an admin acts for
 *  every department on any project, a sub-admin on any Live project. */
export async function requireMember(projectId: string) {
  const { db, me, project, team, ownDepts } = await requireViewer(projectId);
  const all = actsForAll(me.role, project.kind);
  if (!ownDepts.length && !all) throw new HttpError(403, "Only the project's team can change it. Ask Base Line to add you to the team.");
  const myDepts: Dept[] = all ? [...DEPTS] : ownDepts;
  // how the person is named in the history and in emails: their own departments, or "Admin" / "Sub-admin"
  const actorDepts: string[] = all && !ownDepts.length ? [ROLE_NAME[me.role]] : ownDepts;
  const deptLabel = actorDepts.map(dn).join(" + ") + (all && ownDepts.length ? ` (${ROLE_NAME[me.role].toLowerCase()})` : "");
  return { db, me, project, team, myDepts, ownDepts, actorDepts, deptLabel };
}

const modelCache = new Map<string, Model>();
export async function loadModel(stamp?: string | null): Promise<Model> {
  const db = createAdminClient();
  if (!stamp) {
    const { data } = await db.from("templates").select("stamp").eq("is_current", true).single();
    if (!data) throw new HttpError(500, "No current template. Run scripts/upload-templates.mjs first.");
    stamp = data.stamp as string;
  }
  const hit = modelCache.get(stamp);
  if (hit) return hit;
  const { data, error } = await db.from("templates").select("model").eq("stamp", stamp).single();
  if (error || !data) throw new HttpError(500, `Template ${stamp} is missing.`);
  const m = { ...(data.model as Model), stamp };
  modelCache.set(stamp, m);
  return m;
}

export async function loadTemplateXlsx(stamp: string): Promise<Uint8Array> {
  const db = createAdminClient();
  const { data: t } = await db.from("templates").select("xlsx_path").eq("stamp", stamp).single();
  if (!t) throw new HttpError(500, `Template ${stamp} is missing.`);
  const { data, error } = await db.storage.from("templates").download(t.xlsx_path as string);
  if (error || !data) throw new HttpError(500, `Couldn't read the ${stamp} workbook: ${error?.message}`);
  return new Uint8Array(await data.arrayBuffer());
}

export function errorResponse(err: unknown) {
  if (err instanceof HttpError) return Response.json({ error: err.message }, { status: err.status });
  console.error(err);
  return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
}

/** The request's JSON body, or a clean 400 if it isn't valid JSON (so a broken body isn't a 500). */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "The request body wasn't valid JSON.");
  }
}

/** A Supabase Storage error turned into a 404 when the object is simply gone, otherwise a 500. */
export function storageError(error: unknown, notThere = "This file is no longer available."): HttpError {
  const e = error as { message?: string; statusCode?: string; code?: string } | null;
  const gone = !!e && (e.statusCode === "404" || e.code === "NoSuchKey" || /not\s*found|no such/i.test(e.message ?? ""));
  return new HttpError(gone ? 404 : 500, gone ? notThere : e?.message ?? "Couldn't create the download link.");
}
