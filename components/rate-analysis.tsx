"use client";
// Rate analysis (from the original app): how a revision differs from the Base Line (R0), line by line, and how
// much of each change comes from quantities (assumption changes, at the old rates) and how much from rates.
// The current assumptions are priced at the base's rates through the same Excel formulas, so the split is exact.
// The calculation is in lib/rate-analysis.ts.
import { useMemo, useState } from "react";
import { crore, inr, isNum, rateName, type CellValue, type Model } from "@/lib/budget";
import { analyse, type Side } from "@/lib/rate-analysis";

export type { Side };

export function RateAnalysis({ model: m, base, cur }: { model: Model; base: Side; cur: Side }) {
  const [only, setOnly] = useState(true);
  const a = useMemo(() => analyse(m, base, cur), [m, base, cur]);

  const money = (x: number | null) => (x === null ? "–" : `${x > 0 ? "+" : ""}${inr(x)}`);
  const tone = (x: number) => (Math.abs(x) < 0.5 ? "text-soft" : x > 0 ? "text-bad" : "text-good");
  const shown = a.lines.filter((l) => l.head || !only || Math.abs(l.d) >= 0.5);
  const th = "px-3 py-2 text-right", td = "px-3 py-2 text-right";

  return (
    <div className="grid gap-5">
      <section className="grid gap-4 sm:grid-cols-3">
        {[[base.label, crore(base.grandTotal)], [cur.label, crore(cur.grandTotal)], ["Change", a.gd === null ? "–" : crore(a.gd / 1e7, true)]].map(([k, v], i) => (
          <div key={i} className="rounded-xl border border-line bg-sheet p-4"><div className="text-sm text-soft">{k}</div><div className={`mt-1 text-2xl font-semibold ${i === 2 && a.gd ? (a.gd > 0 ? "text-bad" : "text-good") : ""}`}>{v}</div></div>
        ))}
      </section>
      <section className="rounded-xl border border-line bg-sheet p-5">
        <h3 className="mb-2 text-lg font-semibold">Where the change comes from</h3>
        <dl className="grid gap-1.5">
          <div className="flex justify-between gap-3"><dt>Quantities (assumption changes, at the old rates)</dt><dd className={`font-medium ${tone(a.sumQ)}`}>₹ {money(a.sumQ)}</dd></div>
          <div className="flex justify-between gap-3"><dt>Rates (rate changes, on the new quantities)</dt><dd className={`font-medium ${tone(a.sumR)}`}>₹ {money(a.sumR)}</dd></div>
          <div className="flex justify-between gap-3"><dt>5% contingency on the above</dt><dd className="font-medium">₹ {money(a.cont)}</dd></div>
        </dl>
      </section>
      <section className="grid gap-2">
        <div className="flex items-center justify-between"><h3 className="text-lg font-semibold">Budget lines</h3>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} /> Only lines that changed</label></div>
        <div className="overflow-x-auto rounded-xl border border-line bg-sheet">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-mb-head text-left text-xs uppercase tracking-wide text-white"><tr>
              <th className="px-3 py-2">Item</th><th className="px-3 py-2">UOM</th><th className={th}>Qty {base.label}</th><th className={th}>Qty {cur.label}</th><th className={th}>Rate {base.label}</th><th className={th}>Rate {cur.label}</th>
              <th className={th}>Amount {base.label}</th><th className={th}>Amount {cur.label}</th><th className={th}>Change</th><th className={th}>Due to quantity</th><th className={th}>Due to rate</th></tr></thead>
            <tbody>
              {shown.map((l, i) => l.head ? (
                <tr key={i} className="bg-mb-row font-semibold"><td colSpan={6} className="px-3 py-2">{l.item}</td><td className={td}>{inr(l.ab)}</td><td className={td}>{inr(l.an)}</td><td className={`${td} ${tone(l.d)}`}>{Math.abs(l.d) < 0.5 ? "–" : money(l.d)}</td><td /><td /></tr>
              ) : (
                <tr key={i} className="border-t border-line">
                  <td className="px-3 py-2">{l.item}</td><td className="px-3 py-2 text-soft">{l.uom}</td>
                  <td className={`${td} ${n2(l.qb) !== n2(l.qn) ? "bg-amber-soft/60" : ""}`}>{isNum(l.qb) ? inr(l.qb, 2) : ""}</td><td className={`${td} ${n2(l.qb) !== n2(l.qn) ? "bg-amber-soft/60" : ""}`}>{isNum(l.qn) ? inr(l.qn, 2) : ""}</td>
                  <td className={`${td} ${n2(l.rb) !== n2(l.rn) ? "bg-amber-soft/60" : ""}`}>{isNum(l.rb) ? inr(l.rb, 2) : ""}</td><td className={`${td} ${n2(l.rb) !== n2(l.rn) ? "bg-amber-soft/60" : ""}`}>{isNum(l.rn) ? inr(l.rn, 2) : ""}</td>
                  <td className={td}>{inr(l.ab)}</td><td className={td}>{inr(l.an)}</td>
                  <td className={`${td} ${tone(l.d)}`}>{Math.abs(l.d) < 0.5 ? "–" : money(l.d)}</td><td className={`${td} ${tone(l.dq)}`}>{Math.abs(l.dq) < 0.5 ? "–" : money(l.dq)}</td><td className={`${td} ${tone(l.dr)}`}>{Math.abs(l.dr) < 0.5 ? "–" : money(l.dr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-line bg-sheet p-5">
          <h3 className="mb-2 text-lg font-semibold">Assumption changes ({a.asm.length})</h3>
          {a.asm.length ? <table className="w-full text-sm"><thead className="text-left text-xs uppercase text-soft"><tr><th className="py-1">Assumption</th><th className="py-1">{base.label}</th><th className="py-1">{cur.label}</th></tr></thead><tbody>
            {a.asm.map((x) => <tr key={x.f.cell} className={`border-t border-line ${x.f.kind === "calc" ? "text-soft" : ""}`}><td className="py-1.5">{x.f.label}{x.f.kind === "calc" ? " (calculated)" : ""}</td><td className="py-1.5 text-soft">{x.a}</td><td className="py-1.5 font-medium">{x.b}</td></tr>)}
          </tbody></table> : <p className="text-soft">No assumption changes.</p>}
        </div>
        <div className="rounded-xl border border-line bg-sheet p-5">
          <h3 className="mb-2 text-lg font-semibold">Rate changes ({a.rateRows.length})</h3>
          {a.rateRows.length ? <table className="w-full text-sm"><thead className="text-left text-xs uppercase text-soft"><tr><th className="py-1">Item</th><th className="py-1 text-right">{base.label}</th><th className="py-1 text-right">{cur.label}</th></tr></thead><tbody>
            {a.rateRows.map((x) => <tr key={x.ref} className="border-t border-line"><td className="py-1.5">{rateName(m, x.ref)}</td><td className="py-1.5 text-right text-soft">{isNum(x.a) ? inr(x.a, 2) : "–"}</td><td className="py-1.5 text-right font-medium">{isNum(x.b) ? inr(x.b, 2) : "–"}</td></tr>)}
          </tbody></table> : <p className="text-soft">No rate changes.</p>}
        </div>
      </section>
    </div>
  );
}
const n2 = (v: CellValue) => (isNum(v) ? +v.toFixed(6) : v);
