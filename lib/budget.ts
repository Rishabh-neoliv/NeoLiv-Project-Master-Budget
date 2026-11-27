// Budget calculations shared by the browser (live preview) and the server (freezing a version).
// Ported from the original app's script without changing the logic: snapshot(), rowKind(), marks() ...
import engineApi from "./engine/budget-engine";

const { BudgetEngine, isErr } = engineApi;

export type CellValue = string | number | boolean | null | { e: string };

export interface Field {
  cell: string;
  label: string;
  kind: "select" | "number" | "percent" | "calc";
  unit?: string;
  note?: string;
  options?: (string | number)[];
  optional?: boolean;
  fmt?: string;
  group?: string;
  detail?: string;
  unit_cell?: string;
  length?: string;
  [k: string]: unknown;
}
export interface Section { title: string; fields: Field[] }
export interface Model {
  stamp: string;
  sections: Section[];
  defaults: Record<string, CellValue>;
  layout: { row: number; hidden: boolean }[];
  rates?: unknown[];
  cells: Record<string, Record<string, { v?: unknown; f?: string }>>;
  /** where the plain input cells are (inputSheetOf): "Assumptions" if missing; version 2: "Project Inputs" */
  inputSheet?: string;
  /** "crore" when the Master Budget's amounts are in ₹ crore (version 2) */
  amounts?: string;
  /** the master workbook's own notes (version 2's Assumptions sheet), shown beside the inputs */
  notes?: { area: string; item: string; text: string }[];
  [k: string]: unknown;
}
export interface MasterRow { row: number; hidden: boolean; c: CellValue[] }
export interface Snapshot {
  master: MasterRow[];
  calc: Record<string, CellValue>;
  grandTotal: number | null;
  costPerAcre: CellValue | undefined;
  infra: CellValue | undefined;
  nonInfra: number | null;
}

export const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
export const isErrV = (v: unknown): v is { e: string } => !!v && typeof v === "object" && "e" in (v as object);
const plain = (v: unknown): CellValue => (isErr(v) ? { e: v.code } : (v as CellValue));

/** The sheet a template's plain input cells ("C8") are on: "Assumptions" until the master workbook of 25 Nov 2026
 *  ("version 2"), which moved them to "Project Inputs" (and uses "Assumptions" for notes). Cells on other sheets
 *  are always named in full ("Additional Inputs!C6"). */
export const inputSheetOf = (m: { inputSheet?: unknown }) => (typeof m.inputSheet === "string" && m.inputSheet ? m.inputSheet : "Assumptions");
export const inputKey = (m: { inputSheet?: unknown }, cell: string) => (cell.includes("!") ? cell : `${inputSheetOf(m)}!${cell}`);
/** A sheet name as a formula writes it: quoted when it has spaces or symbols ('Project Inputs'!B21). */
export const sheetRef = (sheet: string) => (/^[A-Za-z_][\w.]*$/.test(sheet) ? sheet : `'${sheet.replace(/'/g, "''")}'`);

export function engineFor(m: Model, inputs: Record<string, unknown>, rates: Record<string, unknown> = {}) {
  const eng = new BudgetEngine(m);
  const keyed: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(inputs)) keyed[inputKey(m, k)] = v;
  Object.assign(keyed, rates || {});
  eng.setInputs(keyed);
  return eng;
}

// "Roadwork!E8", or "C12" on the template's input sheet
export function readRef(eng: InstanceType<typeof BudgetEngine>, ref: string, inputSheet = "Assumptions") {
  const i = ref.lastIndexOf("!");
  return i < 0 ? eng.value(inputSheet, ref) : eng.value(ref.slice(0, i).replace(/^'|'$/g, ""), ref.slice(i + 1));
}

/** Sheets renamed between master workbooks (old name → new name), so project rates and comparisons follow them. */
export const SHEET_RENAMES: Record<string, string> = { Roadwork: "Roadworks", "Water Supply": "PHE", "Landscape & Amenities": "Signage + Furniture" };
export const sheetNow = (s: string) => SHEET_RENAMES[s] ?? s;

// Master Budget landmarks are found by their labels: row numbers differ between template versions. Version 2 added
// letters to some ("INFRA COST - TOTAL (A)", "TOTAL COC (A + B)"); they're ignored when matching.
const CRORE_LABELS = new Set(["Infra Cost/ Acre", "Non Infra Cost/ Acre", "Retaining Wall + Plot Levelling Cost/ Acre", "OSBL Cost/ Acre", "TOTAL COC", "Cost/ Acre", "ADD: 5% for Contingencies", "GRAND TOTAL - COC"]);
const landmark = (s: string) => s.replace(/\s*\([A-Z](?:\s*\+\s*[A-Z])*\)\s*$/, "").trim();
export interface Marks { gt: number | null; infra: number | null; noninfra: number | null; coc: number | null; cont: number | null; cpa: number | null; crore: Set<number>; divider: number | null; acre: CellValue | null }
const marksCache = new WeakMap<MasterRow[], Marks>();

export function rowKind(r: MasterRow): "skip" | "total" | "head" | "item" {
  const c = r.c;
  if (r.row < 5) return "skip";
  if (typeof c[0] === "string" && !/^\s*\d+\s*$/.test(c[0]) && (c[1] === null || c[1] === "")) return "total";
  const sr = c[0];
  if ((typeof sr === "number" && Number.isInteger(sr)) || (typeof sr === "string" && /^\s*\d+\s*$/.test(sr))) return "head";
  if (isNum(c[3]) || isNum(c[5]) || isErrV(c[5])) return "item";
  return "skip";
}

export function marks(master: MasterRow[]): Marks {
  const hit = marksCache.get(master);
  if (hit) return hit;
  const lab = (r: MasterRow) => (typeof r.c[0] === "string" ? landmark(r.c[0]) : "");
  const find = (l: string) => master.find((r) => lab(r) === l)?.row ?? null;
  const gt = find("GRAND TOTAL - COC"), infra = find("INFRA COST - TOTAL"), noninfra = find("Non Infra - TOTAL"), coc = find("TOTAL COC");
  const out: Marks = {
    gt, infra, noninfra, coc,
    cont: master.find((r) => rowKind(r) === "total" && /contingenc/i.test(lab(r)))?.row ?? null,
    cpa: gt === null ? null : master.find((r) => r.row > gt && lab(r) === "Cost/ Acre")?.row ?? null,
    crore: new Set(master.filter((r) => rowKind(r) === "total" && CRORE_LABELS.has(lab(r))).map((r) => r.row)),
    divider: infra === null ? null : master.find((r) => r.row > infra && rowKind(r) === "head")?.row ?? null,
    acre: master.find((r) => /project area/i.test(lab(r)))?.c?.[2] ?? null,
  };
  marksCache.set(master, out);
  return out;
}

/** Version 2's Master Budget has its amounts (column G) in ₹ crore, rates (F) in rupees. The app works in rupees,
 *  with only the cost of construction block (CRORE_LABELS) in crores, as the earlier workbooks had it. Lines the
 *  template check found in the other unit (model.rupeeAmountRows / croreRateRows, to be fixed in Excel) are put
 *  right here too. */
function amountsInRupees(m: Model, master: MasterRow[]) {
  const crore = marks(master).crore;
  const rupeeRows = new Set((m.rupeeAmountRows as number[] | undefined) ?? []), croreRates = new Set((m.croreRateRows as number[] | undefined) ?? []);
  // a listed line is put right only while its amount is still quantity × rate: a template that carried an earlier
  // template's list (fixed in Excel since, as 3.4 did) must not have its rates multiplied by a crore again
  const mixed = (r: MasterRow) => { const [, , , q, rate, amt] = r.c; return isNum(q) && isNum(rate) && isNum(amt) && q * rate !== 0 && Math.abs(amt / (q * rate) - 1) < 0.01; };
  for (const r of master) {
    const fix = (rupeeRows.has(r.row) || croreRates.has(r.row)) && mixed(r);
    if (croreRates.has(r.row) && fix && isNum(r.c[4])) r.c[4] = r.c[4] * 1e7;
    if (isNum(r.c[5]) && r.c[5] !== 0 && !crore.has(r.row) && !(rupeeRows.has(r.row) && fix)) r.c[5] = r.c[5] * 1e7;
  }
  marksCache.delete(master);
}

/** Lines of a ₹-crore Master Budget whose amount isn't quantity × rupee rate ÷ 1 crore but quantity × rate (an
 *  amount still in rupees, or a rate in crores). Checked on the workbook's own sample values. */
export function amountUnitProblems(master: MasterRow[]) {
  const out: string[] = [];
  for (const r of master) {
    const [, item, , qty, rate, amt] = r.c;
    if (!isNum(qty) || !isNum(rate) || !isNum(amt) || qty * rate === 0 || amt === 0) continue;
    if (Math.abs((amt * 1e7) / (qty * rate) / 1e7 - 1) < 0.01) out.push(`row ${r.row} (${String(item ?? r.c[0] ?? "").trim()})`);
  }
  return out;
}

export function snapshot(m: Model, inputs: Record<string, unknown>, rates: Record<string, unknown> = {}): Snapshot {
  const eng = engineFor(m, inputs, rates);
  const master = m.layout.map(({ row, hidden }) => ({ row, hidden, c: ["B", "C", "D", "E", "F", "G"].map((col) => plain(eng.value("Master Budget", col + row))) }));
  if (m.amounts === "crore") amountsInRupees(m, master);
  const calc: Record<string, CellValue> = {};
  const sheet = inputSheetOf(m);
  for (const sec of m.sections) for (const f of sec.fields) {
    if (f.kind === "calc") calc[f.cell] = plain(readRef(eng, f.cell, sheet));
    for (const k of ["detail", "unit_cell", "length"] as const) { const ref = f[k]; if (typeof ref === "string") calc[ref] = plain(readRef(eng, ref, sheet)); }
  }
  const g = (r: number | null) => master.find((x) => x.row === r)?.c[5];
  const mk = marks(master);
  const gtv = g(mk.gt), coc = g(mk.coc), inf = g(mk.infra);
  const nonInfra = mk.noninfra !== null ? (g(mk.noninfra) as number) : isNum(coc) && isNum(inf) ? coc * 1e7 - inf : null;
  return { master, calc, grandTotal: isNum(gtv) ? gtv : null, costPerAcre: g(mk.cpa), infra: inf, nonInfra };
}

/** How the grand total is made up, from the Master Budget's own lines (₹ Cr): Total COC (A + B) + contingencies =
 *  Grand total; with perAcre, each divided by the project area, as the Cost / Acre column shows them. */
export function grandTotalLines(master: MasterRow[], perAcre = false): [string, number][] | null {
  const mk = marks(master), row = (r: number | null) => master.find((x) => x.row === r);
  const parts = [mk.coc, mk.cont, mk.gt].map(row), acre = mk.acre;
  if (parts.some((r) => !r || !isNum(r.c[5])) || (perAcre && !(isNum(acre) && acre > 0))) return null;
  return parts.map((r) => [String(r!.c[0]).trim(), (r!.c[5] as number) / (perAcre ? (acre as number) : 1)]);
}

/** The contingency the master template adds on the cost of construction ("ADD: 5% for Contingencies"). Used where
 *  only a project's grand total is stored (the project list) to show the total before it. */
export const CONTINGENCY = 0.05;

/** A frozen revision as a Snapshot, from the values stored when it froze (never recalculated). */
export function snapFromVersion(v: { master: MasterRow[]; calc?: Record<string, CellValue> | null; grand_total: number | null }): Snapshot {
  const g = (r: number | null) => v.master.find((x) => x.row === r)?.c[5];
  const mk = marks(v.master);
  const coc = g(mk.coc), inf = g(mk.infra);
  const nonInfra = mk.noninfra !== null ? (g(mk.noninfra) as number) : isNum(coc) && isNum(inf) ? coc * 1e7 - inf : null;
  return { master: v.master, calc: v.calc ?? {}, grandTotal: v.grand_total, costPerAcre: g(mk.cpa), infra: inf, nonInfra };
}

export function problems(snap: Snapshot) {
  const gaps: { section: CellValue; item: CellValue; qty: number; uom: CellValue }[] = [];
  const errors: { section: CellValue; item: CellValue; code: string }[] = [];
  let section: CellValue = "";
  for (const r of snap.master) {
    const k = rowKind(r);
    if (k === "head") section = r.c[1] || r.c[0];
    if (k !== "item") continue;
    const [, item, uom, qty, rate, total] = r.c;
    if (isErrV(total)) errors.push({ section, item, code: total.e });
    else if (isNum(qty) && qty > 0 && !(isNum(rate) && rate > 0)) gaps.push({ section, item, qty, uom });
  }
  return { gaps, errors };
}

export const isOptional = (m: Model, cell: string) => m.sections.some((s) => s.fields.some((f) => f.cell === cell && f.optional));

export function cleanInputs(d: Record<string, unknown>) {
  const o: Record<string, CellValue> = {};
  for (const [k, v] of Object.entries(d)) o[k] = Number.isNaN(v) ? null : (v as CellValue);
  return o;
}

export function parseInput(f: Field, raw: unknown): CellValue {
  const s = String(raw ?? "").trim();
  if (s === "") return null;
  if (f.kind === "percent") { const n = Number(s); return Number.isFinite(n) ? n / 100 : NaN; }
  if (f.kind === "number") { const n = Number(s); return Number.isFinite(n) ? n : NaN; }
  return /^-?\d+$/.test(s) ? parseInt(s, 10) : s; // numeric drop-downs (0..10 Nos) go in as numbers
}

export function fmtInput(f: Field, v: CellValue): string {
  if (v === null || v === undefined) return "";
  if (f.kind === "percent" && isNum(v)) return String(+(v * 100).toFixed(4));
  return String(v);
}

// ------------------------------------------------------------------ formatting
export function inr(v: unknown, dec = 0) {
  return isNum(v) ? v.toLocaleString("en-IN", { minimumFractionDigits: dec, maximumFractionDigits: dec }) : "";
}
export function numCell(v: CellValue | undefined) {
  if (isErrV(v)) return v.e;
  if (!isNum(v)) return v === null || v === undefined ? "" : String(v);
  return Number.isInteger(v) ? inr(v) : inr(v, 2);
}
export function fmtCalc(f: Field, v: CellValue | undefined) {
  if (isErrV(v)) return v.e;
  if (v === null || v === undefined || (typeof v === "string" && !v.trim())) return "–";
  if (f.fmt === "percent" && isNum(v)) return (v * 100).toFixed(2) + "%";
  return isNum(v) ? (Number.isInteger(v) ? inr(v) : inr(v, 2)) : String(v);
}
export const crore = (v: unknown, signed = false) =>
  // non-breaking spaces ( ): "₹ 42.79 Cr" stays on one line in narrow table columns
  isNum(v) ? `₹ ${signed && v > 0 ? "+" : ""}${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr` : "–";

// Lines matched across revisions by kind + label, so the Delta works when rows move between templates
export function lineKey(rows: MasterRow[]) {
  const seen: Record<string, number> = {};
  return Object.fromEntries(rows.map((r) => {
    const d = `${rowKind(r)}|${String(r.c[1] ?? r.c[0] ?? "").trim()}`;
    seen[d] = (seen[d] || 0) + 1;
    return [r.row, d + "#" + seen[d]];
  })) as Record<number, string>;
}

// ------------------------------------------------------------------ rates (ported from the original app)
export interface RateRow { sheet: string; row: number; item: string; uom: string; cells: Record<string, string> }
interface RateTable { sheet: string; desc: string; uom?: string; rows: number[]; cols: Record<string, string> }
const rateIndexCache = new Map<string, RateRow[]>();
export const LOC_KEY = (loc: unknown) => String(loc || "").trim().toUpperCase();

/** Every rate row of a template: sheet, item, unit and the rate cell for each location. Cached per template. */
export function rateIndex(m: Model): RateRow[] {
  const hit = rateIndexCache.get(m.stamp);
  if (hit) return hit;
  const eng = engineFor(m, m.defaults), out: RateRow[] = [];
  const text = (sheet: string, a: string) => { const v = eng.value(sheet, a); return isErr(v) || v === null || v === undefined ? "" : String(v).trim(); };
  for (const t of (m.rates || []) as RateTable[]) {
    // a second "Description" heading starts a calculation block (Water Supply's occupancy table), not rates
    const sh = m.cells[t.sheet] || {};
    const stop = Object.entries(sh).filter(([a, c]) => a.startsWith(t.desc) && /^\d+$/.test(a.slice(t.desc.length))
      && /^(description|particulars)$/i.test(String(c.v ?? "").trim())).map(([a]) => +a.slice(t.desc.length)).filter((r) => r > Math.min(...t.rows));
    const end = stop.length ? Math.min(...stop) : Infinity;
    const rows = t.rows.filter((r) => r < end);
    const isRate = new Set(rows);
    for (const row of rows) {
      // named with its heading when it sits in a block under one ("Compound Wall" > "Precast")
      let parent = "";
      for (let r = row - 1; r > 0; r--) {
        const l = text(t.sheet, t.desc + r);
        if (!l) break;
        if (!isRate.has(r)) { parent = l; break; }
      }
      const label = text(t.sheet, t.desc + row), uom = t.uom ? text(t.sheet, t.uom + row) : "";
      const cells = Object.fromEntries(Object.entries(t.cols).map(([loc, col]) => [loc, `${t.sheet}!${col}${row}`]));
      out.push({ sheet: t.sheet, row, item: parent && parent !== label ? `${parent} – ${label}` : label, uom, cells });
    }
  }
  rateIndexCache.set(m.stamp, out);
  return out;
}
export const rateCellFor = (r: RateRow, loc: unknown) => r.cells[LOC_KEY(loc)] || r.cells.ALL || null;
/** The master Excel's rate in a cell like "Roadwork!O27". */
export const masterRate = (m: Model, ref: string): number | null => {
  const i = ref.lastIndexOf("!");
  const v = m.cells[ref.slice(0, i)]?.[ref.slice(i + 1)]?.v;
  return typeof v === "number" ? v : null;
};
export const rateName = (m: Model, ref: string) => { const r = rateIndex(m).find((x) => Object.values(x.cells).includes(ref)); return r ? `${r.sheet} – ${r.item}` : ref; };

/** Project rates saved against one template, carried to another by sheet + item name + location. */
export function migrateRates(fromM: Model, toM: Model, rates: Record<string, unknown>) {
  if (!rates || fromM.stamp === toM.stamp) return { ...(rates || {}) };
  const where: Record<string, string> = {};
  for (const r of rateIndex(fromM)) for (const [loc, ref] of Object.entries(r.cells)) where[ref] = `${sheetNow(r.sheet)}|${r.item}|${loc}`;
  const target: Record<string, string> = {}, seen: Record<string, number> = {};
  for (const r of rateIndex(toM)) for (const [loc, ref] of Object.entries(r.cells)) {
    const k = `${sheetNow(r.sheet)}|${r.item}|${loc}`; seen[k] = (seen[k] || 0) + 1; if (seen[k] === 1) target[k] = ref;
  }
  const out: Record<string, unknown> = {};
  for (const [ref, v] of Object.entries(rates)) { const k = where[ref]; if (k && target[k]) out[target[k]] = v; }
  return out;
}

/** Inputs saved on one template, carried onto another, matched by field name (as the original app did). */
export function migrateInputs(fromM: Model, toM: Model, inputs: Record<string, unknown>) {
  const byLabel: Record<string, unknown> = {}, unitOf: Record<string, string | undefined> = {};
  for (const sec of fromM.sections) for (const f of sec.fields) if (f.kind !== "calc" && f.cell in inputs) { byLabel[f.label] = inputs[f.cell]; unitOf[f.label] = f.unit; }
  const oldRoadType = byLabel["Road Type"]; // the original template had one road type for all roads
  const out: Record<string, CellValue> = { ...toM.defaults };
  const moved: string[] = [], dropped: string[] = [], fresh: string[] = [];
  for (const sec of toM.sections) for (const f of sec.fields) {
    if (f.kind === "calc") continue;
    let v = f.label in byLabel ? byLabel[f.label] : undefined;
    if (v === undefined && f.group === "roads" && oldRoadType !== undefined && toM.defaults[f.cell] !== "No") v = oldRoadType;
    // a field the old template didn't have keeps the new template's sample value: worth a look before submitting
    if (v === undefined) { if (!(f.label in byLabel) && !f.group) fresh.push(f.label); continue; }
    if (v === null) { if (f.optional) out[f.cell] = null; continue; }
    if (isNum(v) && unitOf[f.label] === "Sqm" && f.unit === "Sq.Ft") v = Math.round(v * 10.7639 * 100) / 100;
    if (f.kind === "select" && f.options && !f.options.map(String).includes(String(v))) { dropped.push(f.label); continue; }
    out[f.cell] = v as CellValue;
    moved.push(f.label);
  }
  return { inputs: out, moved, dropped, fresh };
}

/** A new project's starting inputs: everything empty for the team to fill in (not the master workbook's sample
 *  values), roads set to none, and the rates location taken from the project's region when it is one of them. */
export function blankInputs(m: Model, location?: string | null): Record<string, CellValue> {
  const out: Record<string, CellValue> = {};
  for (const s of m.sections) for (const f of s.fields) {
    if (f.kind === "calc") continue;
    out[f.cell] = f.group === "roads" ? "No" : null;
  }
  const loc = m.sections.flatMap((s) => s.fields).find((f) => f.cell === "C8");
  const hit = loc?.options?.map(String).find((o) => o.toUpperCase() === String(location ?? "").toUpperCase());
  if (hit) out.C8 = hit;
  return out;
}

/**
 * A new project's inputs: the master template's sample values (as the original app did), with the rates
 * location set from the project's region. Base Line then overwrites what differs.
 */
export function startInputs(m: Model, location?: string | null): Record<string, CellValue> {
  const out = blankInputs(m, location);
  for (const cell of Object.keys(out)) if (cell !== "C8" || !location) out[cell] = m.defaults[cell] ?? out[cell];
  const loc = m.sections.flatMap((s) => s.fields).find((f) => f.cell === "C8");
  if (location && !loc?.options?.map(String).some((o) => o.toUpperCase() === String(location).toUpperCase())) out.C8 = m.defaults.C8 ?? null;
  return out;
}

/** Input fields that still need a value before the draft can be submitted. */
export const missingInputs = (m: Model, inputs: Record<string, unknown>) =>
  m.sections.flatMap((s) => s.fields).filter((f) => f.kind !== "calc" && !f.optional && f.group !== "roadcol" && f.group !== "roadwidth"
    && (inputs[f.cell] === null || inputs[f.cell] === undefined || inputs[f.cell] === "" || Number.isNaN(inputs[f.cell])));
