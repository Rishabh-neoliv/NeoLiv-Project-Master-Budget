"use client";
// The Reports page's charts (user, 2026-11-28), built to the dataviz method: one series per chart in one hue
// (--chart-bar), over / under a base in red / blue from a gray midline (--chart-over / --chart-under), status colours
// only with a label (--chart-warn / --chart-crit); colours validated on the app's light and dark cards
// (app/globals.css). Every mark is named and valued in text, has a hover tooltip, and the exact figures are in the
// table under the charts ("Show table"). Thin bars with a 4px rounded data end; recessive grid.
import { useState } from "react";
import { ChevronDown } from "lucide-react";

// ---- a floating tooltip for one mark
function useTip() {
  const [tip, setTip] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  const on = (lines: string[]) => ({
    onMouseMove: (e: React.MouseEvent) => { const r = (e.currentTarget.closest("[data-chart]") as HTMLElement).getBoundingClientRect(); setTip({ x: e.clientX - r.left, y: e.clientY - r.top, lines }); },
    onMouseLeave: () => setTip(null),
    onFocus: (e: React.FocusEvent) => { const c = (e.currentTarget.closest("[data-chart]") as HTMLElement).getBoundingClientRect(), r = e.currentTarget.getBoundingClientRect(); setTip({ x: r.left - c.left + r.width / 2, y: r.top - c.top, lines }); },
    onBlur: () => setTip(null),
  });
  const box = tip && (
    <div role="tooltip" className="pointer-events-none absolute z-20 max-w-64 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-sheet px-3 py-2 text-xs shadow-lg"
      style={{ left: tip.x, top: tip.y - 10 }}>
      {tip.lines.map((l, i) => <div key={i} className={i === 0 ? "font-semibold text-ink" : "text-soft"}>{l}</div>)}
    </div>
  );
  return { on, box };
}

export function ChartCard({ title, note, children, legend }: { title: string; note?: string; children: React.ReactNode; legend?: React.ReactNode }) {
  return (
    <figure className="grid content-start gap-3 rounded-xl border border-line p-4">
      <figcaption className="grid gap-0.5"><span className="font-semibold">{title}</span>{note && <span className="text-xs text-soft">{note}</span>}</figcaption>
      {legend && <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-soft">{legend}</div>}
      {children}
    </figure>
  );
}
export const Swatch = ({ color, label }: { color: string; label: string }) => (
  <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm" style={{ background: color }} />{label}</span>
);

// ---- horizontal bars: one series; optional marker (e.g. R0) and a status tone with its label
export interface HBar { label: string; value: number; display: string; href?: string; tip?: string[]; marker?: number; tone?: "warn" | "crit"; tag?: string }

export function HBars({ data, markerLabel, empty = "Nothing to show yet." }: { data: HBar[]; markerLabel?: string; empty?: string }) {
  const { on, box } = useTip();
  if (!data.length) return <p className="text-sm text-soft">{empty}</p>;
  const max = Math.max(...data.map((d) => Math.max(d.value, d.marker ?? 0)), 0) || 1;
  return (
    <div data-chart className="relative grid gap-2">
      {data.map((d, i) => {
        const color = d.tone === "crit" ? "var(--chart-crit)" : d.tone === "warn" ? "var(--chart-warn)" : "var(--chart-bar)";
        const name = d.href ? <a href={d.href} className="truncate text-brand hover:underline">{d.label}</a> : <span className="truncate">{d.label}</span>;
        return (
          <div key={i} tabIndex={0} {...on(d.tip ?? [d.label, d.display])} className="grid grid-cols-[minmax(0,180px)_1fr_auto] items-center gap-3 rounded-md text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand">
            {name}
            <span className="relative h-3 rounded-r-[4px] bg-[var(--chart-grid)]/50" aria-hidden>
              <span className="absolute inset-y-0 left-0 rounded-r-[4px]" style={{ width: `${Math.max((d.value / max) * 100, d.value > 0 ? 1.5 : 0)}%`, background: color }} />
              {d.marker !== undefined && <span className="absolute -inset-y-1 w-0.5 rounded bg-ink" style={{ left: `calc(${(d.marker / max) * 100}% - 1px)` }} />}
            </span>
            <span className="whitespace-nowrap text-right tabular-nums"><b className="font-semibold">{d.display}</b>{d.tag && <span className="ml-1.5 rounded px-1.5 py-0.5 text-xs font-medium" style={{ background: `color-mix(in srgb, ${color} 18%, transparent)` }}>{d.tag}</span>}</span>
          </div>
        );
      })}
      {markerLabel && <p className="flex items-center gap-1.5 text-xs text-soft"><span aria-hidden className="inline-block h-3 w-0.5 rounded bg-ink" />{markerLabel}</p>}
      {box}
    </div>
  );
}

// ---- bars either side of zero: over (right, red) and under (left, blue), from a gray midline. The value sits in its
// own column at the right end, so a long bar never pushes its label out of the card.
export interface DBar { label: string; sub?: string; value: number; display: string; href?: string; tip?: string[] }

export function DivergingBars({ data, over, under, empty = "Nothing to compare yet." }: { data: DBar[]; over: string; under: string; empty?: string }) {
  const { on, box } = useTip();
  if (!data.length) return <p className="text-sm text-soft">{empty}</p>;
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 0) || 1;
  return (
    <div data-chart className="relative grid gap-2">
      <div className="flex flex-wrap gap-x-4 text-xs text-soft"><Swatch color="var(--chart-under)" label={under} /><Swatch color="var(--chart-over)" label={over} /></div>
      {data.map((d, i) => {
        const w = (Math.abs(d.value) / max) * 50, up = d.value > 0;
        const name = d.href ? <a href={d.href} className="text-brand hover:underline">{d.label}</a> : <span>{d.label}</span>;
        return (
          <div key={i} tabIndex={0} {...on(d.tip ?? [d.label, d.display])} className="grid grid-cols-[minmax(0,200px)_1fr_auto] items-center gap-3 rounded-md text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand">
            <span className="grid min-w-0 leading-tight">{name}{d.sub && <span className="truncate text-xs text-soft">{d.sub}</span>}</span>
            <span className="relative h-5" aria-hidden>
              <span className="absolute inset-y-0 left-1/2 w-px bg-[var(--chart-mid)]" />
              <span className={`absolute top-1 h-3 ${up ? "rounded-r-[4px]" : "rounded-l-[4px]"}`} style={{ left: up ? "50%" : `${50 - w}%`, width: `${Math.max(w, 0.8)}%`, background: up ? "var(--chart-over)" : "var(--chart-under)" }} />
            </span>
            <span className="min-w-16 whitespace-nowrap text-right font-semibold tabular-nums">{d.display}</span>
          </div>
        );
      })}
      {box}
    </div>
  );
}

// ---- dots: x against y, with a dashed line through the overall ratio (e.g. average cost per acre)
export interface Dot { label: string; x: number; y: number; href?: string; tip?: string[] }

// x in acres, y in ₹ crore (formats fixed here: functions can't be passed from the server page)
const short = (v: number) => (v >= 100 ? Math.round(v) : +v.toFixed(v >= 10 ? 1 : 2)).toLocaleString("en-IN");
const xFmt = (v: number) => `${short(v)} ac`, yFmt = (v: number) => `₹${short(v)} Cr`;

export function DotChart({ data, xLabel, yLabel, ratio, ratioLabel, wide, empty = "Nothing to plot yet." }: {
  data: Dot[]; xLabel: string; yLabel: string; ratio?: number; ratioLabel?: string; wide?: boolean; empty?: string;
}) {
  const { on, box } = useTip();
  if (!data.length) return <p className="text-sm text-soft">{empty}</p>;
  // "wide" for a full-width card: a longer, lower plot so it doesn't grow tall
  const W = wide ? 1000 : 520, H = wide ? 300 : 280, L = 56, B = 36, T = 12, R = 16;
  // axes zoomed to where the dots are (not from zero), on round steps
  const range = (vals: number[]) => {
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = (hi - lo) * 0.15 || Math.max(Math.abs(hi) * 0.1, 1);
    lo = Math.max(0, lo - pad); hi += pad;
    const raw = (hi - lo) / 4, p = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw)!;
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const ticks: number[] = []; for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(6));
    return { lo, hi, ticks };
  };
  const X = range(data.map((d) => d.x)), Y = range(data.map((d) => d.y));
  const sx = (v: number) => L + ((v - X.lo) / (X.hi - X.lo)) * (W - L - R), sy = (v: number) => H - B - ((v - Y.lo) / (Y.hi - Y.lo)) * (H - B - T);
  // the average line y = ratio·x, clipped to the plot
  const seg = ratio && ratio > 0 ? [Math.max(X.lo, Y.lo / ratio), Math.min(X.hi, Y.hi / ratio)] : null;
  return (
    <div data-chart className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${yLabel} against ${xLabel}, ${data.length} projects`}>
        {Y.ticks.map((v) => <g key={`y${v}`}><line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} stroke="var(--chart-grid)" strokeWidth={1} /><text x={L - 6} y={sy(v) + 4} textAnchor="end" fontSize={11} fill="var(--soft)">{yFmt(v)}</text></g>)}
        {X.ticks.map((v) => <text key={`x${v}`} x={sx(v)} y={H - B + 16} textAnchor="middle" fontSize={11} fill="var(--soft)">{xFmt(v)}</text>)}
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke="var(--chart-mid)" strokeWidth={1} />
        {seg && seg[0] < seg[1] && <line x1={sx(seg[0])} y1={sy(seg[0] * ratio!)} x2={sx(seg[1])} y2={sy(seg[1] * ratio!)} stroke="var(--soft)" strokeWidth={1.5} strokeDasharray="5 4" />}
        {data.map((d, i) => (
          <circle key={i} cx={sx(d.x)} cy={sy(d.y)} r={4.5} fill="var(--chart-bar)" fillOpacity={0.85} stroke="var(--sheet)" strokeWidth={1.5} tabIndex={0}
            className="cursor-pointer outline-none focus-visible:stroke-[var(--ink)]" {...on(d.tip ?? [d.label, `${xFmt(d.x)} · ${yFmt(d.y)}`])}
            onClick={() => { if (d.href) window.location.href = d.href; }} />
        ))}
        <text x={(L + W - R) / 2} y={H - 4} textAnchor="middle" fontSize={11} fill="var(--soft)">{xLabel}</text>
        <text x={12} y={(T + H - B) / 2} textAnchor="middle" fontSize={11} fill="var(--soft)" transform={`rotate(-90 12 ${(T + H - B) / 2})`}>{yLabel}</text>
      </svg>
      {ratioLabel && <p className="flex items-center gap-1.5 text-xs text-soft"><svg width="22" height="6" aria-hidden><line x1="0" y1="3" x2="22" y2="3" stroke="var(--soft)" strokeWidth="1.5" strokeDasharray="5 4" /></svg>{ratioLabel}</p>}
      {box}
    </div>
  );
}

// ---- the exact table, opened on request under the charts
export function ShowTable({ children, label = "Show table" }: { children: React.ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="grid gap-2">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-fit items-center gap-1.5 text-sm font-medium text-brand hover:underline">
        <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />{open ? "Hide table" : label}
      </button>
      {open && children}
    </div>
  );
}

// ---- a few headline numbers, used when a chart would have a single bar (e.g. only one region)
export function Stats({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-3">
      {items.map((s) => <div key={s.label} className="rounded-lg bg-well px-3 py-2.5"><dt className="text-xs text-soft">{s.label}</dt><dd className="text-xl font-semibold tabular-nums">{s.value}</dd></div>)}
    </dl>
  );
}
