"use client";
// The Assumptions inputs, section by section, with each field's Excel cell beside it. Road lines are one
// table (width, road type, measurements). Calculated fields update as you type.
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import engineApi from "@/lib/engine/budget-engine";
import { fmtCalc, fmtInput, isNum, parseInput, type CellValue, type Field, type Model, type Snapshot } from "@/lib/budget";

type Inputs = Record<string, CellValue>;
const shortRef = (cell: string) => cell.replace(/^Additional Inputs!/, "AI ");
const numericChoices = (f: Field) => Array.isArray(f.options) && f.options.length > 0 && f.options.every((o) => /^\d+$/.test(String(o).trim()));
const inputCls = "h-9 w-full rounded-md border border-input bg-sheet px-2.5 tabular-nums text-ink focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30";
const changedCls = "bg-amber-soft/60";

// Which road types the master Excel can cost (> ₹ 0) for each road line, given location and that line's measurements.
const availCache = new Map<string, Set<string>>();
function roadLineRow(m: Model, f: Field) {
  const ref = "Assumptions!B" + f.cell.slice(1) + ",";
  const hit = Object.entries(m.cells["Master Budget"] || {}).find(([a, c]) => a.startsWith("E") && c.f && c.f.includes(ref));
  return hit ? hit[0].slice(1) : null;
}
function roadAvailability(m: Model, inputs: Inputs) {
  const all = m.sections.flatMap((s) => s.fields), out: Record<string, Set<string>> = {};
  let eng: InstanceType<typeof engineApi.BudgetEngine> | null = null;
  for (const f of all.filter((x) => x.group === "roads")) {
    const mine = all.filter((x) => (x.group === "roadcol" || x.group === "roadwidth") && x.road === f.cell);
    const key = [m.stamp, inputs.C8, f.cell, ...mine.map((c) => inputs[c.cell])].join("|");
    if (!availCache.has(key)) {
      const row = roadLineRow(m, f), ok = new Set(["No"]);
      for (const opt of f.options || []) {
        if (opt === "No" || !row) continue;
        const vals: Record<string, unknown> = { ...m.defaults, C8: inputs.C8, [f.cell]: opt };
        for (const c of mine) vals[c.cell] = inputs[c.cell];
        const k: Record<string, unknown> = {};
        for (const [c, v] of Object.entries(vals)) k[c.includes("!") ? c : "Assumptions!" + c] = v;
        eng ??= new engineApi.BudgetEngine(m);
        eng.setInputs(k);
        const t = eng.value("Master Budget", "G" + row);
        if (isNum(t) && t > 0) ok.add(String(opt));
      }
      availCache.set(key, ok);
    }
    out[f.cell] = availCache.get(key)!;
  }
  return out;
}

interface Props {
  model: Model;
  draft: Inputs;
  snap: Snapshot;
  editable: boolean;
  /** R0's values, to mark what changed since the Base Line (null at R0) */
  base: Inputs | null;
  onChange: (next: Inputs) => void;
}

export function AssumptionsForm({ model: m, draft, snap, editable, base, onChange }: Props) {
  const all = useMemo(() => m.sections.flatMap((s) => s.fields), [m]);
  const [shown, setShown] = useState<Set<string>>(new Set());
  const set = (cell: string, v: CellValue) => onChange({ ...draft, [cell]: v });
  const changed = (cell: string) => !!base && String(base[cell] ?? "") !== String(draft[cell] ?? "");

  const roads = all.filter((f) => f.group === "roads");
  const lenOf = (f: Field) => all.find((x) => x.group === "roadcol" && x.road === f.cell && x.col === "len");
  const used = (f: Field) => { const lf = lenOf(f); return String(draft[f.cell] ?? "No") !== "No" || (!!lf && isNum(draft[lf.cell]) && (draft[lf.cell] as number) > 0) || shown.has(f.cell); };

  function addRoad(from?: Field) {
    const free = roads.find((f) => !used(f));
    if (!free) return alert(`All ${roads.length} road lines are in use. Remove one (×) to add another.`);
    const next: Inputs = { ...draft };
    if (typeof free.widthCell === "string") next[free.widthCell] = from && typeof from.widthCell === "string" ? draft[from.widthCell] : null;
    next[free.cell] = "No";
    for (const c of all.filter((x) => x.group === "roadcol" && x.road === free.cell && x.kind !== "calc")) {
      const same = from && all.find((x) => x.group === "roadcol" && x.road === from.cell && x.col === c.col);
      next[c.cell] = same && (c.col === "saucer" || c.col === "path") ? draft[same.cell] : null;
    }
    setShown((s) => new Set(s).add(free.cell));
    onChange(next);
  }
  function removeRoad(f: Field) {
    const next: Inputs = { ...draft, [f.cell]: "No" };
    for (const c of all.filter((x) => x.group === "roadcol" && x.road === f.cell && x.kind !== "calc")) next[c.cell] = c.col === "len" || c.col === "cut" ? null : m.defaults[c.cell];
    if (typeof f.widthCell === "string") next[f.widthCell] = m.defaults[f.widthCell];
    setShown((s) => { const n = new Set(s); n.delete(f.cell); return n; });
    onChange(next);
  }

  const avail = useMemo(() => (roads.length ? roadAvailability(m, draft) : {}), [m, draft, roads.length]);
  const lightHidden = (f: Field) => typeof f.lightFor === "string" && String(draft[f.lightFor] ?? "No") === "No" && !(isNum(snap.calc[f.cell]) && (snap.calc[f.cell] as number) > 0);

  function control(f: Field) {
    const v = draft[f.cell];
    const id = "in-" + f.cell.replace(/[^A-Za-z0-9]/g, "_");
    const unit = f.kind === "percent" ? "%" : f.unit_cell ? fmtCalc({} as Field, snap.calc[f.unit_cell]) : f.unit;
    if (f.kind === "calc") return <output className="flex items-baseline justify-between gap-2 font-medium"><span>{fmtCalc(f, snap.calc[f.cell])}</span><span className="w-14 text-sm font-normal text-soft">{unit}</span></output>;
    // read only: the value as plain text, easy to read (no greyed-out box)
    if (!editable) {
      const shown = v === null || v === undefined || v === "" ? "–" : f.kind === "percent" ? fmtInput(f, v) : typeof v === "number" ? fmtCalc(f, v) : String(v);
      return <span className="flex items-baseline justify-between gap-2 font-medium"><span>{shown}</span><span className="w-14 text-sm font-normal text-soft">{unit}</span></span>;
    }
    if (f.kind === "select" && !numericChoices(f)) {
      return <select id={id} className={inputCls} disabled={!editable} value={String(v ?? "")} onChange={(e) => set(f.cell, parseInput(f, e.target.value))}>
        {(v === null || v === undefined || v === "") && <option value="">Choose…</option>}
        {(f.options || []).map((o) => <option key={String(o)}>{String(o)}</option>)}</select>;
    }
    return (
      <span className="flex items-center gap-1.5">
        <input id={id} type="number" inputMode="decimal" step="any" min={0} max={f.kind === "percent" ? 100 : undefined} className={inputCls} disabled={!editable}
          list={numericChoices(f) ? id + "-dl" : undefined} value={fmtInput(f, v)}
          onChange={(e) => set(f.cell, f.kind === "select" ? parseInput({ ...f, kind: "number" }, e.target.value) : parseInput(f, e.target.value))} />
        {numericChoices(f) && <datalist id={id + "-dl"}>{f.options!.map((o) => <option key={String(o)} value={String(o)} />)}</datalist>}
        <span className="w-14 shrink-0 text-sm text-soft">{unit}</span>
      </span>
    );
  }

  function fieldRow(f: Field) {
    if (lightHidden(f)) return null;
    const lbl = typeof f.lightWidth === "string" && isNum(draft[f.lightWidth]) ? `External Lights – ${draft[f.lightWidth]} m road (line ${f.label.replace(/\D+/g, "")})` : f.label;
    return (
      <div key={f.cell} className={`grid grid-cols-1 gap-1 border-b border-line/70 px-2 py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_280px] sm:items-center ${f.kind === "calc" ? "bg-tint" : ""} ${f.kind !== "calc" && changed(f.cell) ? changedCls : ""}`}>
        <label htmlFor={"in-" + f.cell.replace(/[^A-Za-z0-9]/g, "_")}>
          <span className="font-medium">{lbl}</span> <span className="ml-1 font-mono text-xs text-soft">{shortRef(f.cell)}</span>
          {f.kind === "calc" && <span className="ml-2 text-xs text-soft">calculated</span>}
          {f.note && <small className="block text-sm text-soft">{f.note}</small>}
          {typeof f.detail === "string" && <small className="block text-sm text-soft">{fmtCalc({} as Field, snap.calc[f.detail])}</small>}
        </label>
        <div>{control(f)}</div>
      </div>
    );
  }

  function roadTable() {
    const heads = [...new Map(all.filter((x) => x.group === "roadcol").map((x) => [x.col as string, x.label.split(" – ").pop()!])).entries()];
    const typed = roads.some((f) => f.widthCell);
    const wv = (f: Field) => (typeof f.widthCell === "string" && isNum(draft[f.widthCell]) ? (draft[f.widthCell] as number) : Infinity);
    const lines = typed ? roads.filter(used).sort((a, b) => wv(a) - wv(b) || (a.line as number) - (b.line as number)) : roads;
    return (
      <div className="grid gap-2">
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-well text-xs uppercase tracking-wide text-soft">
              <tr><th className="px-2 py-1.5 text-right">Width{typed ? " (m)" : ""}</th><th className="px-2 py-1.5 text-left">Road type and specification</th>
                {heads.map(([k, h]) => <th key={k} className="px-2 py-1.5 text-right">{h}</th>)}{typed && <th />}</tr>
            </thead>
            <tbody>
              {!lines.length && <tr><td colSpan={heads.length + 3} className="px-2 py-3 text-soft">No roads yet. Press “Add road”.</td></tr>}
              {lines.map((f) => {
                const v = String(draft[f.cell] ?? "No"), ok = avail[f.cell] ?? new Set((f.options || []).map(String));
                const opts = (f.options || []).map(String).filter((o) => ok.has(o) || o === v);
                return (
                  <tr key={f.cell} className={`border-t border-line ${v === "No" ? "text-soft" : ""} ${changed(f.cell) ? "bg-amber-soft/40" : ""}`}>
                    <td className="w-24 px-2 py-1">{typed && typeof f.widthCell === "string"
                      ? (editable ? <input type="number" step="any" min={0} className={inputCls} aria-label={`Width of road line ${f.line} (m)`} value={fmtInput({} as Field, draft[f.widthCell])} onChange={(e) => set(f.widthCell as string, parseInput({ kind: "number" } as Field, e.target.value))} /> : <b>{fmtInput({} as Field, draft[f.widthCell]) || "–"} m</b>)
                      : <b>{isNum(f.width) ? String(f.width) : ""} m</b>}</td>
                    <td className="min-w-56 px-2 py-1">
                      {editable ? <select className={inputCls} value={v} aria-label={`Road type for ${f.label}`} onChange={(e) => set(f.cell, e.target.value)}>
                        {opts.map((o) => <option key={o} value={o}>{o}{ok.has(o) ? "" : " – costs ₹ 0 here"}</option>)}
                      </select> : <span className="font-medium">{v}</span>}
                      {v !== "No" && typeof f.detail === "string" && <small className="block text-xs text-soft">{fmtCalc({} as Field, snap.calc[f.detail])}</small>}
                      {ok.size <= 1 && v === "No" && <small className="block text-xs text-soft">Enter a length to choose a road type.</small>}
                    </td>
                    {heads.map(([key]) => {
                      const c = all.find((x) => x.group === "roadcol" && x.road === f.cell && x.col === key);
                      if (!c) return <td key={key} />;
                      if (c.kind === "calc") return <td key={key} className="px-2 py-1 text-right tabular-nums text-soft">{fmtCalc(c, snap.calc[c.cell])}</td>;
                      if (!editable) return <td key={key} className={`px-2 py-2 text-right font-medium ${changed(c.cell) ? "bg-amber-soft" : ""}`}>{fmtInput(c, draft[c.cell]) || "–"}</td>;
                      return <td key={key} className="w-24 px-2 py-1"><input type="number" step="any" min={0} className={`${inputCls} ${changed(c.cell) ? changedCls : ""}`} aria-label={c.label} value={fmtInput(c, draft[c.cell])} onChange={(e) => set(c.cell, parseInput(c, e.target.value))} /></td>;
                    })}
                    {typed && <td className="whitespace-nowrap px-1">{editable && <>
                      <Button variant="ghost" size="icon-sm" title="Add another road type for this width" onClick={() => addRoad(f)}>+</Button>
                      <Button variant="ghost" size="icon-sm" title="Remove this road line" onClick={() => removeRoad(f)}>×</Button></>}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {typed && editable && <Button variant="outline" size="sm" className="w-fit" onClick={() => addRoad()}>+ Add road</Button>}
        <p className="text-xs text-soft">Enter each road&apos;s width, length and measurements, then pick its road type. Only types the master Excel can cost for {String(draft.C8)} with these measurements are listed.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {m.sections.map((sec) => (
        <section key={sec.title} className="grid gap-3 rounded-xl border border-line bg-sheet p-5">
          <h3 className="text-lg font-semibold">{sec.title}</h3>
          {sec.fields.some((f) => f.group === "roads") && roadTable()}
          <div className="grid gap-0.5">{sec.fields.filter((f) => f.group !== "roads" && f.group !== "roadcol" && f.group !== "roadwidth").map(fieldRow)}</div>
        </section>
      ))}
    </div>
  );
}
