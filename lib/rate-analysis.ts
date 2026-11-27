// Rate analysis (from the original app): how a revision differs from another one, line by line, and how much of each
// change comes from quantities (assumption changes, at the old rates) and how much from rates. The current
// assumptions are priced at the base's rates through the same Excel formulas, so the split is exact.
// Plain TypeScript (no React), so scripts can check it.
import { fmtCalc, fmtInput, isNum, lineKey, masterRate, rowKind, snapshot, type CellValue, type MasterRow, type Model } from "./budget";

export interface Side { label: string; inputs: Record<string, CellValue>; rates: Record<string, unknown>; master: MasterRow[]; calc: Record<string, CellValue>; grandTotal: number | null }
export interface Line { head: boolean; item: string; uom: string; qb: CellValue; qn: CellValue; rb: CellValue; rn: CellValue; ab: number; an: number; d: number; dq: number; dr: number }

/** A Master Budget line whose amount adds up other Master Budget amounts (3.1 Electrical = SUM(G42:G53), Plot
 *  Levelling = SUM(G87:G88)/10000000, OSBL = G91): a subtotal, so its change is already in the lines it adds up. */
export function isSubtotal(m: Model, row: number) {
  const f = String(m.cells["Master Budget"]?.["G" + row]?.f || "");
  // a G cell on this sheet: no sheet name in front ("Preliminaries!G51" is another sheet)
  return /(^|[^A-Za-z0-9_!'.$])\$?G\$?\d+/.test(f.replace(/'[^']*'!\$?[A-Z]+\$?\d+(:\$?[A-Z]+\$?\d+)?|[A-Za-z_][\w .&+-]*!\$?[A-Z]+\$?\d+(:\$?[A-Z]+\$?\d+)?/g, ""));
}

/** How a Master Budget line counts in the analysis: "item" (its change counts), "head" (a subtotal or section title:
 *  shown, not counted) or "skip". A heading row whose amount is its own calculation (1 Retaining wall =
 *  E85*F85/10000000) is a line too, or its change would be missed. */
export function lineKind(m: Model, r: MasterRow): "item" | "head" | "skip" {
  const kind = rowKind(r);
  if (kind !== "item" && kind !== "head") return "skip";
  if (isSubtotal(m, r.row)) return "head";
  return kind === "head" && !m.cells["Master Budget"]?.["G" + r.row]?.f ? "head" : "item";
}

export function analyse(m: Model, base: Side, cur: Side) {
  const n = (v: unknown) => (isNum(v) ? v : 0);
  const atBase = snapshot(m, cur.inputs, base.rates as Record<string, unknown>);
  const aKey = Object.fromEntries(atBase.master.map((r) => [r.row, r.c[5]]));
  const bKey = lineKey(base.master), cKey = lineKey(cur.master);
  const bRows = Object.fromEntries(base.master.map((r) => [bKey[r.row], r]));
  // the same Master Budget layout on both sides (a draft against its own template): lines pair by row, since a
  // line's name can change with the inputs ("10 m - Bitumen Road" → "9 m - Bitumen Road" when the width changes).
  // Different layouts (a revision on an older template): by name, as rows move between templates.
  const sameRows = base.master.length === cur.master.length && base.master.every((r, i) => r.row === cur.master[i].row);
  const bByRow = Object.fromEntries(base.master.map((r) => [r.row, r]));
  const baseOf = (row: number) => (sameRows ? bByRow[row] : bRows[cKey[row]]);
  let sumQ = 0, sumR = 0;
  const lines: Line[] = [];
  for (const r of cur.master) {
    const k = lineKind(m, r);
    if (k === "skip") continue;
    const o = baseOf(r.row)?.c || [], c = r.c;
    const ab = n(o[5]), an = n(c[5]), d = an - ab;
    // numbered rows (sections, subsections) keep their number: "3.1 Electrical", "1 Retaining wall"
    const sr = c[0] !== null && c[0] !== "" && (isNum(c[0]) || /^\s*[\d.]+\s*$/.test(String(c[0]))) ? `${isNum(c[0]) ? String(+c[0].toFixed(2)) : String(c[0]).trim()} ` : "";
    const label = `${sr}${c[1] ?? ""}`;
    if (k === "head") { lines.push({ head: true, item: label.trim(), uom: "", qb: null, qn: null, rb: null, rn: null, ab, an, d, dq: 0, dr: 0 }); continue; }
    const dq = n(aKey[r.row]) - ab, dr = an - n(aKey[r.row]);
    sumQ += dq; sumR += dr;
    lines.push({ head: false, item: label, uom: String(c[2] ?? ""), qb: o[3] ?? null, qn: c[3], rb: o[4] ?? null, rn: c[4], ab, an, d, dq, dr });
  }
  // lines of the base with no partner (only when pairing by name): gone, so their whole amount is a change
  if (!sameRows) {
    const curKeys = new Set(Object.values(cKey));
    for (const r of base.master) {
      if (lineKind(m, r) !== "item" || curKeys.has(bKey[r.row]) || !isNum(r.c[5]) || r.c[5] === 0) continue;
      const ab = r.c[5];
      sumQ -= ab;
      lines.push({ head: false, item: `${String(r.c[1] ?? "")} (not in ${cur.label})`, uom: String(r.c[2] ?? ""), qb: r.c[3], qn: null, rb: r.c[4], rn: null, ab, an: 0, d: -ab, dq: -ab, dr: 0 });
    }
  }
  const gd = isNum(base.grandTotal) && isNum(cur.grandTotal) ? (cur.grandTotal - base.grandTotal) * 1e7 : null;
  // assumption changes behind the numbers
  const asm = m.sections.flatMap((s) => s.fields.map((f) => ({ f, sec: s.title }))).map(({ f, sec }) => {
    const show = (side: Side) => (f.kind === "calc" ? fmtCalc(f, side.calc?.[f.cell]) : fmtInput(f, side.inputs[f.cell] ?? null) + (f.kind === "percent" ? "%" : ""));
    return { sec, f, a: show(base), b: show(cur) };
  }).filter((x) => x.a !== x.b);
  const refs = [...new Set([...Object.keys(base.rates || {}), ...Object.keys(cur.rates || {})])];
  const rateRows = refs.map((ref) => ({ ref, a: (base.rates?.[ref] as number) ?? masterRate(m, ref), b: (cur.rates?.[ref] as number) ?? masterRate(m, ref) })).filter((x) => x.a !== x.b);
  return { lines, sumQ, sumR, gd, cont: gd === null ? null : gd - sumQ - sumR, asm, rateRows };
}
