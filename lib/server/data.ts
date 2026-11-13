// Server-side reads shared by the API routes. Everything here runs with the secret key, so each caller
// must have checked the person first (requireUser / requireMember).
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentUserId } from "@/lib/supabase/server";
import type { MasterRow, Model } from "@/lib/budget";
import { DEPTS, dn, type Dept, type Status } from "@/lib/workflow";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export interface ProjectRow {
  id: string; region: string; name: string; status: Status; template: string | null;
  inputs: Record<string, unknown>; rates: Record<string, unknown>; rates_template: string | null;
  last_rev: number | null; revision_reason: string; grand_total: number | null; base_total: number | null;
  location: string | null; acre: number | null; created_by: string | null; created_at: string;
}
export interface VersionRow {
  project_id: string; rev: number; inputs: Record<string, unknown>; rates: Record<string, unknown>;
  master: MasterRow[];
  calc: Record<string, unknown>; grand_total: number | null; reason: string; dept: string;
  template: string | null; xlsx_path: string | null; frozen_by: string | null; frozen_at: string;
}

export async function requireUser() {
  const id = await currentUserId();
  if (!id) throw new HttpError(401, "Please sign in.");
  const db = createAdminClient();
  const { data: me } = await db.from("profiles").select("id, name, email, is_admin").eq("id", id).single();
  if (!me) throw new HttpError(403, "Your account has no profile yet. Ask an admin to invite you again.");
  return { db, me: me as { id: string; name: string; email: string; is_admin: boolean } };
}

/** For reading only: every signed-in member can view every project (and download its Excel and files). */
export async function requireViewer(projectId: string) {
  const { db, me } = await requireUser();
  const { data: project } = await db.from("projects").select("*").eq("id", projectId).single();
  if (!project) throw new HttpError(404, "Project not found.");
  return { db, me, project: project as ProjectRow };
}

/** For changes: the project and this person's departments on it. Only the team (and the admin) can change a project. */
export async function requireMember(projectId: string) {
  const { db, me, project } = await requireViewer(projectId);
  const { data: rows } = await db.from("project_members").select("user_id, dept").eq("project_id", projectId);
  const team = (rows ?? []) as { user_id: string; dept: Dept }[];
  const ownDepts = team.filter((r) => r.user_id === me.id).map((r) => r.dept);
  if (!ownDepts.length && !me.is_admin) throw new HttpError(403, "You can view this project, but only its team can change it. Ask Base Line to add you to the team.");
  // the admin can do everything a team member can, in every department
  const myDepts: Dept[] = me.is_admin ? [...DEPTS] : ownDepts;
  // how the person is named in the history and in emails: their own departments, or "Admin"
  const actorDepts: string[] = me.is_admin && !ownDepts.length ? ["Admin"] : ownDepts;
  const deptLabel = actorDepts.map(dn).join(" + ") + (me.is_admin && ownDepts.length ? " (admin)" : "");
  return { db, me, project: project as ProjectRow, team, myDepts, ownDepts, actorDepts, deptLabel };
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
