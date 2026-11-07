"use client";
// Who works on a project, department by department. One person may cover several departments.
import { DEPTS, dn, type Dept } from "@/lib/workflow";

export interface Person { id: string; name: string; email: string }
export type Team = Record<Dept, string[]>;
export const emptyTeam = (): Team => ({ BD: [], Design: [], Operations: [], Management: [] });
export const teamFromRows = (rows: { user_id: string; dept: string }[]): Team => {
  const t = emptyTeam();
  for (const r of rows) if (r.dept in t && !t[r.dept as Dept].includes(r.user_id)) t[r.dept as Dept].push(r.user_id);
  return t;
};
export const teamToRows = (t: Team) => DEPTS.flatMap((d) => t[d].map((user_id) => ({ user_id, dept: d })));

const selectCls = "h-9 w-full rounded-lg border border-input bg-sheet px-2.5 text-sm";

export function TeamEditor({ team, people, onChange, lockedId }: { team: Team; people: Person[]; onChange: (t: Team) => void; lockedId?: string }) {
  const label = (id: string) => { const p = people.find((x) => x.id === id); return p ? p.name || p.email : "Former member"; };
  const add = (d: Dept, id: string) => id && onChange({ ...team, [d]: team[d].includes(id) ? team[d] : [...team[d], id] });
  const remove = (d: Dept, id: string) => onChange({ ...team, [d]: team[d].filter((x) => x !== id) });
  return (
    <div className="grid gap-3">
      {DEPTS.map((d) => (
        <div key={d} className="grid gap-2 rounded-lg border border-line bg-tint p-3 sm:grid-cols-[150px_1fr] sm:items-start">
          <span className="pt-1.5 font-medium">{dn(d)}</span>
          <div className="grid gap-2">
            <div className="flex flex-wrap gap-2">
              {!team[d].length && <span className="text-sm text-bad">Nobody yet</span>}
              {team[d].map((id) => (
                <span key={id} className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-sm">
                  {label(id)}
                  {!(d === "BD" && id === lockedId) && <button type="button" aria-label={`Remove ${label(id)} from ${dn(d)}`} onClick={() => remove(d, id)} className="text-soft hover:text-bad">×</button>}
                </span>
              ))}
            </div>
            <select className={selectCls} value="" aria-label={`Add someone to ${dn(d)}`} onChange={(e) => add(d, e.target.value)}>
              <option value="">Add someone to {dn(d)}…</option>
              {people.filter((p) => !team[d].includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name || p.email} ({p.email})</option>)}
            </select>
          </div>
        </div>
      ))}
      {!people.length && <p className="text-sm text-soft">No team members onboarded yet. Ask the admin to add people first.</p>}
    </div>
  );
}
