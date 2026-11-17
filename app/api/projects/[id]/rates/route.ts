// PUT /api/projects/:id/rates  { rates: { "Roadwork!O27": 2550, ... } }
// Project rates that replace the master Excel's rates for this project only. The working draft changes;
// frozen revisions never do. Each change is listed in the history.
import { z } from "zod";
import { inr, isNum, masterRate, rateIndex, rateName, snapshot } from "@/lib/budget";
import { errorResponse, HttpError, readJson, loadModel, requireMember } from "@/lib/server/data";
import { canEditRates, revLabel } from "@/lib/workflow";

const Body = z.object({ rates: z.record(z.string().regex(/^[^!]+![A-Z]+\d+$/), z.number().finite().nonnegative()) });

export async function PUT(req: Request, ctx: RouteContext<"/api/projects/[id]/rates">) {
  try {
    const { id } = await ctx.params;
    const { db, me, project: p, myDepts, deptLabel } = await requireMember(id);
    if (!canEditRates(p.status, myDepts)) throw new HttpError(403, "Rates can be changed by the project's team while a draft is open. Start a new version first.");
    const { rates: raw } = Body.parse(await readJson(req));
    const m = await loadModel(p.template);
    const known = new Set(rateIndex(m).flatMap((r) => Object.values(r.cells)));
    // keep only real rate cells, and drop values equal to the master (they aren't project rates)
    const rates = Object.fromEntries(Object.entries(raw).filter(([ref, v]) => known.has(ref) && masterRate(m, ref) !== v));
    const saved = (p.rates || {}) as Record<string, number>;
    const fmt = (x: unknown) => (isNum(x) ? inr(x, Number.isInteger(x) ? 0 : 2) : "master");
    const changes = [...new Set([...Object.keys(saved), ...Object.keys(rates)])].filter((ref) => saved[ref] !== rates[ref])
      .map((ref) => ({ cell: ref, label: rateName(m, ref), from: saved[ref] ?? masterRate(m, ref), to: rates[ref] ?? masterRate(m, ref) }));
    if (!changes.length) return Response.json({ ok: true, unchanged: true });

    const snap = snapshot(m, { ...m.defaults, ...p.inputs }, rates);
    const { error } = await db.from("projects").update({ rates, rates_template: m.stamp, grand_total: snap.grandTotal, updated_by: me.id, updated_at: new Date().toISOString() }).eq("id", id).eq("status", p.status);
    if (error) throw new HttpError(400, error.message);
    const shown = changes.slice(0, 12).map((c) => `${c.label}: ${fmt(c.from)} → ${fmt(c.to)}`).join("; ") + (changes.length > 12 ? `; and ${changes.length - 12} more` : "");
    await db.from("activity").insert({ project_id: id, by: me.id, dept: deptLabel, action: `Changed ${changes.length} rate(s) – ${revLabel(p.status, p.last_rev)} updated`, comment: shown, rev: null, details: { changes, kind: "rates" } });
    return Response.json({ ok: true, grandTotal: snap.grandTotal });
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: "Rates must be numbers of 0 or more." }, { status: 400 });
    return errorResponse(err);
  }
}
