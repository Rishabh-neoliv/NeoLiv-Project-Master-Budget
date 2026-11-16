"use client";
// Who changed this revision: each person's colour and how many inputs they changed last. Clicking a person shows
// only their changes; clicking again (or "Everyone") shows all.
import { tally, type Authored } from "@/lib/changes";

export function ChangeLegend({ authors, label, focus, onFocus }: { authors: Map<string, Authored>; label: string; focus: string | null; onFocus: (id: string | null) => void }) {
  const people = tally(authors);
  if (!people.length) return <p className="text-sm text-soft">No changes in the {label} yet. Each person&apos;s changes will show in their own colour.</p>;
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
      <span className="mr-1 text-soft">Changes in the {label}:</span>
      {people.map(({ person, cells }) => {
        const on = focus === person.id;
        return (
          <button key={person.id} type="button" onClick={() => onFocus(on ? null : person.id)} aria-pressed={on}
            title={on ? "Show everyone's changes" : `Show only ${person.name}'s changes`}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 ${on ? "border-ink font-semibold" : "border-line hover:border-soft"} ${focus && !on ? "opacity-50" : ""}`}>
            <span aria-hidden className="size-2.5 rounded-full" style={{ background: person.colour }} />
            {person.name} <span className="text-soft">{cells}</span>
          </button>
        );
      })}
      {focus && <button type="button" className="ml-1 text-brand hover:underline" onClick={() => onFocus(null)}>Everyone</button>}
      <span className="basis-full text-xs text-soft">Hover a coloured item to see who changed it, when, and from → to.</span>
    </div>
  );
}
