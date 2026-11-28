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

// ---- bars either side of zero: over (right, red) and under (left, blue), from a gray midline
export interface DBar { label: string; value: number; display: string; href?: string; tip?: string[] }

export function DivergingBars({ data, over, under, empty = "Nothing to compare yet." }: { data: DBar[]; over: string; under: string; empty?: string }) {
  const { on, box } = useTip();
  if (!data.length) return <p className="text-sm text-soft">{empty}</p>;
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 0) || 1;
  return (
    <div data-chart className="relative grid gap-2">
      <div className="flex flex-wrap gap-x-4 text-xs text-soft"><Swatch color="var(--chart-under)" label={under} /><Swatch color="var(--chart-over)" label={over} /></div>
      {data.map((d, i) => {
        const w = (Math.abs(d.value) / max) * 50, up = d.value > 0, zero = Math.abs(d.value) < 1e-9;
        return (
          <div key={i} tabIndex={0} {...on(d.tip ?? [d.label, d.display])} className="grid grid-cols-[minmax(0,180px)_1fr] items-center gap-3 rounded-md text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand">
            {d.href ? <a href={d.href} className="truncate text-brand hover:underline">{d.label}</a> : <span className="truncate">{d.label}</span>}
            <span className="relative h-5">
              <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-[var(--chart-mid)]" />
              {!zero && <span aria-hidden className={`absolute top-1 h-3 ${up ? "rounded-r-[4px]" : "rounded-l-[4px]"}`} style={{ left: up ? "50%" : `${50 - w}%`, width: `${Math.max(w, 0.8)}%`, background: up ? "var(--chart-over)" : "var(--chart-under)" }} />}
              <span className={`absolute top-0 whitespace-nowrap text-xs font-medium tabular-nums ${zero ? "left-1/2 ml-1.5 text-soft" : ""}`}
                style={zero ? undefined : up ? { left: `calc(${50 + w}% + 6px)` } : { right: `calc(${50 + w}% + 6px)` }}>{d.display}</span>
            </span>
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

export function DotChart({ data, xLabel, yLabel, ratio, ratioLabel, empty = "Nothing to plot yet." }: {
  data: Dot[]; xLabel: string; yLabel: string; ratio?: number; ratioLabel?: string; empty?: string;
}) {
  const { on, box } = useTip();
  if (!data.length) return <p className="text-sm text-soft">{empty}</p>;
  const W = 520, H = 280, L = 56, B = 36, T = 12, R = 16;
  const nice = (v: number) => { const p = 10 ** Math.floor(Math.log10(v || 1)); return Math.ceil((v * 1.08) / p) * p; };
  const xMax = nice(Math.max(...data.map((d) => d.x))), yMax = nice(Math.max(...data.map((d) => d.y)));
  const sx = (v: number) => L + (v / xMax) * (W - L - R), sy = (v: number) => H - B - (v / yMax) * (H - B - T);
  const ticks = (m: number) => [0, 0.25, 0.5, 0.75, 1].map((f) => f * m);
  return (
    <div data-chart className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${yLabel} against ${xLabel}, ${data.length} projects`}>
        {ticks(yMax).map((v) => <g key={`y${v}`}><line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} stroke="var(--chart-grid)" strokeWidth={1} /><text x={L - 6} y={sy(v) + 4} textAnchor="end" fontSize={11} fill="var(--soft)">{yFmt(v)}</text></g>)}
        {ticks(xMax).map((v) => <text key={`x${v}`} x={sx(v)} y={H - B + 16} textAnchor="middle" fontSize={11} fill="var(--soft)">{xFmt(v)}</text>)}
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke="var(--chart-mid)" strokeWidth={1} />
        {ratio !== undefined && ratio > 0 && (() => { const x2 = Math.min(xMax, yMax / ratio); return <line x1={sx(0)} y1={sy(0)} x2={sx(x2)} y2={sy(x2 * ratio)} stroke="var(--soft)" strokeWidth={1.5} strokeDasharray="5 4" />; })()}
        {data.map((d, i) => (
          <circle key={i} cx={sx(d.x)} cy={sy(d.y)} r={5} fill="var(--chart-bar)" stroke="var(--sheet)" strokeWidth={2} tabIndex={0}
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
