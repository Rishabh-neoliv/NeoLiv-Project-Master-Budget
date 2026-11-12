// POST /api/projects: create a project (Base Line draft R0) with its team.
import { z } from "zod";
import { isNum, snapshot, startInputs } from "@/lib/budget";
import { errorResponse, HttpError, loadModel, requireUser } from "@/lib/server/data";
import { assertActiveMembers } from "@/lib/server/people";
import { notify } from "@/lib/server/email";
import { DEPTS, dn } from "@/lib/workflow";

const Body = z.object({
  name: z.string().trim().min(1, "Give the project a name.").max(120),
  region: z.enum(["NCR", "MMR"]),
  team: z.array(z.object({ user_id: z.uuid(), dept: z.enum(DEPTS) })).min(1),
});

export async function POST(req: Request) {
  try {
    const { db, me } = await requireUser();
    const body = Body.parse(await req.json());
    const team = [...new Map(body.team.map((t) => [`${t.user_id}|${t.dept}`, t])).values()];
    const missing = DEPTS.filter((d) => !team.some((t) => t.dept === d));
    if (missing.length) throw new HttpError(400, `Add someone for ${missing.map(dn).join(", ")}.`);
    if (!me.is_admin && !team.some((t) => t.user_id === me.id && t.dept === "BD")) throw new HttpError(403, "Projects are set up by their Base Line team: add yourself to Base Line.");
    await assertActiveMembers(db, team.map((t) => t.user_id));

    const { data: dupe } = await db.from("projects").select("id").ilike("name", body.name).maybeSingle();
    if (dupe) throw new HttpError(409, `A project called “${body.name}” already exists.`);

    const m = await loadModel();
    // a new project starts from the master template's sample values, like the original app; the rates
    // location comes from the region
    const inputs = startInputs(m, body.region);
    const snap = snapshot(m, inputs);
    const { data: project, error } = await db.from("projects").insert({
      name: body.name, region: body.region, status: "DRAFT", template: m.stamp, inputs, rates: {}, rates_template: m.stamp,
      grand_total: snap.grandTotal, location: (inputs.C8 as string) ?? null, acre: isNum(inputs.C9) ? inputs.C9 : null, created_by: me.id, updated_by: me.id,
    }).select("*").single();
    if (error) throw new HttpError(400, error.message);

    const { error: tErr } = await db.from("project_members").insert(team.map((t) => ({ ...t, project_id: project.id })));
    if (tErr) { await db.from("projects").delete().eq("id", project.id); throw new HttpError(400, tErr.message); }
    const ownDepts = team.filter((t) => t.user_id === me.id).map((t) => t.dept);
    const actorDepts: string[] = ownDepts.length ? ownDepts : ["Admin"];
    await db.from("activity").insert({ project_id: project.id, by: me.id, dept: actorDepts.map(dn).join(" + "), action: `Created project with ${new Set(team.map((t) => t.user_id)).size} team member(s)`, rev: 0 });
    await notify({ key: "created", project, rev: 0, actor: me, actorDepts, team });
    return Response.json({ id: project.id });
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: err.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    return errorResponse(err);
  }
}
