"use client";
// The Activity tab: every step, with the fields each save changed (from → to) and where applied values came
// from. "Field history" narrows it to one input: who changed it, when, and from what to what.
import { useMemo, useState } from "react";
import { Initials } from "@/components/initials";
import { fmtCalc, fmtInput, inr, isNum, type CellValue, type Field, type Model } from "@/lib/budget";
import { fmtDateTime } from "@/lib/dates";

export interface ActivityRow {
  id: number; at: string; by: string | null; dept: string | null; action: string; comment: string; rev: number | null;
  details?: { changes?: { cell: string; label: string; from: CellValue; to: CellValue }[]; source?: string | null; kind?: string } | null;
}
const fmtDate = fmtDateTime;

export function ActivityTab({ activity, names, model }: { activity: ActivityRow[]; names: Record<string, string>; model: Model }) {
  const [field, setField] = useState("");
  const [open, setOpen] = useState<Set<number>>(new Set());
  const fields = useMemo(() => new Map(model.sections.flatMap((s) => s.fields.map((f) => [f.cell, f] as const))), [model]);
  // every input that has a history, for the picker
  const changed = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of activity) for (const c of a.details?.changes ?? []) if (!m.has(c.cell)) m.set(c.cell, c.label);
    return [...m].sort((x, y) => x[1].localeCompare(y[1]));
  }, [activity]);
  const show = (cell: string, v: CellValue, kind?: string) => {
    if (kind === "rates") return isNum(v) ? inr(v, Number.isInteger(v) ? 0 : 2) : "master";
    const f = fields.get(cell) as Field | undefined;
    if (v === null || v === undefined || v === "") return "–";
    return f ? (f.kind === "percent" && isNum(v) ? fmtInput(f, v) + " %" : isNum(v) ? fmtCalc(f, v) : String(v)) : String(v);
  };
  const rows = field ? activity.filter((a) => a.details?.changes?.some((c) => c.cell === field)) : activity;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-soft">Field history</span>
        <select className="h-9 min-w-64 rounded-lg border border-input bg-sheet px-2.5" value={field} onChange={(e) => setField(e.target.value)} aria-label="Show the history of one input">
          <option value="">All activity</option>
          {changed.map(([cell, label]) => <option key={cell} value={cell}>{label} ({cell.replace(/^Additional Inputs!/, "AI ")})</option>)}
        </select>
        {field && <span className="text-sm text-soft">{rows.length} change(s)</span>}
      </div>
      <ol className="grid gap-2">
        {rows.map((a) => {
          const ch = (a.details?.changes ?? []).filter((c) => !field || c.cell === field);
          const isOpen = !!field || open.has(a.id);
          return (
            <li key={a.id} className="rounded-lg border border-line bg-sheet px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2"><Initials name={(a.by && names[a.by]) || "?"} /><span><b>{(a.by && names[a.by]) || "Someone"}</b>{a.dept ? <span className="text-soft"> ({a.dept})</span> : ""}: {a.action}</span></span>
                <span className="text-sm text-soft">{fmtDate(a.at)}</span>
              </div>
              {a.comment && <p className="mt-1 pl-9 text-soft">{a.comment}</p>}
              {a.details?.source && <p className="mt-1 pl-9 text-sm text-info">Values applied from {a.details.source}</p>}
              {ch.length > 0 && (
                <div className="mt-2 pl-9">
                  {!field && <button className="text-sm font-medium text-brand hover:underline" onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n; })}>{isOpen ? "Hide" : "Show"} {ch.length} change(s)</button>}
                  {isOpen && (
                    <table className="mt-1 w-full max-w-2xl text-sm">
                      <tbody>{ch.map((c) => (
                        <tr key={c.cell} className="border-t border-line"><td className="py-1 pr-3">{c.label}</td><td className="py-1 pr-2 text-right text-soft">{show(c.cell, c.from, a.details?.kind)}</td><td className="px-1 text-soft">→</td><td className="py-1 font-medium">{show(c.cell, c.to, a.details?.kind)}</td></tr>
                      ))}</tbody>
                    </table>
                  )}
                </div>
              )}
            </li>
          );
        })}
        {!rows.length && <li className="text-soft">Nothing yet.</li>}
      </ol>
    </div>
  );
}
