// PUT /api/projects/:id/team  { team: [{ user_id, dept, access? }], reason? }
// Changes who works on the project, in which department, and at which level (Edit / View only / Manage, migration
// 0008). Allowed for its Base Line team, anyone with Manage on it, admins on any project and sub-admins on Live ones of
// their region (lib/roles.ts). Every department keeps at least one person at Edit or Manage. A row sent without
// `access` keeps the level it has (new rows start at Edit). Each change goes into the project's history and the
// read-only audit log.
import { z } from "zod";
import { errorResponse, HttpError, readJson, requireMember } from "@/lib/server/data";
import { audit } from "@/lib/server/audit";
import { assertActiveMembers } from "@/lib/server/people";
import { ACCESS_NAME, actsForAll, type Access } from "@/lib/roles";
import { DEPTS, dn } from "@/lib/workflow";

const Body = z.object({
  team: z.array(z.object({ user_id: z.uuid(), dept: z.enum(DEPTS), access: z.enum(["view", "edit", "manage"]).optional() })),
  reason: z.string().trim().max(300).optional(),
});

export async function PUT(req: Request, ctx: RouteContext<"/api/projects/[id]/team">) {
  let who: { db: Awaited<ReturnType<typeof requireMember>>["db"]; me: { id: string; name: string }; project: { id: string; name: string } } | null = null;
  try {
    const { id } = await ctx.params;
    const { db, me, project, team: before, canManageTeam, deptLabel } = await requireMember(id);
    who = { db, me, project };
    if (!canManageTeam) throw new HttpError(403, "Only the project's Base Line team, someone with Manage access, an admin, or (Live) the region's sub-admin can change its team.");
    const body = Body.parse(await readJson(req));
    const key = (t: { user_id: string; dept: string }) => `${t.user_id}|${t.dept}`;
    const was = new Map(before.map((t) => [key(t), t]));
    // the new team: a row sent without a level keeps its own (new rows start at Edit)
    const team = [...new Map(body.team.map((t) => [key(t), { user_id: t.user_id, dept: t.dept, access: (t.access ?? was.get(key(t))?.access ?? "edit") as Access }])).values()];
    const missing = DEPTS.filter((d) => !team.some((t) => t.dept === d && t.access !== "view"));
    if (missing.length) throw new HttpError(400, `Keep at least one person at Edit or Manage in ${missing.map(dn).join(", ")}.`);
    if (!actsForAll(me.role, project.kind, project.region, me.regions) && before.some((t) => t.user_id === me.id && t.dept === "BD") && !team.some((t) => t.user_id === me.id && t.dept === "BD")) throw new HttpError(400, "You can't take yourself off Base Line here. Ask another Base Line member to do it.");
    await assertActiveMembers(db, team.map((t) => t.user_id));

    const now = new Set(team.map(key));
    const added = team.filter((t) => !was.has(key(t)));
    const removed = before.filter((t) => !now.has(key(t)));
    const changed = team.filter((t) => was.has(key(t)) && was.get(key(t))!.access !== t.access);
    if (!added.length && !removed.length && !changed.length) return Response.json({ ok: true });

    for (const r of removed) {
      const { error } = await db.from("project_members").delete().eq("project_id", id).eq("user_id", r.user_id).eq("dept", r.dept);
      if (error) throw new HttpError(400, error.message);
    }
    if (added.length) {
      // the level goes in only when it isn't the default, so this works before migration 0008 too
      const { error } = await db.from("project_members").insert(added.map((t) => ({ project_id: id, user_id: t.user_id, dept: t.dept, ...(t.access !== "edit" ? { access: t.access } : {}) })));
      if (error) throw new HttpError(400, error.message.includes("access") ? "Run supabase/migrations/0008_access_levels_audit.sql in Supabase first, to use access levels." : error.message);
    }
    for (const t of changed) {
      const { error } = await db.from("project_members").update({ access: t.access }).eq("project_id", id).eq("user_id", t.user_id).eq("dept", t.dept);
      if (error) throw new HttpError(400, error.message.includes("access") ? "Run supabase/migrations/0008_access_levels_audit.sql in Supabase first, to use access levels." : error.message);
    }
    const ids = [...new Set([...added, ...removed, ...changed].map((t) => t.user_id))];
    const { data: ppl } = await db.from("profiles").select("id, name, email").in("id", ids);
    const person = (uid: string) => ppl?.find((p) => p.id === uid);
    const nm = (uid: string) => person(uid)?.name || "Former member";
    const lvl = (a: Access) => (a === "edit" ? "" : `, ${ACCESS_NAME[a]}`);
    const parts = [
      ...added.map((t) => `added ${nm(t.user_id)} (${dn(t.dept)}${lvl(t.access)})`),
      ...removed.map((t) => `removed ${nm(t.user_id)} (${dn(t.dept)})`),
      ...changed.map((t) => `set ${nm(t.user_id)} (${dn(t.dept)}) to ${ACCESS_NAME[t.access]}`),
    ];
    await db.from("activity").insert({ project_id: id, by: me.id, dept: deptLabel, action: "Changed the team: " + parts.join(", "), comment: body.reason || null, rev: null });
    const target = (uid: string) => ({ id: uid, name: nm(uid), email: person(uid)?.email ?? "" });
    const where = { id: project.id, name: project.name };
    await audit(db,
      ...added.map((t) => ({ actor: me, target: target(t.user_id), kind: "project_access" as const, action: "Added to project", before: null, after: { dept: t.dept, access: t.access }, project: where, reason: body.reason })),
      ...removed.map((t) => ({ actor: me, target: target(t.user_id), kind: "project_access" as const, action: "Removed from project", before: { dept: t.dept, access: t.access }, after: null, project: where, reason: body.reason })),
      ...changed.map((t) => ({ actor: me, target: target(t.user_id), kind: "project_access" as const, action: "Access level changed", before: { dept: t.dept, access: was.get(key(t))!.access }, after: { dept: t.dept, access: t.access }, project: where, reason: body.reason })),
    );
    // no email to people added to a team (user's decision, 2026-11-18)
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: err.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    // a refused attempt is recorded too
    if (who && err instanceof HttpError && err.status === 403) await audit(who.db, { actor: who.me, kind: "project_access", action: "Change project team", project: who.project, status: "failed", detail: err.message });
    return errorResponse(err);
  }
}
