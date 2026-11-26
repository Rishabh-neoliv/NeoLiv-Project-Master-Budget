// Admin panel → Live projects / Test projects: every project of that type with its team, status and totals. Click a
// row to open it. On the Test tab admins can delete a project (Live projects are never deleted).
// The table fits a laptop screen without scrolling sideways (user, 2026-11-18): few columns, the area under the
// name, R0 under the current total, and text that wraps instead of a fixed minimum width.
import Link from "next/link";
import { ClickableRow } from "@/components/clickable-row";
import { RevTag, StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { crore, isNum } from "@/lib/budget";
import { fmtDay } from "@/lib/dates";
import type { Kind } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEPTS, dn, revLabel, type Status } from "@/lib/workflow";
import { DeleteProject } from "./delete-project";

interface Row { id: string; name: string; region: string; status: Status; last_rev: number | null; grand_total: number | null; base_total: number | null; location: string | null; acre: number | null; updated_at: string }

/** regions: only these regions' projects (a sub-admin); left out, every project */
export async function ProjectsList({ kind, title, intro, canDelete, regions }: { kind: Kind; title: string; intro: string; canDelete: boolean; regions?: string[] }) {
  const db = createAdminClient();
  const [{ data: projects }, { data: teams }, { data: people }] = await Promise.all([
    db.from("projects").select("id, name, region, status, last_rev, grand_total, base_total, location, acre, updated_at").eq("kind", kind).order("location").order("name"),
    db.from("project_members").select("project_id, user_id, dept"),
    db.from("profiles").select("id, name"),
  ]);
  const names = new Map((people ?? []).map((p) => [p.id, p.name]));
  const rows = ((projects ?? []) as Row[]).filter((p) => !regions || regions.includes(p.region));
  const teamOf = (pid: string) => (teams ?? []).filter((t) => t.project_id === pid);
  const th = "px-3 py-2.5 font-semibold";

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="max-w-3xl text-soft">{intro}</p>
        </div>
        <Link href={`/admin/${kind}/new`} className={buttonVariants()}>New {kind === "test" ? "Test" : "Live"} project</Link>
      </div>
      {!rows.length && <p className="rounded-xl border border-line bg-sheet p-5 text-soft">No {kind === "test" ? "Test" : "Live"} projects yet.</p>}
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-line bg-sheet">
          <table className="w-full text-sm">
            <thead className="bg-well text-left text-xs uppercase tracking-wide text-soft">
              <tr>
                <th className={th}>Project</th>
                <th className={th}>Stage</th>
                <th className={th}>Team</th>
                <th className={`${th} text-right`}>Budget</th>
                <th className={`${th} text-right`}>Changed</th>
                {canDelete && <th className={th}><span className="sr-only">Delete</span></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const team = teamOf(p.id);
                return (
                  <ClickableRow key={p.id} href={`/projects/${p.id}`} label={`Open ${p.name}`} className="border-t border-line align-top">
                    <td className="px-3 py-3">
                      <div className="text-[15px] font-semibold text-brand">{p.name}</div>
                      <div className="text-soft">{p.location ?? p.region} rates{isNum(p.acre) ? ` · ${p.acre} acre` : ""}</div>
                    </td>
                    <td className="px-3 py-3"><div className="flex flex-wrap gap-1.5"><RevTag>{revLabel(p.status, p.last_rev)}</RevTag><StatusBadge status={p.status} /></div></td>
                    <td className="px-3 py-3">
                      {team.length ? DEPTS.map((d) => {
                        const who = team.filter((t) => t.dept === d).map((t) => names.get(t.user_id) || "?");
                        return <div key={d}><span className="text-soft">{dn(d)}:</span> {who.length ? who.join(", ") : <span className="text-bad">nobody</span>}</div>;
                      }) : <span className="rounded bg-bad-soft px-1.5 py-0.5 text-xs font-medium text-bad">no team yet</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">
                      <div className="font-semibold">{crore(p.grand_total)}</div>
                      {p.base_total != null && <div className="text-xs text-soft" title="Frozen R0 budget">R0 {crore(p.base_total)}</div>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-soft">{fmtDay(p.updated_at)}</td>
                    {canDelete && <td className="whitespace-nowrap px-3 py-2 text-right"><DeleteProject id={p.id} name={p.name} /></td>}
                  </ClickableRow>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
