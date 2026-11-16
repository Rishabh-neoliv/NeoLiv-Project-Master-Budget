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

const COLOURS = 8;
/** A colour per person, in team order (people who aren't on the team, e.g. an admin, come after). */
export function colours(teamIds: string[], others: string[], names: Record<string, string>) {
  const ids = [...new Set([...teamIds, ...others])];
  return new Map(ids.map((id, i) => [id, { id, name: names[id] || "Someone", colour: `var(--who-${(i % COLOURS) + 1})` } as Person]));
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
    const by = people.get(r.by) ?? { id: r.by, name: "Someone", colour: "var(--soft)" };
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
