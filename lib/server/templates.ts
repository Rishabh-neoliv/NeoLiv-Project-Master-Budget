// Master templates: checking a newly uploaded master workbook against the current one, and adding it.
// The workbook goes to the private "templates" bucket; its model (formulas, values, rate rows) to the templates table.
import "server-only";
import { inputSheetOf, isNum, migrateInputs, rateIndex, sheetNow, snapshot, type Model } from "@/lib/budget";
import { anchorChanges, buildModel, formChanges, layoutOf, parseWorkbook, recalcCheck, type TplModel } from "@/lib/template-import";
import { V2_ANCHORS, v2Base } from "@/lib/template-forms";
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
  // which form the workbook is built on: the current template's, or (the first version-2 workbook, inputs on
  // "Project Inputs") the version-2 form defined in lib/template-forms.ts
  const layout = layoutOf(wb), curV2 = (cur.model as unknown as TplModel).sheetLayout === "V2";
  if (!layout) throw new HttpError(400, "This doesn't look like a master budget workbook: neither Project Inputs nor Assumptions has “LOCATION” in B8.");
  if (layout === "V1" && curV2) throw new HttpError(400, "This workbook has the older input layout (inputs on the Assumptions sheet), but the current master template is version 2 (inputs on Project Inputs). Upload a version-2 workbook.");
  const base = layout === "V2" && !curV2 ? (v2Base() as unknown as TplModel) : (cur.model as unknown as TplModel);
  const { model, errors, warnings } = buildModel(base, wb, source);

  // the input form writes into fixed cells: they must still hold what the form expects
  const moved = layout === "V2" ? anchorChanges(V2_ANCHORS, wb) : formChanges(cur.model as unknown as TplModel, await parseWorkbook(await loadTemplateXlsx(cur.stamp)), wb);
  if (moved.length) errors.push(`The input sheets' layout changed (${moved.length} label(s) moved, added or renamed), e.g. ${moved.slice(0, 4).join("; ")}. `
    + "The input form would write into the wrong cells, so this template needs the form updated by the developer first.");

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
        const k = `${sheetNow(r.sheet)}|${r.item}`, n = (seen.get(k) ?? 0) + 1;
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
    // the same sample project (the new workbook's sample inputs) costed on both; across input layouts the inputs
    // are carried by field name, as "Move to the new template" does
    const inputs = next.defaults as Record<string, unknown>;
    const onCurrent = inputSheetOf(cur.model) === inputSheetOf(next) ? inputs : migrateInputs(next, cur.model, inputs).inputs;
    sample = { current: snapshot(cur.model, onCurrent).grandTotal, next: snapshot(next, inputs).grandTotal, currentStamp: cur.stamp, currentLabel: cur.label };
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
