"use client";
// The Rates tab: the master Excel's rate for every item at this project's location, and the project's own
// rates where they differ. Anyone on the project's team changes them while a draft is open.
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { crore, inr, isNum, masterRate, rateCellFor, rateIndex, snapshot, type CellValue, type Model } from "@/lib/budget";
import { tint, type Authored } from "@/lib/changes";
import { fmtDateTime } from "@/lib/dates";

interface Props {
  projectId: string;
  model: Model;
  inputs: Record<string, CellValue>;
  saved: Record<string, number>;
  editable: boolean;
  label: string;          // "R1 draft", "R2"
  who: string;            // who can change them, for people who can't
  /** who last changed each rate in this revision, in their colour (lib/changes.ts) */
  authors?: Map<string, Authored>;
}

export function RatesTab({ projectId, model: m, inputs, saved, editable, label, who, authors }: Props) {
  const router = useRouter();
  const [rates, setRates] = useState<Record<string, number>>({ ...saved });
  const [q, setQ] = useState("");
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  // a fresh copy from the server replaces local edits only when there are none
  const [seen, setSeen] = useState(saved);
  const key = (o: Record<string, number>) => JSON.stringify(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
  const dirty = key(rates) !== key(saved);
  if (seen !== saved) { setSeen(saved); if (!dirty) setRates({ ...saved }); }

  const loc = inputs.C8;
  const bySheet = useMemo(() => {
    const out = new Map<string, { item: string; uom: string; ref: string }[]>();
    for (const r of rateIndex(m)) {
      const ref = rateCellFor(r, loc);
      if (ref) out.set(r.sheet, [...(out.get(r.sheet) ?? []), { item: r.item, uom: r.uom, ref }]);
    }
    return out;
  }, [m, loc]);
  const savedTotal = useMemo(() => snapshot(m, inputs, saved).grandTotal, [m, inputs, saved]);
  const liveTotal = useMemo(() => snapshot(m, inputs, rates).grandTotal, [m, inputs, rates]);
  const delta = isNum(liveTotal) && isNum(savedTotal) ? liveTotal - savedTotal : null;
  const fmt = (x: number | null | undefined) => (isNum(x) ? inr(x, Number.isInteger(x) ? 0 : 2) : "–");
  const ql = q.trim().toLowerCase();

  async function save() {
    if (!armed) return setArmed(true);
    setArmed(false); setBusy(true);
    const res = await fetch(`/api/projects/${projectId}/rates`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ rates }) });
    const out = await res.json();
    setBusy(false);
    if (!res.ok) return void toast.error(out.error);
    toast.success(out.unchanged ? "No changes to save." : `Rates saved. The ${label} now totals ${crore(out.grandTotal)}.`);
    router.refresh();
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="grid gap-4">
        <section className="grid gap-2 rounded-xl border border-line bg-sheet p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input className="min-w-56 flex-1 bg-sheet" placeholder="Find an item, e.g. GSB, Kerb, HT Panel" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find an item" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} /> Only project rates</label>
          </div>
          <p className="text-sm text-soft">{String(loc)} rates from the master Excel (template of {m.templateModified as string ?? m.stamp}). {editable ? "Type a project rate to replace the master rate for this project only; leave it empty to use the master rate." : who}</p>
        </section>
        {[...bySheet].map(([sheet, rows]) => {
          const shown = rows.filter((r) => (!ql || `${sheet} ${r.item}`.toLowerCase().includes(ql)) && (!onlyChanged || r.ref in rates));
          if (!shown.length) return null;
          return (
            <section key={sheet} className="grid gap-2 rounded-xl border border-line bg-sheet p-4">
              <h3 className="text-lg font-semibold">{sheet}</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px]">
                  <thead className="bg-well text-left text-xs uppercase tracking-wide text-soft"><tr><th className="px-3 py-2">Item</th><th className="px-3 py-2">UOM</th><th className="px-3 py-2 text-right">Master rate (₹)</th><th className="px-3 py-2 text-right">Project rate (₹)</th><th className="w-16" /></tr></thead>
                  <tbody>
                    {shown.map((r) => {
                      const master = masterRate(m, r.ref), mine = rates[r.ref], changed = r.ref in rates, a = authors?.get(r.ref);
                      const money = (v: CellValue) => (isNum(v) ? fmt(v) : "master");
                      return (
                        <tr key={r.ref} style={a ? tint(a.by.colour) : undefined} className={`border-t border-line ${changed && !a ? "bg-amber-soft/50" : ""}`}
                          title={a ? `${a.by.name} · ${fmtDateTime(a.at)}: ${money(a.from)} → ${money(a.to)}${a.count > 1 ? ` (changed ${a.count} times)` : ""}` : undefined}>
                          <td className="px-3 py-2">{r.item || "(unnamed)"}{a && <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium" style={{ color: a.by.colour }}><span aria-hidden className="size-2 rounded-full" style={{ background: a.by.colour }} />{a.by.name}</span>}</td>
                          <td className="px-3 py-2 text-sm text-soft">{r.uom}</td>
                          <td className="px-3 py-2 text-right">{fmt(master)}</td>
                          <td className="w-40 px-3 py-1.5 text-right">
                            {editable ? (
                              <input type="number" step="any" min={0} aria-label={`Project rate for ${r.item}`} placeholder={isNum(master) ? String(+master.toFixed(2)) : "no rate"}
                                className="h-9 w-full rounded-md border border-input bg-sheet px-2.5 text-right" value={changed ? String(mine) : ""}
                                onChange={(e) => {
                                  const raw = e.target.value.trim(), n = Number(raw);
                                  setRates((cur) => { const next = { ...cur }; if (raw === "" || !Number.isFinite(n) || (isNum(master) && Math.abs(n - master) < 1e-9)) delete next[r.ref]; else next[r.ref] = n; return next; });
                                }} />
                            ) : <b>{changed ? fmt(mine) : ""}</b>}
                          </td>
                          <td className="px-2 text-right">{editable && changed && <button className="text-sm text-brand hover:underline" onClick={() => setRates((cur) => { const n = { ...cur }; delete n[r.ref]; return n; })}>Reset</button>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
      <aside className="grid gap-4 lg:sticky lg:top-4">
        <section className="grid gap-3 rounded-xl border border-line bg-sheet p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-soft">Grand total – COC · {label}</div>
          <div className="text-3xl font-semibold">{crore(liveTotal)}</div>
          {dirty && delta !== null && <div className={`text-sm font-medium ${delta > 0 ? "text-bad" : "text-good"}`}>{crore(delta, true)} against the saved rates</div>}
          <dl className="grid gap-1 border-t border-line pt-3 text-sm">
            <div className="flex justify-between"><dt className="text-soft">Project rates set</dt><dd className="font-medium">{Object.keys(rates).length}</dd></div>
            <div className="flex justify-between"><dt className="text-soft">Location</dt><dd className="font-medium">{String(loc)}</dd></div>
          </dl>
        </section>
        {editable && (
          <section className="grid gap-3 rounded-xl border border-line bg-sheet p-5">
            <Button disabled={!dirty || busy} onClick={save}>{busy ? "Saving…" : armed ? "Confirm: save rates" : dirty ? "Save rates" : "Rates saved"}</Button>
            {dirty && <Button variant="ghost" onClick={() => setRates({ ...saved })}>Undo changes</Button>}
            <p className="text-sm text-soft">Saving updates the {label} and lists each change in Activity. It is frozen when Management approves it.</p>
          </section>
        )}
      </aside>
    </div>
  );
}
