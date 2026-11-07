// POST /api/projects/:id/template   moves the working draft onto the current master template (the newest
// workbook). Inputs are carried by field name and project rates by sheet + item, as in the original app.
// Frozen revisions keep the template they were frozen on.
import { migrateInputs, migrateRates, snapshot } from "@/lib/budget";
import { errorResponse, HttpError, loadModel, requireMember } from "@/lib/server/data";
import { canEditDraft, dn, editDept, hasDraft } from "@/lib/workflow";

export async function POST(_req: Request, ctx: RouteContext<"/api/projects/[id]/template">) {
  try {
    const { id } = await ctx.params;
    const { db, me, project: p, myDepts, deptLabel } = await requireMember(id);
    if (!hasDraft(p.status)) throw new HttpError(400, "There's no working draft to move: start a new version first.");
    if (!canEditDraft(p.status, myDepts)) throw new HttpError(403, `Only ${dn(editDept(p.status))} can move the draft now, while it's their turn.`);
    const [from, to] = await Promise.all([loadModel(p.template), loadModel()]);
    if (from.stamp === to.stamp) throw new HttpError(400, "The draft is already on the current template.");

    const { inputs, moved, dropped } = migrateInputs(from, to, { ...from.defaults, ...p.inputs });
    const rates = migrateRates(from, to, p.rates || {});
    const ratesLost = Object.keys(p.rates || {}).length - Object.keys(rates).length;
    const snap = snapshot(to, inputs, rates);
    const { error } = await db.from("projects").update({
      template: to.stamp, inputs, rates, rates_template: to.stamp, grand_total: snap.grandTotal, updated_by: me.id, updated_at: new Date().toISOString(),
    }).eq("id", id).eq("status", p.status).eq("template", from.stamp);
    if (error) throw new HttpError(400, error.message);
    await db.from("activity").insert({
      project_id: id, by: me.id, dept: deptLabel,
      action: `Moved the draft to the master template of ${to.templateModified ?? to.stamp}`,
      comment: [`${moved.length} input(s) carried over`, dropped.length ? `not carried (value no longer offered): ${dropped.join(", ")}` : "", ratesLost > 0 ? `${ratesLost} project rate(s) had no matching item` : ""].filter(Boolean).join("; "),
      details: { kind: "template", from: from.stamp, to: to.stamp, dropped },
    });
    return Response.json({ ok: true, moved: moved.length, dropped, ratesLost, grandTotal: snap.grandTotal });
  } catch (err) {
    return errorResponse(err);
  }
}
