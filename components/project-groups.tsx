"use client";
// The project list's tables (app/(app)/projects/page.tsx builds the groups on the server): a search box over all of
// them, then one table per group. Click anywhere on a row to open the project.
import { useState } from "react";
import Link from "next/link";
import { ClickableRow } from "@/components/clickable-row";
import { InfoTip, SumLines } from "@/components/info-tip";
import { RevTag, StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { CONTINGENCY, crore, isNum, numCell } from "@/lib/budget";
import { fmtDateTime } from "@/lib/dates";
import type { Kind } from "@/lib/roles";
import { STATUS, type Status } from "@/lib/workflow";

export interface ProjectRow { id: string; name: string; status: Status; rev: string; grand_total: number | null; location: string | null; acre: number | null; kind: Kind; role: string; createdAt: string; createdBy: string | null }
export interface ProjectGroup { title: string; rows: ProjectRow[]; highlight?: boolean; test?: boolean }

// only the grand total is stored per project: the total before the master template's contingency is worked back from it
const beforeContingency = (gt: number | null) => (isNum(gt) ? gt / (1 + CONTINGENCY) : null);
const pct = `${+(CONTINGENCY * 100).toFixed(2)}%`;
const dash = (s: string) => (s && s !== "–" ? s : "–");

export function ProjectGroups({ groups }: { groups: ProjectGroup[] }) {
  const [q, setQ] = useState("");
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (p: ProjectRow) => { const t = `${p.name} ${p.location ?? ""} ${STATUS[p.status]?.[0] ?? p.status} ${p.rev} ${p.role}`.toLowerCase(); return words.every((w) => t.includes(w)); };
  const shown = groups.map((g) => ({ ...g, rows: g.rows.filter(hit) })).filter((g) => g.rows.length);
  const total = groups.reduce((n, g) => n + g.rows.length, 0), found = shown.reduce((n, g) => n + g.rows.length, 0);
  return (
    <div className="grid gap-8">
      {total > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects by name, place or status" aria-label="Search projects" className="max-w-sm bg-sheet" />
          {words.length > 0 && <span className="text-sm text-soft">{found} of {total}</span>}
        </div>
      )}
      {words.length > 0 && !found && <p className="rounded-xl border border-line bg-sheet p-5 text-soft">No project matches “{q}”.</p>}
      {shown.map((g) => <Group key={g.title} group={g} />)}
    </div>
  );
}

function Group({ group: { title, rows, highlight = false, test = false } }: { group: ProjectGroup }) {
  return (
    <section className="grid gap-2">
      <h2 className={`text-sm font-semibold uppercase tracking-wider ${highlight ? "text-brand" : "text-soft"}`}>{title} <span className="font-normal">({rows.length})</span></h2>
      <div className={`overflow-x-auto rounded-xl border bg-sheet ${highlight ? "border-brand/50" : "border-line"}`}>
        <table className="w-full">
          <thead className="bg-well text-left text-xs uppercase tracking-wide text-soft">
            <tr><th className="px-4 py-2.5">Project</th><th className="px-4 py-2.5">Revision</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Your role</th><th className="px-4 py-2.5 text-right">Area (acre)</th><th className="px-4 py-2.5 text-right">Cost / acre <span className="font-normal normal-case">(before {pct})</span></th><th className="px-4 py-2.5 text-right">Grand total</th></tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <ClickableRow key={p.id} href={`/projects/${p.id}`} label={`Open ${p.name}`} className="border-t border-line">
                <td className="px-4 py-3">
                  <Link href={`/projects/${p.id}`} className="font-semibold text-brand hover:underline">{p.name}</Link>
                  {/* the Test tag only where Test projects sit among others (Waiting for you); the Test projects section says it already */}
                  {p.kind === "test" && !test && <span className="ml-2 rounded bg-amber-soft px-1.5 py-0.5 text-xs font-medium text-amber">Test</span>}
                  <div className="text-sm text-soft">{p.location ? `${p.location} rates` : "–"}</div>
                  <div className="text-xs text-soft">Created {fmtDateTime(p.createdAt)}{p.createdBy ? ` by ${p.createdBy}` : ""}</div>
                </td>
                <td className="px-4 py-3"><RevTag>{p.rev}</RevTag></td>
                <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                <td className="px-4 py-3 text-soft">{dash(p.role)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{isNum(p.acre) ? numCell(p.acre) : "–"}</td>
                <td className="px-4 py-3 text-right tabular-nums">{(() => { const coc = beforeContingency(p.grand_total); return isNum(coc) && isNum(p.acre) && p.acre > 0 ? crore(coc / p.acre) : "–"; })()}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">
                  <span className="inline-flex items-center justify-end gap-1">
                    {isNum(p.grand_total) && (
                      <InfoTip label={`How the grand total of ${p.name} is made up`}>
                        <SumLines lines={[
                          ["Total COC (A + B)", crore(beforeContingency(p.grand_total))],
                          [`+ ${pct} for contingencies`, crore(p.grand_total - (beforeContingency(p.grand_total) as number))],
                          ["Grand total", crore(p.grand_total)],
                        ]} />
                      </InfoTip>
                    )}
                    {crore(p.grand_total)}
                  </span>
                </td>
              </ClickableRow>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
