// POST /api/projects: create a project (Base Line draft R0) with its team. Live projects are created by admins and
// sub-admins, Test projects by admins only (from the Admin panel's tabs); the type never changes afterwards.
import { z } from "zod";
import { isNum, snapshot, startInputs } from "@/lib/budget";
import { errorResponse, HttpError, readJson, loadModel, requireUser } from "@/lib/server/data";
import { canCreateProject, ROLE_NAME } from "@/lib/roles";
import { assertActiveMembers } from "@/lib/server/people";
import { DEPTS, dn } from "@/lib/workflow";

const Body = z.object({
  name: z.string().trim().min(1, "Give the project a name.").max(120),
  region: z.enum(["NCR", "MMR"]),
  team: z.array(z.object({ user_id: z.uuid(), dept: z.enum(DEPTS) })).min(1),
  kind: z.enum(["live", "test"]),
});

export async function POST(req: Request) {
  try {
    const { db, me } = await requireUser();
    const body = Body.parse(await readJson(req));
    const team = [...new Map(body.team.map((t) => [`${t.user_id}|${t.dept}`, t])).values()];
    const missing = DEPTS.filter((d) => !team.some((t) => t.dept === d));
    if (missing.length) throw new HttpError(400, `Add someone for ${missing.map(dn).join(", ")}.`);
    if (!canCreateProject(me.role, body.kind)) throw new HttpError(403, body.kind === "test" ? "Only an admin can create a Test project." : "Only an admin or sub-admin can create a project.");
    await assertActiveMembers(db, team.map((t) => t.user_id));

    const { data: dupe } = await db.from("projects").select("id").ilike("name", body.name).maybeSingle();
    if (dupe) throw new HttpError(409, `A project called “${body.name}” already exists.`);

    const m = await loadModel();
    // a new project starts from the master template's sample values, like the original app; the rates
    // location comes from the region
    const inputs = startInputs(m, body.region);
    const snap = snapshot(m, inputs);
    const { data: project, error } = await db.from("projects").insert({
      name: body.name, region: body.region, kind: body.kind, status: "DRAFT", template: m.stamp, inputs, rates: {}, rates_template: m.stamp,
      grand_total: snap.grandTotal, location: (inputs.C8 as string) ?? null, acre: isNum(inputs.C9) ? inputs.C9 : null, created_by: me.id, updated_by: me.id,
    }).select("*").single();
    if (error) throw new HttpError(400, error.message);

    const { error: tErr } = await db.from("project_members").insert(team.map((t) => ({ ...t, project_id: project.id })));
    if (tErr) { await db.from("projects").delete().eq("id", project.id); throw new HttpError(400, tErr.message); }
    const ownDepts = team.filter((t) => t.user_id === me.id).map((t) => t.dept);
    const actorDepts: string[] = ownDepts.length ? ownDepts : [ROLE_NAME[me.role]];
    await db.from("activity").insert({ project_id: project.id, by: me.id, dept: actorDepts.map(dn).join(" + "), action: `Created project with ${new Set(team.map((t) => t.user_id)).size} team member(s)`, rev: 0 });
    // no email when a project is created (user's decision, 2026-11-18): the team hears when R0 reaches Design
    return Response.json({ id: project.id });
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: err.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    return errorResponse(err);
  }
}
