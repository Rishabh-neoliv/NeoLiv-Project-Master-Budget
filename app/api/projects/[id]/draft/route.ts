// PUT /api/projects/:id/draft  { inputs, submit?, note? }
// Saves the working draft, or submits it to the next department. R0 freezes on Base Line's submit.
import { z } from "zod";
import { cleanInputs, missingInputs, snapshot } from "@/lib/budget";
import { errorResponse, HttpError, loadModel, requireMember } from "@/lib/server/data";
import { notify } from "@/lib/server/email";
import { freezeVersion } from "@/lib/server/freeze";
import { canEditDraft, canSubmit, dn, EDITABLE, editDept, nextRev, STATUS, SUBMIT_TO } from "@/lib/workflow";

const Body = z.object({
  /** the fields this person changed (the screen sends only those, so two people editing at once don't undo each other) */
  inputs: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  submit: z.boolean().optional(),
  note: z.string().max(2000).optional(),
  /** where applied values came from, e.g. "MOM - Sonipat.xlsx (AI)", for the history */
  source: z.string().max(300).optional(),
});

export async function PUT(req: Request, ctx: RouteContext<"/api/projects/[id]/draft">) {
  try {
    const { id } = await ctx.params;
    const { db, me, project: p, team, myDepts, actorDepts, deptLabel } = await requireMember(id);
    const body = Body.parse(await req.json());
    // anyone on the team can save changes while a draft is open; submitting stays with the department whose turn it is
    if (!canEditDraft(p.status, myDepts)) throw new HttpError(403, `R${p.last_rev ?? 0} is approved and frozen. Start a new version to make changes.`);
    if (body.submit && !canSubmit(p.status, myDepts)) {
      const [label, holder] = STATUS[p.status];
      throw new HttpError(403, EDITABLE.has(p.status)
        ? `Only ${dn(editDept(p.status))} can submit the draft now, while it's their turn. You can still save changes.`
        : p.status === "WITH_MGMT" ? "The draft is with Management: they approve it or send it back to Operations."
        : holder ? `The project is ${label.toLowerCase()}: ${dn(holder)} has to start their work before it can be submitted.` : "This draft can't be submitted now.");
    }

    const m = await loadModel(p.template);
    // only the template's own input cells are accepted, everything else keeps the saved value
    const allowed = new Set(m.sections.flatMap((s) => s.fields.filter((f) => f.kind !== "calc").map((f) => f.cell)));
    const inputs = cleanInputs({ ...m.defaults, ...p.inputs, ...Object.fromEntries(Object.entries(body.inputs).filter(([k]) => allowed.has(k))) });
    if (body.submit) {
      const missing = missingInputs(m, inputs);
      if (missing.length) throw new HttpError(400, `Fill in every input first. Still empty: ${missing.slice(0, 6).map((f) => f.label).join(", ")}${missing.length > 6 ? ` and ${missing.length - 6} more` : ""}.`);
    }
    const rates = p.rates || {};
    const snap = snapshot(m, inputs, rates);
    const now = new Date().toISOString();
    // the region follows the Location input when it is one of the regions (NCR / MMR), so the project is listed there
    const region = inputs.C8 === "NCR" || inputs.C8 === "MMR" ? { region: inputs.C8 } : {};
    const common = { inputs, rates, rates_template: m.stamp, grand_total: snap.grandTotal, location: inputs.C8 as string, acre: inputs.C9 as number, ...region, updated_by: me.id, updated_at: now, saved_at: now };
    const dept = editDept(p.status), rev = nextRev(p.last_rev);
    // field history: every input that changed in this save, with its label
    const before = { ...m.defaults, ...p.inputs } as Record<string, unknown>;
    const labels = new Map(m.sections.flatMap((s) => s.fields.map((f) => [f.cell, f.label] as const)));
    const changes = Object.entries(inputs).filter(([k, v]) => String(before[k] ?? "") !== String(v ?? "")).map(([cell, to]) => ({ cell, label: labels.get(cell) ?? cell, from: before[cell] ?? null, to }));
    const details = changes.length || body.source ? { changes, source: body.source ?? null } : null;

    if (!body.submit) {
      const { error } = await db.from("projects").update(common).eq("id", p.id).eq("status", p.status);
      if (error) throw new HttpError(400, error.message);
      await db.from("activity").insert({ project_id: p.id, by: me.id, dept: deptLabel, action: `Saved R${rev} draft${rev === 0 ? " (Base Line)" : ""}${changes.length ? `: ${changes.length} field(s) changed` : ""}${body.source ? ` from ${body.source}` : ""}`, rev, details });
      return Response.json({ ok: true, grandTotal: snap.grandTotal });
    }

    const [to, status, notifyKey] = SUBMIT_TO[dept]!;
    const reason = [p.revision_reason || (rev === 0 ? "Base Line" : dept === "BD" ? "" : dn(dept)), body.note?.trim()].filter(Boolean).join(" — ");
    let workbookError: string | null = null;
    if (rev === 0) {
      ({ workbookError } = await freezeVersion(db, { project: p, rev, m, snap, inputs, rates, reason, dept: dn(dept), by: me.id }));
      await db.from("projects").update({ ...common, status, last_rev: 0, revision_reason: "", base_total: snap.grandTotal }).eq("id", p.id);
    } else {
      // the status guard stops two people submitting the same step at once
      const { data, error } = await db.from("projects").update({ ...common, status }).eq("id", p.id).eq("status", p.status).select("id");
      if (error) throw new HttpError(400, error.message);
      if (!data?.length) throw new HttpError(409, "Someone else moved this project on. Reload to see its current state.");
    }
    await db.from("activity").insert({ project_id: p.id, by: me.id, dept: deptLabel,
      action: rev === 0 ? `Submitted R0 to ${dn(to)} – frozen as the Base Line` : `Submitted the R${rev} draft to ${dn(to)}`, comment: reason, rev, details });
    // the email's "Note" is what the person typed when submitting (approved templates), not the stored reason
    await notify({ key: notifyKey, project: { ...p, ...common, status }, rev, note: body.note?.trim() || undefined, actor: me, actorDepts, team });
    return Response.json({ ok: true, status, workbookError });
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: err.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    return errorResponse(err);
  }
}
