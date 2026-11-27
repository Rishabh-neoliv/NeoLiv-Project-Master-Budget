// A horizontal bar list: one series, one hue, each bar named and valued in text beside it (so nothing is read from
// colour alone), recessive track, thin bars with a 4px rounded end, and a hover tooltip per bar. For magnitudes on the
// Admin dashboard (budget by region, projects by stage). A zero shows as an empty track.
export interface Bar { label: string; value: number; display: string; note?: string; href?: string }

export function BarList({ bars, title, unit }: { bars: Bar[]; title: string; unit: string }) {
  const max = Math.max(...bars.map((b) => b.value), 0);
  return (
    <figure className="grid gap-2.5" aria-label={title}>
      {bars.map((b) => {
        const pct = max > 0 ? Math.max((b.value / max) * 100, b.value > 0 ? 2 : 0) : 0;
        const tip = `${b.label}: ${b.display}${b.note ? ` · ${b.note}` : ""}`;
        const row = (
          <div className="grid grid-cols-[110px_1fr_auto] items-center gap-3 text-sm" title={tip}>
            <span className="truncate text-soft">{b.label}</span>
            <span className="h-3 rounded-r-[4px] bg-well" aria-hidden>
              <span className="block h-3 rounded-r-[4px] bg-brand" style={{ width: `${pct}%` }} />
            </span>
            <span className="text-right tabular-nums"><b className="font-semibold">{b.display}</b>{b.note && <span className="block text-xs text-soft">{b.note}</span>}</span>
          </div>
        );
        return b.href ? <a key={b.label} href={b.href} className="rounded-md hover:bg-tint">{row}</a> : <div key={b.label}>{row}</div>;
      })}
      {/* the same numbers as a table, for screen readers */}
      <table className="sr-only"><caption>{title}</caption><thead><tr><th>Item</th><th>{unit}</th></tr></thead><tbody>{bars.map((b) => <tr key={b.label}><td>{b.label}</td><td>{b.display}{b.note ? ` (${b.note})` : ""}</td></tr>)}</tbody></table>
    </figure>
  );
}
