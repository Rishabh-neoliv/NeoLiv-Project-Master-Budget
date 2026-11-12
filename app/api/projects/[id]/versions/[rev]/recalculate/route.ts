// POST /api/projects/:id/versions/:rev/recalculate  { reason }
// Recalculates a frozen revision that was costed on an older master template with the current one, as the
// original app's "Recalculate R<n> with the current template": the revision keeps its own inputs (carried
// by field name) and project rates (by sheet + item); only the calculation rules change. Base Line only
// (or the admin). The old total and template are kept in the Activity log.
import { z } from "zod";
import { crore, migrateInputs, migrateRates, snapshot, type Model } from "@/lib/budget";
import { errorResponse, HttpError, loadModel, requireMember, type VersionRow } from "@/lib/server/data";
import { rebuildWorkbook } from "@/lib/server/freeze";
import { hasDraft } from "@/lib/workflow";

const Body = z.object({ reason: z.string().trim().min(1, "Give a reason for recalculating.").max(500) });

export async function POST(req: Request, ctx: RouteContext<"/api/projects/[id]/versions/[rev]/recalculate">) {
  try {
    const { id, rev: revText } = await ctx.params;
    const rev = Number(revText);
    if (!Number.isInteger(rev) || rev < 0) throw new HttpError(400, "Unknown revision.");
    const { reason } = Body.parse(await req.json());
    const { db, me, project: p, myDepts, deptLabel } = await requireMember(id);
    if (!myDepts.includes("BD")) throw new HttpError(403, "Only Base Line can recalculate a frozen revision.");

    const { data: v } = await db.from("versions").select("*").eq("project_id", id).eq("rev", rev).single();
    if (!v) throw new HttpError(404, `R${rev} isn't frozen.`);
    const version = v as VersionRow;
    const to = await loadModel();
    if (version.template === to.stamp) throw new HttpError(400, `R${rev} is already on the current master template.`);
    let from: Model = to;
    if (version.template) { try { from = await loadModel(version.template); } catch { from = to; } }

    const { inputs } = migrateInputs(from, to, { ...from.defaults, ...version.inputs });
    const rates = migrateRates(from, to, (version.rates || {}) as Record<string, number>);
    const snap = snapshot(to, inputs, rates);
    const q = db.from("versions").update({
      inputs, rates, master: snap.master, calc: snap.calc, grand_total: snap.grandTotal, template: to.stamp,
    }).eq("project_id", id).eq("rev", rev);
    // only if nobody recalculated it meanwhile
    const { data: updated, error } = await (version.template ? q.eq("template", version.template) : q.is("template", null)).select("*").maybeSingle();
    if (error) throw new HttpError(400, error.message);
    if (!updated) throw new HttpError(409, `R${rev} changed meanwhile. Reload the page and try again.`);

    // the project's own totals follow: R0 is the baseline; the newest revision is the project total when
    // there's no working draft
    const fields: Record<string, unknown> = {};
    if (rev === 0) fields.base_total = snap.grandTotal;
    if (rev === p.last_rev && !hasDraft(p.status)) Object.assign(fields, { grand_total: snap.grandTotal, template: to.stamp, rates, rates_template: to.stamp });
    if (Object.keys(fields).length) await db.from("projects").update({ ...fields, updated_by: me.id, updated_at: new Date().toISOString() }).eq("id", id);

    const { data: tpl } = await db.from("templates").select("modified").eq("stamp", to.stamp).maybeSingle();
    await db.from("activity").insert({
      project_id: id, by: me.id, dept: deptLabel, rev,
      action: `Recalculated R${rev} with the master template of ${tpl?.modified ?? to.stamp}`,
      comment: `${reason} – ${crore(version.grand_total)} → ${crore(snap.grandTotal)}`,
      details: { kind: "recalc", from: version.template, to: to.stamp, fromTotal: version.grand_total, toTotal: snap.grandTotal },
    });
    const workbookError = await rebuildWorkbook(db, { ...p, ...fields } as typeof p, updated as VersionRow);
    return Response.json({ ok: true, fromTotal: version.grand_total, toTotal: snap.grandTotal, workbookError });
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: err.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    return errorResponse(err);
  }
}
