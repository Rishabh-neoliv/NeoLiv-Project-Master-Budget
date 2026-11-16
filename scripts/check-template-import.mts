// Checks lib/template-import.ts (the Master templates upload) against the 16 legacy templates in _legacy/bundle:
// each workbook is read and built into a model (with the template before it as the base) and compared with the
// model the old app used, then every formula is recalculated with the engine and compared with Excel's values.
//   node scripts/check-template-import.mts
// Where the old app's input form didn't change between two versions, the built model must be identical; where it
// did (new input fields, set up by hand), only the cells/sample values for those fields may differ.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const { parseWorkbook, buildModel, recalcCheck } = await import(pathToFileURL(path.join(root, "lib/template-import.ts")).href);
const bundle = path.join(root, "_legacy", "bundle");
const stamps = Object.keys(JSON.parse(fs.readFileSync(path.join(bundle, "templates.json"), "utf8")).versions);
const load = (s: string) => JSON.parse(fs.readFileSync(path.join(bundle, "models", s + ".json"), "utf8"));
const same = (a: unknown, b: unknown) => (typeof a === "number" && typeof b === "number" ? Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a)) : JSON.stringify(a ?? null) === JSON.stringify(b ?? null));

let bad = 0;
for (let i = 1; i < stamps.length; i++) {
  const prev = load(stamps[i - 1]), want = load(stamps[i]);
  const formSame = JSON.stringify(prev.sections) === JSON.stringify(want.sections);
  const wb = await parseWorkbook(fs.readFileSync(path.join(bundle, "templates", stamps[i] + ".xlsx")));
  const { model, errors } = buildModel(prev, wb, want.source);
  let cellDiffs = 0;
  for (const [s, cs] of Object.entries(want.cells as Record<string, Record<string, { v?: unknown; f?: string }>>)) {
    for (const [a, c] of Object.entries(cs)) {
      if (c.v === null && !c.f) continue;
      const x = model.cells[s]?.[a];
      if (!x || !same(c.v, x.v) || (c.f ?? null) !== (x.f ?? null)) cellDiffs++;
    }
    for (const a of Object.keys(model.cells[s] ?? {})) if (!(a in cs)) cellDiffs++;
  }
  const rowsSame = JSON.stringify(model.rates.map((r: { rows: number[] }) => r.rows)) === JSON.stringify((want.rates ?? []).map((r: { rows: number[] }) => r.rows));
  const layoutSame = JSON.stringify(model.layout) === JSON.stringify(want.layout);
  const rc = recalcCheck(model);
  // must hold for every version: same Master Budget rows, every formula equal to Excel, no errors;
  // and where the form didn't change: identical cells and sample values
  const ok = !errors.length && layoutSame && rc.diffs.length === 0 && (!formSame || (cellDiffs === 0 && same(JSON.stringify(Object.entries(model.defaults).sort()), JSON.stringify(Object.entries(want.defaults).sort()))));
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "DIFF"} ${stamps[i]}  form ${formSame ? "same" : "changed"}, cell diffs ${cellDiffs}, rate rows ${rowsSame ? "same" : "differ"}, ${rc.checked} formulas / ${rc.diffs.length} differ from Excel${errors.length ? ", errors: " + errors.join("; ") : ""}`);
}
console.log(`${stamps.length - 1} templates checked, ${bad} with problems`);
process.exit(bad ? 1 : 0);
