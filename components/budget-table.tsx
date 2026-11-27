"use client";
// The Master Budget, laid out like the sheet: sections that open to their lines, the totals block,
// Cost / Acre beside every amount, and the Delta against R0 (never at R0 itself).
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { crore, inr, isErrV, isNum, lineKey, marks, numCell, rowKind, type CellValue, type MasterRow } from "@/lib/budget";

const crTxt = (v: number) => v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function BudgetTable({ master, baseline, title = "Master Budget" }: { master: MasterRow[]; baseline: MasterRow[] | null; title?: string }) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const mk = marks(master);
  const acre = mk.acre;
  const { bRows, mKey } = useMemo(() => {
    if (!baseline) return { bRows: null, mKey: null };
    const bKey = lineKey(baseline);
    return { bRows: Object.fromEntries(baseline.map((r) => [bKey[r.row], r])) as Record<string, MasterRow>, mKey: lineKey(master) };
  }, [baseline, master]);
  const heads = master.filter((r) => rowKind(r) === "head").map((r) => r.row);
  const allOpen = heads.every((h) => open.has(h));
  const toggle = (g: number) => setOpen((s) => { const n = new Set(s); if (n.has(g)) n.delete(g); else n.add(g); return n; });

  const money = (v: CellValue, dec = 2) => (isErrV(v) ? <span className="text-bad">{v.e}</span> : isNum(v) ? inr(v, dec) : numCell(v));
  // the Total column is in ₹ crore, as in the master Excel (the app keeps line amounts in rupees)
  const inCrore = (v: CellValue) => (isErrV(v) ? <span className="text-bad">{v.e}</span> : isNum(v) ? crTxt(v / 1e7) : numCell(v));
  const perAcre = (v: CellValue, inCrore = false) => (!isNum(v) || !isNum(acre) || !acre ? "" : `${crTxt((inCrore ? v : v / 1e7) / acre)} Cr`);
  const base = (r: MasterRow) => (bRows && mKey ? bRows[mKey[r.row]]?.c?.[5] : undefined);
  const vsBase = (r: MasterRow, onDark = false) => {
    if (!bRows) return null;
    const a = r.c[5], o = base(r);
    if (!isNum(a) && !isNum(o)) return <td className="px-3 py-2" />;
    const d = (isNum(a) ? a : 0) - (isNum(o) ? o : 0);
    if (Math.abs(d) < 0.005) return <td className="px-3 py-2 text-right text-soft">–</td>;
    const sg = d > 0 ? "+" : "", inCr = mk.crore.has(r.row);
    return (
      <td className={`px-3 py-2 text-right tabular-nums ${onDark ? "font-semibold" : d > 0 ? "text-bad" : "text-good"}`}>
        {inCr ? `${sg}${d.toFixed(2)} Cr` : `${sg}${inr(d)}`}
        <small className="block text-xs opacity-80">{inCr ? `${sg}₹ ${inr(d * 1e7)}` : `${sg}${crTxt(d / 1e7)} Cr`}</small>
      </td>
    );
  };
  const label = (c: CellValue[]) => (typeof c[0] === "string" ? c[0].trim() : "");
  // a road line with no road type ("18 m Road", ₹ 0) isn't shown, unless the Base Line had a cost on it
  const unusedRoad = (r: MasterRow) => /^\d+(\.\d+)?\s*m Road$/i.test(String(r.c[1] ?? "").trim()) && !(isNum(r.c[5]) && r.c[5] !== 0) && !(isNum(base(r)) && base(r) !== 0);
  const cols = bRows ? 8 : 7;

  let group = 0;
  const body: React.ReactNode[] = [];
  for (const r of master) {
    const k = rowKind(r), c = r.c;
    if (k === "skip" || (k === "item" && unusedRoad(r))) continue;
    if (k === "total" && /cost\/\s*acre$/i.test(label(c))) continue; // shown in the Cost / Acre column instead
    if (r.row === mk.divider || r.row === mk.coc) body.push(<tr key={`gap${r.row}`} aria-hidden className="h-3"><td colSpan={cols} /></tr>);
    if (k === "total") {
      const inCr = mk.crore.has(r.row);
      const dark = r.row === mk.gt || r.row === mk.infra || r.row === mk.noninfra;
      const kind = r.row === mk.gt ? "bg-mb-grand text-white font-semibold" : dark ? "bg-mb-band text-white font-medium" : "bg-well font-medium";
      body.push(
        <tr key={r.row} className={kind}>
          <td colSpan={5} className="px-3 py-2">{String(c[0])}</td>
          <td className="px-3 py-2 text-right tabular-nums">{isErrV(c[5]) ? c[5].e : crore(inCr || !isNum(c[5]) ? c[5] : c[5] / 1e7)}</td>
          <td className="px-3 py-2 text-right tabular-nums">{isErrV(c[5]) ? "" : perAcre(c[5], inCr)}</td>
          {vsBase(r, dark)}
        </tr>,
      );
    } else if (k === "head") {
      group = r.row;
      const g = group, isOpen = open.has(g);
      body.push(
        <tr key={r.row} className="cursor-pointer bg-mb-row font-semibold hover:bg-mb-row-hover" tabIndex={0} aria-expanded={isOpen}
          onClick={() => toggle(g)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(g); } }}>
          <td className="px-3 py-2"><span className={`inline-block transition-transform ${isOpen ? "rotate-90" : ""}`}>▸</span> {numCell(c[0])}</td>
          <td className="px-3 py-2">{String(c[1] ?? "")}</td>
          <td className="px-3 py-2">{String(c[2] ?? "")}</td>
          <td className="px-3 py-2 text-right tabular-nums">{money(c[3])}</td>
          <td className="px-3 py-2 text-right tabular-nums">{money(c[4])}</td>
          <td className="px-3 py-2 text-right tabular-nums">{inCrore(c[5])}</td>
          <td className="px-3 py-2 text-right tabular-nums">{perAcre(c[5])}</td>
          {vsBase(r)}
        </tr>,
      );
    } else if (open.has(group)) {
      body.push(
        <tr key={r.row} className="border-t border-line">
          <td className="px-3 py-2 text-soft">{isNum(c[0]) ? String(+c[0].toFixed(2)) : String(c[0] ?? "")}</td>
          <td className="px-3 py-2">{String(c[1] ?? "")}</td>
          <td className="px-3 py-2 text-soft">{String(c[2] ?? "")}</td>
          <td className="px-3 py-2 text-right tabular-nums">{money(c[3])}</td>
          <td className="px-3 py-2 text-right tabular-nums">{isNum(c[4]) ? inr(c[4], 2) : ""}</td>
          <td className="px-3 py-2 text-right tabular-nums">{inCrore(c[5])}</td>
          <td className="px-3 py-2 text-right tabular-nums">{perAcre(c[5])}</td>
          {vsBase(r)}
        </tr>,
      );
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <Button variant="outline" size="sm" onClick={() => setOpen(allOpen ? new Set() : new Set(heads))}>{allOpen ? "Collapse all" : "Expand all"}</Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line bg-sheet">
        <table className="w-full min-w-[760px]">
          <thead className="bg-mb-head text-left text-xs uppercase tracking-wide text-white">
            <tr>
              <th className="px-2 py-2">Sr No</th><th className="px-2 py-2">Description</th><th className="px-2 py-2">UOM</th>
              <th className="px-2 py-2 text-right">Qty</th><th className="px-2 py-2 text-right">Cost / Unit (₹)</th><th className="px-2 py-2 text-right">Total (₹ Cr)</th>
              <th className="px-2 py-2 text-right">Cost / Acre (₹ Cr)</th>{bRows && <th className="px-2 py-2 text-right">Delta vs Base Line (R0)</th>}
            </tr>
          </thead>
          <tbody>{body}</tbody>
        </table>
      </div>
    </div>
  );
}
