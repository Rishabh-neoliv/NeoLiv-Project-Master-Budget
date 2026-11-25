// Checks a "version 2" master workbook (inputs on Project Inputs) offline, the way Admin panel → Master templates
// will when it is uploaded, plus what the upload can't show:
//   npx jiti scripts/check-template-v2.mts "<path to the .xlsx>"
//   * layout, labels beside every input, sheets, rate tables, drop-downs (lib/template-forms.ts)
//   * every formula recalculated by the app's engine against Excel's saved values
//   * the workbook's sample project costed by the app (grand total = Excel's), Master Budget units
//   * a draft on the current (older) template moved onto it: what carries over, what starts fresh
//   * the frozen-revision Excel built from it, re-read: inputs landed on Project Inputs, same grand total
// Prints numbers only to this console; the workbook (real rates) never goes into git.
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { anchorChanges, buildModel, layoutOf, parseWorkbook, recalcCheck, type TplModel } from "../lib/template-import";
import { V2_ANCHORS, v2Base } from "../lib/template-forms";
import { amountUnitProblems, inputKey, marks, migrateInputs, rateIndex, snapshot, type Model } from "../lib/budget";
import workbookApi from "../lib/engine/workbook.js";
import engineApi from "../lib/engine/budget-engine.js";

const file = process.argv[2];
if (!file || !fs.existsSync(file)) { console.error("Give the path of a version-2 master workbook (.xlsx)."); process.exit(2); }
const root = path.resolve(import.meta.dirname, "..");
let bad = 0;
const check = (label: string, ok: boolean, more = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${label}${more ? " " + more : ""}`); if (!ok) bad++; };

const bytes = fs.readFileSync(file);
const wb = await parseWorkbook(bytes);
check("layout is version 2 (LOCATION in Project Inputs!B8)", layoutOf(wb) === "V2", String(layoutOf(wb)));
const anchors = anchorChanges(V2_ANCHORS, wb);
check(`labels beside the ${Object.keys(V2_ANCHORS).length} inputs and headings`, !anchors.length, anchors.slice(0, 5).join("; "));

const { model, errors, warnings } = buildModel(v2Base() as unknown as TplModel, wb, path.basename(file));
check("model built without errors", !errors.length, errors.join(" | "));
for (const w of warnings) console.log("     warning:", w);
const m = model as unknown as Model;
console.log(`     stamp ${m.stamp}, ${m.layout.length} Master Budget rows, amounts in ${m.amounts ?? "rupees"}, ${m.notes?.length ?? 0} notes, ${wb.external.length} cells read other workbooks`);

const rc = recalcCheck(model);
check(`every formula recalculates like Excel (${rc.checked})`, !rc.diffs.length, rc.diffs.slice(0, 6).map((d) => `${d.cell}: Excel ${JSON.stringify(d.excel)} app ${JSON.stringify(d.app)}`).join("; "));

// the sample project, as the app costs it
const snap = snapshot(m, m.defaults);
const gtRow = marks(snap.master).gt, excelGT = wb.cells["Master Budget"]?.[`G${gtRow}`]?.v;
check("grand total of the sample = Excel's", typeof excelGT === "number" && snap.grandTotal !== null && Math.abs(snap.grandTotal - excelGT) < 1e-6, `app ${snap.grandTotal?.toFixed(4)} Cr, Excel ${typeof excelGT === "number" ? excelGT.toFixed(4) : excelGT} Cr`);
const raw = m.layout.map(({ row }) => ({ row, hidden: false, c: ["B", "C", "D", "E", "F", "G"].map((c) => (wb.cells["Master Budget"]?.[c + row]?.v ?? null) as never) }));
const units = m.amounts === "crore" ? amountUnitProblems(raw) : [];
check("Master Budget lines all in ₹ Cr with rupee rates", !units.length, units.slice(0, 6).join(", "));
// every line the app shows = Excel's amount (× 1 crore where the app keeps rupees)
const crore = marks(snap.master).crore;
const off = snap.master.filter((r) => {
  const x = wb.cells["Master Budget"]?.[`G${r.row}`]?.v, a = r.c[5];
  if (typeof x !== "number" || typeof a !== "number") return false;
  const want = m.amounts === "crore" && !crore.has(r.row) ? x * 1e7 : x;
  return Math.abs(a - want) > 1e-6 * Math.max(1, Math.abs(want));
});
check(`every Master Budget line as Excel's (${snap.master.length} rows)`, !off.length, off.slice(0, 6).map((r) => `row ${r.row}`).join(", "));
const road = snap.master.find((r) => String(r.c[1] ?? "").trim() === "Roadworks" || String(r.c[1] ?? "").trim().startsWith("Roadworks"));
console.log(`     e.g. Roadworks line: ₹ ${road && typeof road.c[5] === "number" ? (road.c[5] / 1e7).toFixed(3) : "?"} Cr (in the app: rupees)`);

// the form's fields: every input cell exists, drop-down samples are among the choices
const fields = m.sections.flatMap((s) => s.fields);
const missingCells = fields.filter((f) => { const k = inputKey(m, f.cell), i = k.lastIndexOf("!"); return f.kind !== "calc" && !f.optional && !wb.cells[k.slice(0, i)]?.[k.slice(i + 1)]; });
check(`form: ${fields.length} fields, every required input cell has a value`, !missingCells.length, missingCells.map((f) => `${f.label} (${f.cell})`).join(", "));

// rate tables
const rates = rateIndex(m);
const bySheet = rates.reduce<Record<string, number>>((a, r) => ((a[r.sheet] = (a[r.sheet] ?? 0) + 1), a), {});
check("rate rows found on every rate sheet", Object.keys(bySheet).length === (m.rates ?? []).length, JSON.stringify(bySheet));

// a draft on the current template (20261102-1146) moved onto this one
const oldModel = JSON.parse(fs.readFileSync(path.join(root, "_legacy/bundle/models/20261102-1146.json"), "utf8")) as Model;
oldModel.stamp = "20261102-1146";
const moved = migrateInputs(oldModel, m, { ...oldModel.defaults });
const after = snapshot(m, moved.inputs);
check("an old draft moves across and costs", after.grandTotal !== null && Number.isFinite(after.grandTotal), `${moved.moved.length} carried, new from the template: ${moved.fresh.join(", ") || "none"}; not carried: ${moved.dropped.join(", ") || "none"}; total ${after.grandTotal?.toFixed(2)} Cr`);

// the frozen-revision Excel: inputs written on Project Inputs as constants (as lib/server/workbook.ts does)
const inputs = { ...m.defaults, C9: 25 } as Record<string, unknown>;
const eng = new engineApi.BudgetEngine(m);
const keyed: Record<string, unknown> = {};
for (const [k, v] of Object.entries(inputs)) keyed[inputKey(m, k)] = v;
eng.setInputs(keyed);
const overrides: Record<string, Record<string, unknown>> = {};
for (const [k, v] of Object.entries(inputs)) { const kk = inputKey(m, k), i = kk.lastIndexOf("!"); (overrides[kk.slice(0, i)] ||= {})[kk.slice(i + 1)] = v; }
const out = await workbookApi.buildWorkbook(JSZip, bytes, eng, {}, { projectName: "Check", history: [], overrides, clean: true, outputType: "uint8array" });
const back = await parseWorkbook(out as Uint8Array);
const want = snapshot(m, inputs).grandTotal;
check("Excel download: area written to Project Inputs!C9", back.cells["Project Inputs"]?.C9?.v === 25, String(back.cells["Project Inputs"]?.C9?.v));
check("Excel download: grand total = the app's", typeof back.cells["Master Budget"]?.[`G${gtRow}`]?.v === "number" && Math.abs((back.cells["Master Budget"][`G${gtRow}`].v as number) - (want ?? NaN)) < 1e-6, `${(back.cells["Master Budget"]?.[`G${gtRow}`]?.v as number)?.toFixed?.(4)} vs ${want?.toFixed(4)}`);

console.log(bad ? `\n${bad} check(s) failed` : "\nall checks passed");
process.exit(bad ? 1 : 0);
