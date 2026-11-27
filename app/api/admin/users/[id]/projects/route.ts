// One member's project access (the "Manage project access" pop-up on Team members). Admins and sub-admins.
// GET  /api/admin/users/:id/projects   their projects (department, level), the projects you manage, and (admins) their
//                                      access history from the audit log
// PUT  /api/admin/users/:id/projects   { assignments: [{ projectId, dept, access }], reason? }: what they should have on
//                                      the projects YOU manage (admins any, sub-admins their region's Live ones:
//                                      actsForAll); rows on other projects are never touched. Each project keeps at
//                                      least one person at Edit or Manage per department. Changes go into each project's
//                                      history and the read-only audit log. Departments and levels: migration 0008.
import { z } from "zod";
import { audit } from "@/lib/server/audit";
import { errorResponse, HttpError, readJson, requireUser } from "@/lib/server/data";
import { assertActiveMembers } from "@/lib/server/people";
import { accessOf, ACCESS_NAME, actsForAll, isStaff, kindOf, type Access } from "@/lib/roles";
import { DEPTS, dn, type Dept } from "@/lib/workflow";

const Body = z.object({
  assignments: z.array(z.object({ projectId: z.uuid(), dept: z.enum(DEPTS), access: z.enum(["view", "edit", "manage"]) })).max(500),
  reason: z.string().trim().max(300).optional(),
});

async function context(id: string) {
  const { db, me } = await requireUser();
  if (!isStaff(me.role)) throw new HttpError(403, "Only an admin or sub-admin can manage project access.");
  const { data: person } = await db.from("profiles").select("id, name, email").eq("id", id).maybeSingle();
  if (!person) throw new HttpError(404, "Member not found.");
  const { data: projects } = await db.from("projects").select("id, name, kind, region, location").order("name");
  const all = (projects ?? []).map((p) => ({ id: p.id as string, name: p.name as string, kind: kindOf(p), region: p.region as string, location: (p.location as string | null) ?? null }));
  const manageable = all.filter((p) => actsForAll(me.role, p.kind, p.region, me.regions));
  return { db, me, person, all, manageable };
}

export async function GET(_req: Request, ctx: RouteContext<"/api/admin/users/[id]/projects">) {
  try {
    const { id } = await ctx.params;
    const { db, me, all, manageable } = await context(id);
    const { data: rows } = await db.from("project_members").select("*").eq("user_id", id);
    const byId = new Map(all.map((p) => [p.id, p]));
    const can = new Set(manageable.map((p) => p.id));
    const assigned = (rows ?? []).filter((r) => byId.has(r.project_id)).map((r) => {
      const p = byId.get(r.project_id)!;
      return { projectId: p.id, name: p.name, kind: p.kind, region: p.location || p.region, dept: r.dept as Dept, access: accessOf(r), manageable: can.has(p.id) };
    });
    // the history is from the audit log, which admins read (migration 0008)
    const { data: history } = me.role === "admin"
      ? await db.from("audit_log").select("id, at, actor_name, kind, action, before, after, project_name, reason, status, detail").eq("target", id).order("at", { ascending: false }).limit(60)
      : { data: [] };
    return Response.json({ assigned, projects: manageable.map((p) => ({ id: p.id, name: p.name, kind: p.kind, region: p.location || p.region })), history: history ?? [] });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PUT(req: Request, ctx: RouteContext<"/api/admin/users/[id]/projects">) {
  let tried: { db: Awaited<ReturnType<typeof requireUser>>["db"]; me: { id: string; name: string }; target: { id: string; name: string; email: string } | null } | null = null;
  try {
    const { id } = await ctx.params;
    const { db, me } = await requireUser();
    tried = { db, me, target: { id, name: "", email: "" } };
    const { person, manageable } = await context(id);
    tried.target = { id, name: person.name, email: person.email };
    const body = Body.parse(await readJson(req));
    const can = new Map(manageable.map((p) => [p.id, p]));
    const wanted = [...new Map(body.assignments.map((a) => [`${a.projectId}|${a.dept}`, a])).values()];
    const outside = wanted.find((a) => !can.has(a.projectId));
    if (outside) throw new HttpError(403, "One of the projects isn't one you manage. Admins manage every project; sub-admins the Live projects of their region.");
    if (wanted.length) await assertActiveMembers(db, [id]);

    const key = (r: { project_id: string; user_id: string; dept: string }) => `${r.project_id}|${r.user_id}|${r.dept}`;
    const ids = [...can.keys()];
    const { data: teamRows } = ids.length ? await db.from("project_members").select("*").in("project_id", ids) : { data: [] };
    const teams = (teamRows ?? []).map((r) => ({ project_id: r.project_id as string, user_id: r.user_id as string, dept: r.dept as Dept, access: accessOf(r) }));
    const mineNow = teams.filter((r) => r.user_id === id);
    const want = new Map(wanted.map((a) => [key({ project_id: a.projectId, user_id: id, dept: a.dept }), a.access as Access]));
    const added = wanted.filter((a) => !mineNow.some((r) => key(r) === key({ project_id: a.projectId, user_id: id, dept: a.dept })));
    const removed = mineNow.filter((r) => !want.has(key(r)));
    const changed = mineNow.filter((r) => want.has(key(r)) && want.get(key(r)) !== r.access);
    if (!added.length && !removed.length && !changed.length) return Response.json({ ok: true, unchanged: true });

    // every affected project keeps someone at Edit or Manage in each department
    const touched = new Set([...added.map((a) => a.projectId), ...removed.map((r) => r.project_id), ...changed.map((r) => r.project_id)]);
    for (const pid of touched) {
      const after = [
        ...teams.filter((r) => r.project_id === pid && r.user_id !== id),
        ...wanted.filter((a) => a.projectId === pid).map((a) => ({ project_id: pid, user_id: id, dept: a.dept, access: a.access as Access })),
      ];
      const missing = DEPTS.filter((d) => !after.some((r) => r.dept === d && r.access !== "view"));
      if (missing.length) throw new HttpError(400, `${can.get(pid)!.name} would have nobody at Edit or Manage in ${missing.map(dn).join(", ")}. Keep at least one, or add someone else first.`);
    }

    const levelErr = (m: string) => (m.includes("access") ? "Run supabase/migrations/0008_access_levels_audit.sql in Supabase first, to use access levels." : m);
    for (const r of removed) {
      const { error } = await db.from("project_members").delete().eq("project_id", r.project_id).eq("user_id", id).eq("dept", r.dept);
      if (error) throw new HttpError(400, error.message);
    }
    if (added.length) {
      const { error } = await db.from("project_members").insert(added.map((a) => ({ project_id: a.projectId, user_id: id, dept: a.dept, ...(a.access !== "edit" ? { access: a.access } : {}) })));
      if (error) throw new HttpError(400, levelErr(error.message));
    }
    for (const r of changed) {
      const { error } = await db.from("project_members").update({ access: want.get(key(r)) }).eq("project_id", r.project_id).eq("user_id", id).eq("dept", r.dept);
      if (error) throw new HttpError(400, levelErr(error.message));
    }

    // each project's history, as a team change there, and the audit log
    const label = me.role === "admin" ? "Admin" : "Sub-admin";
    const lvl = (a: Access) => (a === "edit" ? "" : `, ${ACCESS_NAME[a]}`);
    for (const pid of touched) {
      const parts = [
        ...added.filter((a) => a.projectId === pid).map((a) => `added ${person.name} (${dn(a.dept)}${lvl(a.access)})`),
        ...removed.filter((r) => r.project_id === pid).map((r) => `removed ${person.name} (${dn(r.dept)})`),
        ...changed.filter((r) => r.project_id === pid).map((r) => `set ${person.name} (${dn(r.dept)}) to ${ACCESS_NAME[want.get(key(r))!]}`),
      ];
      await db.from("activity").insert({ project_id: pid, by: me.id, dept: label, action: "Changed the team: " + parts.join(", "), comment: body.reason || null, rev: null });
    }
    const target = tried.target, where = (pid: string) => ({ id: pid, name: can.get(pid)!.name });
    await audit(db,
      ...added.map((a) => ({ actor: me, target, kind: "project_access" as const, action: "Added to project", before: null, after: { dept: a.dept, access: a.access }, project: where(a.projectId), reason: body.reason })),
      ...removed.map((r) => ({ actor: me, target, kind: "project_access" as const, action: "Removed from project", before: { dept: r.dept, access: r.access }, after: null, project: where(r.project_id), reason: body.reason })),
      ...changed.map((r) => ({ actor: me, target, kind: "project_access" as const, action: "Access level changed", before: { dept: r.dept, access: r.access }, after: { dept: r.dept, access: want.get(key(r)) }, project: where(r.project_id), reason: body.reason })),
    );
    return Response.json({ ok: true, added: added.length, removed: removed.length, changed: changed.length });
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: err.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    if (tried && err instanceof HttpError && err.status === 403)
      await audit(tried.db, { actor: tried.me, target: tried.target, kind: "project_access", action: "Change project access", status: "failed", detail: err.message });
    return errorResponse(err);
  }
}
