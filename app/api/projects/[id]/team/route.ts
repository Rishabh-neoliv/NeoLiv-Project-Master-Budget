// PUT /api/projects/:id/team  { team: [{ user_id, dept }] }
// The project's Base Line team changes who works on it, and in which department (as in the original app).
import { z } from "zod";
import { errorResponse, HttpError, readJson, requireMember } from "@/lib/server/data";
import { notify } from "@/lib/server/email";
import { assertActiveMembers } from "@/lib/server/people";
import { DEPTS, dn } from "@/lib/workflow";

const Body = z.object({ team: z.array(z.object({ user_id: z.uuid(), dept: z.enum(DEPTS) })) });

export async function PUT(req: Request, ctx: RouteContext<"/api/projects/[id]/team">) {
  try {
    const { id } = await ctx.params;
    const { db, me, project, team: before, myDepts, actorDepts, deptLabel } = await requireMember(id);
    if (!myDepts.includes("BD")) throw new HttpError(403, "Only the project's Base Line team (or the admin) can change its team.");
    const body = Body.parse(await readJson(req));
    const team = [...new Map(body.team.map((t) => [`${t.user_id}|${t.dept}`, t])).values()];
    const missing = DEPTS.filter((d) => !team.some((t) => t.dept === d));
    if (missing.length) throw new HttpError(400, `Keep at least one person in ${missing.map(dn).join(", ")}.`);
    if (!me.is_admin && before.some((t) => t.user_id === me.id && t.dept === "BD") && !team.some((t) => t.user_id === me.id && t.dept === "BD")) throw new HttpError(400, "You can't take yourself off Base Line here. Ask another Base Line member to do it.");
    await assertActiveMembers(db, team.map((t) => t.user_id));

    const key = (t: { user_id: string; dept: string }) => `${t.user_id}|${t.dept}`;
    const was = new Set(before.map(key)), now = new Set(team.map(key));
    const added = team.filter((t) => !was.has(key(t))), removed = before.filter((t) => !now.has(key(t)));
    if (!added.length && !removed.length) return Response.json({ ok: true });

    if (removed.length) {
      for (const r of removed) {
        const { error } = await db.from("project_members").delete().eq("project_id", id).eq("user_id", r.user_id).eq("dept", r.dept);
        if (error) throw new HttpError(400, error.message);
      }
    }
    if (added.length) {
      const { error } = await db.from("project_members").insert(added.map((t) => ({ ...t, project_id: id })));
      if (error) throw new HttpError(400, error.message);
    }
    const ids = [...new Set([...added, ...removed].map((t) => t.user_id))];
    const { data: ppl } = await db.from("profiles").select("id, name").in("id", ids);
    const nm = (uid: string) => ppl?.find((p) => p.id === uid)?.name || "Someone";
    const parts = [
      ...added.map((t) => `added ${nm(t.user_id)} (${dn(t.dept)})`),
      ...removed.map((t) => `removed ${nm(t.user_id)} (${dn(t.dept)})`),
    ];
    await db.from("activity").insert({ project_id: id, by: me.id, dept: deptLabel, action: "Changed the team: " + parts.join(", "), rev: null });
    // newcomers hear that they're on the project
    const newcomers = added.filter((t) => !before.some((b) => b.user_id === t.user_id));
    if (newcomers.length) {
      await notify({ key: "team_added", project, rev: project.last_rev ?? 0, actor: me, actorDepts, team: newcomers });
    }
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: err.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    return errorResponse(err);
  }
}
