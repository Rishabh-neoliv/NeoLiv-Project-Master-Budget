// Who changed what: each person on a project gets a colour, and every input / road / rate changed in a revision is
// shown in the colour of the person who last changed it. Built from the Activity log (each save records its field
// changes), so nothing new is stored. Shared by the project screen's tabs.
import type { CellValue } from "./budget";

export interface Person { id: string; name: string; colour: string }
export interface Authored { by: Person; at: string; from: CellValue; to: CellValue; count: number }
export interface ChangeRow {
  by: string | null; at: string; rev: number | null;
  details?: { changes?: { cell: string; label?: string; from: CellValue; to: CellValue }[]; kind?: string } | null;
}

/** Base Line's work on R0 isn't shown to anyone: no names, no list of changes, no colours (user, 2026-11-26). The
 *  history starts once R0 is frozen and goes to Design. True for what may be shown: after R0's freeze, and not
 *  R0's own steps (its creation, saves and submit carry rev 0; a later recalculation of R0 is shown). Nothing is
 *  shown while R0 is still a draft. */
export const afterBaseLine = (r0FrozenAt: string | null | undefined) => {
  const t = r0FrozenAt ? Date.parse(r0FrozenAt) : NaN;
  return (a: { at: string; rev?: number | null; details?: { kind?: string } | null }) =>
    Number.isFinite(t) && Date.parse(a.at) > t && (a.rev !== 0 || a.details?.kind === "recalc" || a.details?.kind === "template");
};

/** afterBaseLine across projects: activity rows (with project_id, rev and the kind of change) that may be shown,
 *  given each project's R0 freeze time. */
export function withoutBaseLine<T extends { project_id: string; at: string; rev?: number | null; kind?: string | null }>(rows: T[], r0: { project_id: string; frozen_at: string }[]) {
  const ok = new Map(r0.map((v) => [v.project_id, afterBaseLine(v.frozen_at)]));
  return rows.filter((a) => ok.get(a.project_id)?.({ at: a.at, rev: a.rev, details: { kind: a.kind ?? undefined } }) ?? false);
}

const COLOURS = 8;
/** A colour per person, in team order (people who aren't on the team, e.g. an admin, come after). */
export function colours(teamIds: string[], others: string[], names: Record<string, string>) {
  const ids = [...new Set([...teamIds, ...others])];
  return new Map(ids.map((id, i) => [id, { id, name: names[id] || "Former member", colour: `var(--who-${(i % COLOURS) + 1})` } as Person]));
}

/** For each cell, the last change made to revision `rev`, and by whom. Saves and submits carry their revision
 *  number (a submit's changes belong to the revision it froze); rate changes don't, so they count when they fall
 *  in the revision's time (after the previous freeze, until this one). Template moves and recalculations aren't
 *  anyone's edit, so they don't count. */
export function authorship(rows: ChangeRow[], rev: number, after: string | null, until: string | null, people: Map<string, Person>) {
  const out = new Map<string, Authored>();
  const mine = (r: ChangeRow) => (r.rev !== null && r.rev !== undefined ? r.rev === rev : (!after || r.at > after) && (!until || r.at <= until));
  const sorted = rows.filter(mine).sort((a, b) => a.at.localeCompare(b.at));
  for (const r of sorted) {
    if (!r.by || r.details?.kind === "template" || r.details?.kind === "recalc") continue;
    const by = people.get(r.by) ?? { id: r.by, name: "Former member", colour: "var(--soft)" };
    for (const c of r.details?.changes ?? []) {
      const prev = out.get(c.cell);
      // "from" stays the value before the first change in the window, so the hover shows the whole change
      out.set(c.cell, { by, at: r.at, from: prev ? prev.from : c.from, to: c.to, count: (prev?.count ?? 0) + 1 });
    }
  }
  return out;
}

/** How many cells each person changed last (for the legend). */
export function tally(authors: Map<string, Authored>) {
  const n = new Map<string, { person: Person; cells: number }>();
  for (const a of authors.values()) n.set(a.by.id, { person: a.by, cells: (n.get(a.by.id)?.cells ?? 0) + 1 });
  return [...n.values()].sort((a, b) => b.cells - a.cells);
}

/** Inline style for something changed by this person: a coloured left edge and a light tint of their colour. */
export const tint = (colour: string, strength = 14) => ({
  boxShadow: `inset 3px 0 0 ${colour}`,
  backgroundColor: `color-mix(in srgb, ${colour} ${strength}%, transparent)`,
});
