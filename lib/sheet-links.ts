// Links between the master workbook's sheets, read from its own formulas (user, 2026-11-26):
//   * fieldUses(): for every input on the form, the budget lines it feeds, by their Particulars, so the form can say
//     "Entrance Gate - Others" instead of a cell code like C39. Follows the formulas: a cell on a working sheet
//     (Site Infra, Water Supply, Master Budget ...) that uses the input, directly or through other input cells.
//   * consideration(): the "Consideration" text beside a line on the working sheets (Water Supply, Electrical, OSBL),
//     shown with the rates.
// Everything comes from the template's cells, so a new master workbook brings its own wording. Cached per template.
import { inputSheetOf, type Model } from "./budget";

interface Table { sheet: string; desc: string; uom?: string | null }
type Cells = Record<string, { v?: unknown; f?: string }>;

const colNum = (c: string) => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const colName = (n: number) => { let s = ""; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const text = (cells: Cells | undefined, a: string) => { const v = cells?.[a]?.v; return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : ""; };
const isSrNo = (v: unknown) => (typeof v === "number" && v > 0) || (typeof v === "string" && /^\s*\d+(\.\d+)*\s*$/.test(v));

// a reference in a formula: optional sheet ('Project Inputs'! or Roadworks!), a cell, and maybe the end of a range
const REF = /(?<![A-Za-z0-9_.$])(?:(?:'((?:[^']|'')+)'|([A-Za-z_][\w.]*))!)?\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?(?![\w(])/g;

/** Every cell a formula reads, as "Sheet!A1" (ranges up to 500 cells are expanded; whole columns are not). */
export function refsIn(formula: string, own: string): string[] {
  const out: string[] = [];
  const f = formula.replace(/"(?:[^"]|"")*"/g, '""');
  for (const m of f.matchAll(REF)) {
    const sheet = m[1] ? m[1].replace(/''/g, "'") : m[2] ?? own;
    const c1 = colNum(m[3]), r1 = +m[4];
    if (!m[5]) { out.push(`${sheet}!${m[3]}${r1}`); continue; }
    const c2 = colNum(m[5]), r2 = +m[6];
    if ((Math.abs(c2 - c1) + 1) * (Math.abs(r2 - r1) + 1) > 500) continue;
    for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) out.push(`${sheet}!${colName(c)}${r}`);
  }
  return out;
}

interface Links { readers: Map<string, string[]>; rows: Map<string, Map<number, string[]>> }
const linkCache = new Map<string, Links>();
function links(m: Model): Links {
  const hit = linkCache.get(m.stamp);
  if (hit) return hit;
  const readers = new Map<string, string[]>(), rows = new Map<string, Map<number, string[]>>();
  for (const [sheet, cells] of Object.entries(m.cells ?? {})) {
    const byRow = new Map<number, string[]>();
    for (const [a, c] of Object.entries(cells)) {
      const r = +a.replace(/^[A-Z]+/, "");
      byRow.set(r, [...(byRow.get(r) ?? []), a]);
      if (typeof c.f !== "string") continue;
      for (const ref of refsIn(c.f, sheet)) readers.set(ref, [...(readers.get(ref) ?? []), `${sheet}!${a}`]);
    }
    rows.set(sheet, byRow);
  }
  const out = { readers, rows };
  linkCache.set(m.stamp, out);
  return out;
}

/** Where a sheet's Particulars and UOM are: the rate table's columns, the Master Budget's C and D. */
function columnsOf(m: Model, sheet: string): { desc: string; uom: string | null } | null {
  if (sheet === "Master Budget") return { desc: "C", uom: "D" };
  const t = ((m.rates ?? []) as Table[]).find((x) => x.sheet === sheet);
  return t ? { desc: t.desc, uom: t.uom ?? null } : null;
}

/** A line of a working sheet by its Particulars: "Domestic Water Supply › 25 mm dia (with Ferrule connection)", with
 *  the description rows written under it ("Sluice Valve Chamber - 75x 75 x 120 cm – 1200 x 650 mm (Depth 1200 mm)"). */
function lineName(m: Model, sheet: string, row: number): string {
  const cols = columnsOf(m, sheet), cells = m.cells[sheet];
  if (!cols || !cells) return "";
  const sr = colName(colNum(cols.desc) - 1);
  const name = text(cells, cols.desc + row);
  if (!name) return "";
  // its heading: in the same block (no blank row between), the nearest numbered line above it, or else the furthest
  // one that adds this line up ("Domestic Water Supply" over "25 mm dia (with Ferrule connection)", not the
  // "Excavation" between them, which also counts it)
  let parent = "";
  const byRow = links(m).rows.get(sheet);
  const totals = (r: number) => (byRow?.get(r) ?? []).some((a) => {
    const f = cells[a]?.f;
    return typeof f === "string" && refsIn(f, sheet).some((x) => x.startsWith(sheet + "!") && +x.slice(x.lastIndexOf("!") + 1).replace(/^[A-Z]+/, "") === row);
  });
  if (!isSrNo(cells[sr + row]?.v)) {
    for (let r = row - 1; r > Math.max(0, row - 40); r--) {
      const t = text(cells, cols.desc + r);
      if (!t) break;
      if (isSrNo(cells[sr + r]?.v)) { parent = t; break; }
      if (totals(r)) parent = t;
    }
    if (parent === name) parent = "";
  }
  // description rows under it: text only, no number, unit or formula on the row
  const more: string[] = [];
  for (let r = row + 1; r <= row + 3; r++) {
    const t = text(cells, cols.desc + r);
    if (!t || isSrNo(cells[sr + r]?.v) || (cols.uom && text(cells, cols.uom + r))) break;
    if ((byRow?.get(r) ?? []).some((a) => a !== cols.desc + r && (typeof cells[a]?.f === "string" || typeof cells[a]?.v === "number"))) break;
    more.push(t);
  }
  return `${parent ? parent + " › " : ""}${name}${more.length ? " – " + more.join(", ") : ""}`;
}

const MAX_USES = 5; // an input that feeds more lines than this (Location, Project Area) is described by hand
const usesCache = new Map<string, Record<string, { sheet: string; line: string }[]>>();

/** For each input cell on the form ("C39", "Additional Inputs!C30"), the lines it feeds, by sheet and Particulars.
 *  Empty when it feeds none, or too many to list. */
export function fieldUses(m: Model): Record<string, { sheet: string; line: string }[]> {
  const hit = usesCache.get(m.stamp);
  if (hit) return hit;
  const { readers } = links(m);
  const own = inputSheetOf(m), inputSheets = new Set([own, "Additional Inputs", "Assumptions", "Project Inputs"]);
  const out: Record<string, { sheet: string; line: string }[]> = {};
  for (const f of m.sections.flatMap((s) => s.fields)) {
    const start = f.cell.includes("!") ? f.cell : `${own}!${f.cell}`;
    // follow the formulas: through other input cells, until a working sheet uses it
    const seen = new Set([start]), found = new Map<string, { sheet: string; row: number }>();
    let wave = [start];
    for (let depth = 0; depth < 4 && wave.length && found.size <= MAX_USES * 4; depth++) {
      const next: string[] = [];
      for (const ref of wave) for (const r of readers.get(ref) ?? []) {
        if (seen.has(r)) continue;
        seen.add(r);
        const i = r.lastIndexOf("!"), sheet = r.slice(0, i), row = +r.slice(i + 1).replace(/^[A-Z]+/, "");
        if (inputSheets.has(sheet)) next.push(r);
        else if (!(sheet === "Master Budget" && row < 5)) found.set(`${sheet}!${row}`, { sheet, row });
      }
      wave = next;
    }
    const lines = new Map<string, { sheet: string; line: string }>();
    const order = Object.keys(m.cells);
    const sorted = [...found.values()].sort((a, b) => order.indexOf(a.sheet) - order.indexOf(b.sheet) || a.row - b.row);
    for (const { sheet, row } of sorted) {
      const line = lineName(m, sheet, row);
      if (line && !lines.has(`${sheet}|${line}`)) lines.set(`${sheet}|${line}`, { sheet, line });
    }
    out[f.cell] = lines.size <= MAX_USES ? [...lines.values()] : [];
  }
  usesCache.set(m.stamp, out);
  return out;
}

const considerCache = new Map<string, Map<string, string>>();
/** The workbook's "Consideration" for a line of a working sheet ("upto 1.5 m - all types of soil"), or "". */
export function consideration(m: Model, sheet: string, row: number): string {
  let all = considerCache.get(m.stamp);
  if (!all) {
    all = new Map();
    for (const t of (m.rates ?? []) as (Table & { rows?: number[] })[]) {
      const cells = m.cells[t.sheet];
      if (!cells || !t.rows?.length) continue;
      const first = Math.min(...t.rows);
      // the column headed "Consideration" above the table (not "Qty - Consideration", which holds quantities)
      const head = Object.entries(cells).find(([a, c]) => +a.replace(/^[A-Z]+/, "") < first && typeof c.v === "string" && /^consideration\s*$/i.test(c.v.trim()));
      if (!head) continue;
      const col = head[0].replace(/\d+$/, "");
      for (const r of t.rows) { const s = text(cells, col + r); if (s) all.set(`${t.sheet}!${r}`, s); }
    }
    considerCache.set(m.stamp, all);
  }
  return all.get(`${sheet}!${row}`) ?? "";
}
