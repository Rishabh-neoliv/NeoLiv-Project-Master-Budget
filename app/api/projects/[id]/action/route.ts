// POST /api/projects/:id/action  { key, comment? }
// Start design / operations, send back, approve (freezes R1+), create a new version.
import { z } from "zod";
import { snapshot } from "@/lib/budget";
import { errorResponse, HttpError, readJson, loadModel, requireMember } from "@/lib/server/data";
import { notify } from "@/lib/server/email";
import { freezeVersion } from "@/lib/server/freeze";
import { ACTIONS, availableActions, nextRev, type ActionKey, type Status } from "@/lib/workflow";

const Body = z.object({ key: z.enum(ACTIONS.map((a) => a.key) as [ActionKey, ...ActionKey[]]), comment: z.string().max(2000).optional() });

export async function POST(req: Request, ctx: RouteContext<"/api/projects/[id]/action">) {
  try {
    const { id } = await ctx.params;
    const { db, me, project: p, team, myDepts, ownDepts, actorDepts, deptLabel } = await requireMember(id);
    const { key, comment: raw } = Body.parse(await readJson(req));
    const comment = (raw || "").trim();
    const a = availableActions(p.status, myDepts).find((x) => x.key === key);
    if (!a) throw new HttpError(403, "That step isn't open to you on this project right now.");
    if (a.needsComment && !comment) throw new HttpError(400, "Please add a comment first.");

    const now = new Date().toISOString();
    const upd: Record<string, unknown> = { status: a.to, updated_by: me.id, updated_at: now };
    const rev = a.key === "revise" ? nextRev(p.last_rev) : p.status === "APPROVED" || p.status === "COMPLETED" ? p.last_rev ?? 0 : nextRev(p.last_rev);
    let label = a.label;
    let workbookError: string | null = null;

    if (a.key === "revise") {
      upd.revision_reason = comment;
      label = `Created R${rev}`;
      if (ownDepts.includes("Design")) upd.status = "DESIGN_IN_PROGRESS"; // Design itself opened it: carry straight on
    }
    if (a.key === "return_bd") upd.revision_reason = `Returned by Design: ${comment}`;
    if (a.key === "mgmt_return") label = `Sent R${rev} back to Operations`;
    if (a.key === "approve") {
      // the working draft becomes frozen revision R<n>
      const m = await loadModel(p.template);
      const inputs = { ...m.defaults, ...p.inputs }, rates = p.rates || {};
      const snap = snapshot(m, inputs, rates);
      const reason = [p.revision_reason, comment].filter(Boolean).join(" — ") || "Approved";
      ({ workbookError } = await freezeVersion(db, { project: p, rev, m, snap, inputs, rates, reason, dept: "Management", by: me.id }));
      Object.assign(upd, { last_rev: rev, revision_reason: "", grand_total: snap.grandTotal, inputs });
      label = `Approved R${rev} – frozen`;
    }

    const { data, error } = await db.from("projects").update(upd).eq("id", p.id).eq("status", p.status).select("id");
    if (error) throw new HttpError(400, error.message);
    if (!data?.length) throw new HttpError(409, "Someone else moved this project on. Reload to see its current state.");
    await db.from("activity").insert({ project_id: p.id, by: me.id, dept: deptLabel, action: label, comment, rev });
    // starting Design / Operations work tells nobody (as in the original app); every other step emails its team
    if (a.key !== "design_start" && a.key !== "ops_start") await notify({ key: a.key, project: { ...p, ...(upd as { status: Status }) }, rev, note: comment, actor: me, actorDepts, team });
    return Response.json({ ok: true, status: upd.status, workbookError });
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: err.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    return errorResponse(err);
  }
}
