"use client";
// The project inputs (the Project Inputs tab), section by section, with each field's Excel cell beside it. Road lines are one
// table (width, road type, measurements). Calculated fields update as you type.
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/info-tip";
import engineApi from "@/lib/engine/budget-engine";
import { fmtCalc, fmtInput, inputKey, inputSheetOf, inr, isNum, lineKey, parseInput, sheetRef, type CellValue, type Field, type MasterRow, type Model, type Snapshot } from "@/lib/budget";
import { tint, type Authored } from "@/lib/changes";
import { fieldHelp } from "@/lib/field-help";
import { fieldUses } from "@/lib/sheet-links";
import { fmtDateTime } from "@/lib/dates";

type Inputs = Record<string, CellValue>;
export interface Baseline { inputs: Inputs; calc: Record<string, unknown>; master: MasterRow[]; sameTemplate: boolean }

// "Δ +200 vs R0 (R0: 1,967)" under a field whose value differs from the Base Line (as in the original app)
const num0 = (v: unknown) => (isNum(v) ? v : 0);
const blank = (v: unknown) => v === null || v === undefined || v === "";
function deltaText(f: Field, now: unknown, was: unknown): { up: boolean | null; head: string; tail: string } | null {
  const pct = f.kind === "percent" || f.fmt === "percent";
  if ((isNum(now) || blank(now)) && (isNum(was) || blank(was))) {
    const d = num0(now) - num0(was);
    if (Math.abs(d) < 1e-9) return null;
    const show = (x: number) => (pct ? `${+(x * 100).toFixed(2)}%` : inr(x, Number.isInteger(x) ? 0 : 2));
    return { up: d > 0, head: `Δ ${d > 0 ? "+" : "−"}${show(Math.abs(d))}`, tail: ` vs R0 (R0: ${show(num0(was))})` };
  }
  return String(now ?? "") === String(was ?? "") ? null : { up: null, head: "Changed", tail: ` vs R0 (R0: ${blank(was) ? "–" : String(was)})` };
}
// The Excel cell of a field, out of the way: a small ⓘ beside its name, the cell on hover (or a long press). The
// description under the name says what the field feeds, by the workbook's own Particulars (lib/sheet-links.ts), else
// what it means in plain words (lib/field-help.ts).
function CellInfo({ m, cell }: { m: Model; cell: string }) {
  const where = cell.includes("!") ? cell.replace("!", " ") : `${inputSheetOf(m)} ${cell}`;
  // the same ⓘ as everywhere else in the app (components/info-tip.tsx)
  return <span className="ml-1 inline-flex align-[-3px] not-italic"><InfoTip label={`Excel cell ${where}`}>Excel cell: <b>{where}</b></InfoTip></span>;
}
// what each column of the road table means (shown when you hover its heading)
const ROAD_COL_HELP: Record<string, string> = {
  len: "Length of this road line, in metres.",
  saucer: "Width of the saucer drain, in metres.",
  path: "Footpath width for this road, in metres (total of both sides).",
  kerb: "How many lines of kerb stone run along this road (2 = both edges).",
  cut: "Earth cut for this road, in cubic metres (worked out from the terrain).",
  fill: "Earth filled for this road, in cubic metres (worked out from the terrain).",
};
const numericChoices = (f: Field) => Array.isArray(f.options) && f.options.length > 0 && f.options.every((o) => /^\d+$/.test(String(o).trim()));
const inputCls = "h-9 w-full rounded-md border border-input bg-sheet px-2.5 tabular-nums text-ink focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30";
const changedCls = "bg-amber-soft/60";
const round2 = (n: number) => Math.round(n * 100) / 100;

// Which road types the master Excel can cost (> ₹ 0) for each road line, given location and that line's measurements.
const availCache = new Map<string, Set<string>>();
function roadLineRow(m: Model, f: Field) {
  // the Master Budget line whose quantity formula reads this road line's width: LET(w, 'Project Inputs'!B21, …)
  const ref = `${sheetRef(inputSheetOf(m))}!B${f.cell.slice(1)},`;
  const hit = Object.entries(m.cells["Master Budget"] || {}).find(([a, c]) => a.startsWith("E") && c.f && c.f.includes(ref));
  return hit ? hit[0].slice(1) : null;
}
function roadAvailability(m: Model, inputs: Inputs) {
  const all = m.sections.flatMap((s) => s.fields), out: Record<string, Set<string>> = {};
  let eng: InstanceType<typeof engineApi.BudgetEngine> | null = null;
  for (const f of all.filter((x) => x.group === "roads")) {
    const mine = all.filter((x) => (x.group === "roadcol" || x.group === "roadwidth") && x.road === f.cell);
    // the line's own width; until it is typed (a new line), every road type is offered
    const wc = typeof f.widthCell === "string" ? f.widthCell : null;
    if (wc && !(isNum(inputs[wc]) && (inputs[wc] as number) > 0)) { out[f.cell] = new Set((f.options || []).map(String)); continue; }
    const width = wc ? inputs[wc] : null;
    const key = [m.stamp, inputs.C8, f.cell, width, ...mine.map((c) => inputs[c.cell])].join("|");
    if (!availCache.has(key)) {
      const row = roadLineRow(m, f), ok = new Set(["No"]);
      for (const opt of f.options || []) {
        if (opt === "No" || !row) continue;
        const vals: Record<string, unknown> = { ...m.defaults, C8: inputs.C8, [f.cell]: opt, ...(wc ? { [wc]: width } : {}) };
        for (const c of mine) vals[c.cell] = inputs[c.cell];
        // a new line has no length yet, and every type costs ₹ 0 at length 0: try a length of 100 m, so the
        // types this location and width can cost are offered before the length is typed
        for (const c of mine) if (c.col === "len" && !(isNum(vals[c.cell]) && (vals[c.cell] as number) > 0)) vals[c.cell] = 100;
        const k: Record<string, unknown> = {};
        for (const [c, v] of Object.entries(vals)) k[inputKey(m, c)] = v;
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
  /** R0 (the Base Line), to show what changed since it was frozen (null at R0 itself) */
  base: Baseline | null;
  /** who last changed each input in this revision: shown in that person's colour (lib/changes.ts) */
  authors?: Map<string, Authored>;
  onChange: (next: Inputs) => void;
}

export function AssumptionsForm({ model: m, draft, snap, editable, base, authors, onChange }: Props) {
  const all = useMemo(() => m.sections.flatMap((s) => s.fields), [m]);
  const uses = useMemo(() => fieldUses(m), [m]);
  const [shown, setShown] = useState<Set<string>>(new Set());
  const lengths = useMemo(() => all.filter((x) => x.group === "roadcol" && x.col === "len"), [all]);
  const totalField = useMemo(() => all.find((x) => x.road_total), [all]);
  const set = (cell: string, v: CellValue) => {
    const next: Inputs = { ...draft, [cell]: v };
    const f = all.find((x) => x.cell === cell);
    if (f?.road_total) spreadRoadTotal(next, v);
    else if (f?.group === "roadcol" && f.col === "len" && totalField) next[totalField.cell] = round2(lengths.reduce((a, x) => a + (isNum(next[x.cell]) ? (next[x.cell] as number) : 0), 0));
    onChange(next);
  };
  // Road Length is the total of the per-line lengths (the original app's shortcut): typing a total spreads it
  // over the lines in proportion to their lengths, or puts it all on the first line in use when none has one yet.
  function spreadRoadTotal(next: Inputs, total: CellValue) {
    if (!lengths.length || !isNum(total) || total < 0) return;
    const cur = lengths.map((x) => (isNum(next[x.cell]) ? (next[x.cell] as number) : 0)), sum = cur.reduce((a, b) => a + b, 0);
    let out: number[];
    if (sum > 0) {
      out = cur.map((v) => round2((v * total) / sum));
      const big = out.indexOf(Math.max(...out)); // keep the total exact after rounding
      out[big] = round2(out[big] + total - out.reduce((a, b) => a + b, 0));
    } else {
      const i = Math.max(0, lengths.findIndex((x) => String(next[x.road as string] ?? "No") !== "No"));
      out = lengths.map((_, j) => (j === i ? total : 0));
    }
    lengths.forEach((x, j) => { next[x.cell] = out[j] === 0 && !isNum(next[x.cell]) ? null : out[j]; });
  }
  // changed against R0 (amber) unless someone's colour already marks it as changed in this revision
  const changed = (cell: string) => !!base && String(base.inputs[cell] ?? "") !== String(draft[cell] ?? "") && !authors?.get(cell);
  const val = (cell: string, v: CellValue) => {
    const f = all.find((x) => x.cell === cell);
    if (blank(v)) return "–";
    return f ? (f.kind === "percent" && isNum(v) ? fmtInput(f, v) + " %" : isNum(v) ? fmtCalc(f, v) : String(v)) : String(v);
  };
  // who changed it, when, and from → to (hover), and their colour
  const hover = (cell: string) => {
    const a = authors?.get(cell);
    return a ? `${a.by.name} · ${a.at ? fmtDateTime(a.at) : "not saved yet"}: ${val(cell, a.from)} → ${val(cell, a.to)}${a.count > 1 ? ` (changed ${a.count} times)` : ""}` : undefined;
  };
  const paint = (cell: string, strength?: number) => { const a = authors?.get(cell); return a ? tint(a.by.colour, strength) : undefined; };
  const byChip = (cell: string) => {
    const a = authors?.get(cell);
    return a && <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium" style={{ color: a.by.colour }}><span aria-hidden className="size-2 rounded-full" style={{ background: a.by.colour }} />{a.by.name}{a.at ? "" : " (not saved)"}</span>;
  };
  const fieldDelta = (f: Field) => {
    if (!base) return null;
    const t = f.kind === "calc" ? deltaText(f, snap.calc[f.cell], base.calc[f.cell]) : deltaText(f, draft[f.cell], base.inputs[f.cell]);
    return t && <small className="block text-right text-xs text-soft"><b className={t.up === null ? "text-ink" : t.up ? "text-bad" : "text-good"}>{t.head}</b>{t.tail}</small>;
  };
  // each road line's cost now against R0 (its Master Budget line), matched by row or, across templates, by description
  const baseTotalOf = useMemo(() => {
    if (!base) return null;
    if (base.sameTemplate) { const byRow = new Map(base.master.map((r) => [r.row, r.c[5]])); return (row: number) => byRow.get(row); }
    const bKey = lineKey(base.master), mKey = lineKey(snap.master);
    const byKey = new Map(base.master.map((r) => [bKey[r.row], r.c[5]]));
    return (row: number) => byKey.get(mKey[row]);
  }, [base, snap.master]);
  function roadDelta(f: Field) {
    if (!base || !baseTotalOf) return null;
    const parts: string[] = [];
    if (String(draft[f.cell] ?? "") !== String(base.inputs[f.cell] ?? "")) parts.push(`Type: ${String(base.inputs[f.cell] ?? "–")} → ${String(draft[f.cell] ?? "–")}`);
    for (const c of all.filter((x) => (x.group === "roadcol" || x.group === "roadwidth") && x.road === f.cell)) {
      const d = c.kind === "calc" ? num0(snap.calc[c.cell]) - num0(base.calc[c.cell] ?? base.inputs[c.cell]) : num0(draft[c.cell]) - num0(base.inputs[c.cell]);
      if (Math.abs(d) > 1e-9) parts.push(`${c.label.split(" – ").pop()!.replace(/\s*\(.*\)$/, "")} ${d > 0 ? "+" : "−"}${inr(Math.abs(d), Number.isInteger(d) ? 0 : 2)}`);
    }
    const row = roadLineRow(m, f);
    const d = row ? num0(snap.master.find((r) => r.row === +row)?.c[5]) - num0(baseTotalOf(+row)) : 0;
    if (Math.abs(d) < 0.5 && !parts.length) return <span className="text-soft">–</span>;
    return <>
      {Math.abs(d) >= 0.5 && <b className={d > 0 ? "text-bad" : "text-good"}>{d > 0 ? "+" : "−"}₹ {inr(Math.abs(d))}</b>}
      {parts.length > 0 && <small className="block text-xs leading-snug text-soft">{parts.map((x) => <span key={x} className="block">{x}</span>)}</small>}
    </>;
  }

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
      // saucer drain, pathway and (version 2) the kerb stone multiplier follow the line it was added from; a new
      // line's kerb multiplier starts from the template's
      next[c.cell] = same && (c.col === "saucer" || c.col === "path" || c.col === "kerb") ? draft[same.cell] : c.col === "kerb" ? (m.defaults[c.cell] ?? null) : null;
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

  // under the name: the budget lines this input feeds, as the workbook names them ("Domestic Water Supply › Sluice
  // Valve Chamber - 75x 75 x 120 cm"), then the template's own note; an input that feeds none or many (Location)
  // gets a plain-words description instead (lib/field-help.ts)
  function describe(f: Field) {
    // a line named just like the input ("Boom Barrier") says nothing new
    const same = (a: string) => a.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const lines = (uses[f.cell] ?? []).filter((l) => same(l.line) !== same(f.label));
    const note = f.note && f.note !== fieldHelp(f.label) ? f.note : "";
    if (!lines.length) return (fieldHelp(f.label) || f.note) ? <small className="block text-sm text-soft">{fieldHelp(f.label) || f.note}</small> : null;
    return (
      <small className="block text-sm text-soft">
        {lines.map((l, i) => <span key={l.sheet + l.line}>{i > 0 && <span aria-hidden> · </span>}<span title={`${l.sheet} sheet`}>{l.line}</span></span>)}
        {note && <span className="block text-xs">{note}</span>}
      </small>
    );
  }

  function fieldRow(f: Field) {
    if (lightHidden(f)) return null;
    const lbl = typeof f.lightWidth === "string" && isNum(draft[f.lightWidth]) ? `External Lights – ${draft[f.lightWidth]} m road (line ${f.label.replace(/\D+/g, "")})` : f.label;
    return (
      <div key={f.cell} title={hover(f.cell)} style={f.kind !== "calc" ? paint(f.cell) : undefined} className={`grid grid-cols-1 gap-1 border-b border-line/70 px-2 py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_280px] sm:items-center ${f.kind === "calc" ? "bg-tint" : ""} ${f.kind !== "calc" && changed(f.cell) ? changedCls : ""}`}>
        <label htmlFor={"in-" + f.cell.replace(/[^A-Za-z0-9]/g, "_")}>
          <span className="font-medium">{lbl}</span><CellInfo m={m} cell={f.cell} />{f.kind !== "calc" && byChip(f.cell)}
          {f.kind === "calc" && <span className="ml-2 text-xs text-soft">calculated</span>}
          {describe(f)}
          {typeof f.detail === "string" && <small className="block text-sm text-soft">{fmtCalc({} as Field, snap.calc[f.detail])}</small>}
        </label>
        <div>{control(f)}{fieldDelta(f)}</div>
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
                {heads.map(([k, h]) => <th key={k} className="px-2 py-1.5 text-right" title={ROAD_COL_HELP[k]}>{h}{ROAD_COL_HELP[k] && <span aria-hidden className="ml-1 cursor-help normal-case">ⓘ</span>}</th>)}{base && <th className="min-w-36 px-2 py-1.5 text-right">Delta vs Base Line (R0)</th>}{typed && <th />}</tr>
            </thead>
            <tbody>
              {!lines.length && <tr><td colSpan={heads.length + 4} className="px-2 py-3 text-soft">No roads yet. Press “Add road”.</td></tr>}
              {lines.map((f) => {
                const v = String(draft[f.cell] ?? "No"), ok = avail[f.cell] ?? new Set((f.options || []).map(String));
                const opts = (f.options || []).map(String).filter((o) => ok.has(o) || o === v);
                return (
                  <tr key={f.cell} className={`border-t border-line ${v === "No" ? "text-soft" : ""} ${changed(f.cell) ? "bg-amber-soft/40" : ""}`}>
                    <td className="w-24 px-2 py-1" style={typeof f.widthCell === "string" ? paint(f.widthCell, 22) : undefined} title={typeof f.widthCell === "string" ? hover(f.widthCell) : undefined}>{typed && typeof f.widthCell === "string"
                      ? (editable ? <input type="number" step="any" min={0} className={inputCls} aria-label={`Width of road line ${f.line} (m)`} value={fmtInput({} as Field, draft[f.widthCell])} onChange={(e) => set(f.widthCell as string, parseInput({ kind: "number" } as Field, e.target.value))} /> : <b>{fmtInput({} as Field, draft[f.widthCell]) || "–"} m</b>)
                      : <b>{isNum(f.width) ? String(f.width) : ""} m</b>}</td>
                    <td className="min-w-56 px-2 py-1" style={paint(f.cell, 22)} title={hover(f.cell)}>
                      {editable ? <select className={inputCls} value={v} aria-label={`Road type for ${f.label}`} onChange={(e) => set(f.cell, e.target.value)}>
                        {opts.map((o) => <option key={o} value={o}>{o}{ok.has(o) ? "" : " – costs ₹ 0 here"}</option>)}
                      </select> : <span className="font-medium">{v}</span>}
                      {v !== "No" && typeof f.detail === "string" && <small className="block text-xs text-soft">{fmtCalc({} as Field, snap.calc[f.detail])}</small>}
                      {ok.size <= 1 && v === "No" && <small className="block text-xs text-soft">No road type has a {String(draft.C8)} rate for this width.</small>}
                      {v !== "No" && typeof f.widthCell === "string" && !(isNum(draft[f.widthCell]) && (draft[f.widthCell] as number) > 0) && <small className="block text-xs text-amber">Enter the road width.</small>}
                    </td>
                    {heads.map(([key]) => {
                      const c = all.find((x) => x.group === "roadcol" && x.road === f.cell && x.col === key);
                      if (!c) return <td key={key} />;
                      // a road line with no length costs nothing, so its other measurements stay hidden
                      const lf = lenOf(f);
                      if (key !== "len" && lf && !(isNum(draft[lf.cell]) && (draft[lf.cell] as number) > 0)) return <td key={key} className="px-2 py-1 text-right text-soft">–</td>;
                      if (c.kind === "calc") return <td key={key} className="px-2 py-1 text-right tabular-nums text-soft">{fmtCalc(c, snap.calc[c.cell])}</td>;
                      if (!editable) return <td key={key} style={paint(c.cell, 22)} title={hover(c.cell)} className={`px-2 py-2 text-right font-medium ${changed(c.cell) ? "bg-amber-soft" : ""}`}>{fmtInput(c, draft[c.cell]) || "–"}</td>;
                      return <td key={key} style={paint(c.cell, 22)} title={hover(c.cell)} className="w-24 px-2 py-1"><input type="number" step="any" min={0} className={`${inputCls} ${changed(c.cell) ? changedCls : ""}`} aria-label={c.label} value={fmtInput(c, draft[c.cell])} onChange={(e) => set(c.cell, parseInput(c, e.target.value))} /></td>;
                    })}
                    {base && <td className="min-w-36 px-2 py-1 text-right tabular-nums">{roadDelta(f)}</td>}
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
      {/* version 2's master workbook keeps notes on what its costs consider; read only, here for reference */}
      {!!m.notes?.length && (
        <details className="rounded-xl border border-line bg-sheet px-5 py-3">
          <summary className="cursor-pointer font-medium">Considerations in the master workbook <span className="text-sm font-normal text-soft">({m.notes.length})</span></summary>
          <ul className="mt-3 grid gap-2 text-sm">
            {m.notes.map((n, i) => (
              <li key={i}><b>{n.area}{n.item ? ` – ${n.item}` : ""}:</b> <span className="whitespace-pre-line text-soft">{n.text}</span></li>
            ))}
          </ul>
        </details>
      )}
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
