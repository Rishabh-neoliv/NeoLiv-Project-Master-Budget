// Master templates: checking a newly uploaded master workbook against the current one, and adding it.
// The workbook goes to the private "templates" bucket; its model (formulas, values, rate rows) to the templates table.
import "server-only";
import { isNum, rateIndex, snapshot, type Model } from "@/lib/budget";
import { buildModel, formChanges, parseWorkbook, recalcCheck, type TplModel } from "@/lib/template-import";
import { createAdminClient } from "@/lib/supabase/admin";
import { HttpError, loadTemplateXlsx } from "./data";

type Db = ReturnType<typeof createAdminClient>;
export const INCOMING = "incoming/";

export interface RateChange { sheet: string; item: string; loc: string; from: number | null; to: number | null }
export interface TemplateReport {
  stamp: string; label: string; source: string;
  errors: string[]; warnings: string[];
  formulas: number; recalcDiffs: { cell: string; excel: unknown; app: unknown }[];
  rates: { total: number; changed: RateChange[]; added: string[]; removed: string[] };
  sample: { current: number | null; next: number | null; currentStamp: string; currentLabel: string };
  exists: boolean;
}

async function currentTemplate(db: Db) {
  const { data } = await db.from("templates").select("stamp, model, modified").eq("is_current", true).single();
  if (!data) throw new HttpError(500, "There's no current master template.");
  return { stamp: data.stamp as string, model: { ...(data.model as Model), stamp: data.stamp as string }, label: (data.modified as string) || (data.stamp as string) };
}

/** Builds the new template's model and checks it, without saving anything. */
export async function checkTemplate(db: Db, bytes: Uint8Array, source: string): Promise<{ report: TemplateReport; model: TplModel }> {
  const cur = await currentTemplate(db);
  let wb;
  try { wb = await parseWorkbook(bytes); } catch { throw new HttpError(400, "That file couldn't be opened as an Excel workbook (.xlsx)."); }
  const prevWb = await parseWorkbook(await loadTemplateXlsx(cur.stamp));
  const { model, errors, warnings } = buildModel(cur.model as unknown as TplModel, wb, source);

  // the input form is set up for the current layout of the input sheets
  const moved = formChanges(cur.model as unknown as TplModel, prevWb, wb);
  if (moved.length) errors.push(`The input sheets' layout changed (${moved.length} label(s) moved, added or renamed), e.g. ${moved.slice(0, 4).join("; ")}. `
    + "The Assumptions form would write into the wrong cells, so this template needs the form updated by the developer first.");

  // the app's engine must give exactly what Excel gives, cell by cell
  const rc = errors.length ? { checked: 0, diffs: [] } : recalcCheck(model);
  if (rc.diffs.length) errors.push(`${rc.diffs.length} formula(s) give a different result in the app than in Excel (first: ${rc.diffs[0].cell}). The app would cost projects differently from the workbook.`);

  // what changes against the current template
  const next = model as unknown as Model;
  let rates: TemplateReport["rates"] = { total: 0, changed: [], added: [], removed: [] };
  let sample: TemplateReport["sample"] = { current: null, next: null, currentStamp: cur.stamp, currentLabel: cur.label };
  if (!errors.length) {
    // matched by sheet + item name; items with the same name (two "Excavation - Hard Rock" lines) in order
    const keyed = (list: ReturnType<typeof rateIndex>) => {
      const seen = new Map<string, number>();
      return new Map(list.map((r) => {
        const k = `${r.sheet}|${r.item}`, n = (seen.get(k) ?? 0) + 1;
        seen.set(k, n);
        return [n > 1 ? `${k}|${n}` : k, r] as const;
      }));
    };
    const before = keyed(rateIndex(cur.model)), after = keyed(rateIndex(next));
    const val = (m: Model, ref: string) => { const i = ref.lastIndexOf("!"); const v = m.cells[ref.slice(0, i)]?.[ref.slice(i + 1)]?.v; return isNum(v) ? v : null; };
    for (const [k, r] of after) {
      const old = before.get(k);
      if (!old) continue;
      for (const [loc, ref] of Object.entries(r.cells)) {
        const from = old.cells[loc] ? val(cur.model, old.cells[loc]) : null, to = val(next, ref);
        if (from !== to && !(from !== null && to !== null && Math.abs(from - to) < 1e-9)) rates.changed.push({ sheet: r.sheet, item: r.item, loc, from, to });
      }
    }
    const named = (r: { sheet: string; item: string }) => `${r.sheet} – ${r.item}`;
    rates = { total: after.size, changed: rates.changed, added: [...after].filter(([k]) => !before.has(k)).map(([, r]) => named(r)), removed: [...before].filter(([k]) => !after.has(k)).map(([, r]) => named(r)) };
    // the same sample project (the new workbook's sample inputs) costed on both
    const inputs = next.defaults as Record<string, unknown>;
    sample = { current: snapshot(cur.model, inputs).grandTotal, next: snapshot(next, inputs).grandTotal, currentStamp: cur.stamp, currentLabel: cur.label };
  }
  const { data: exists } = await db.from("templates").select("stamp").eq("stamp", model.stamp).maybeSingle();
  if (exists) errors.push(`A template saved at ${String(model.templateModified)} is already loaded (${model.stamp}). Save the workbook again in Excel if it has changed.`);

  return {
    model,
    report: { stamp: model.stamp, label: String(model.templateModified), source, errors, warnings, formulas: rc.checked, recalcDiffs: rc.diffs.slice(0, 20), rates, sample, exists: !!exists },
  };
}

/** Makes one template the one new projects and "Move to the new template" use. */
export async function makeCurrent(db: Db, stamp: string) {
  const { data: t } = await db.from("templates").select("stamp").eq("stamp", stamp).maybeSingle();
  if (!t) throw new HttpError(404, "Template not found.");
  // one current at a time (unique index): clear the old one, then set the new one
  const { error: e1 } = await db.from("templates").update({ is_current: false }).eq("is_current", true).neq("stamp", stamp);
  if (e1) throw new HttpError(400, e1.message);
  const { error: e2 } = await db.from("templates").update({ is_current: true }).eq("stamp", stamp);
  if (e2) throw new HttpError(400, e2.message);
}
