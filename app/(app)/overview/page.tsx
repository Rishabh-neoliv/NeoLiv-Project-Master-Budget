// My overview: everyone's landing page. What's waiting for you, the projects you're on the team of, and the latest
// changes on them (each person in the colour the project screen gives them, lib/changes.ts). Reads with the
// signed-in person's own session, so row-level security decides what's visible (migration 0006). Base Line's work on
// R0 isn't listed or counted (lib/changes.ts afterBaseLine).
import Link from "next/link";
import { CircleCheck, FolderKanban, Hourglass, Info, PencilLine, type LucideIcon } from "lucide-react";
import { ClickableRow } from "@/components/clickable-row";
import { Initials } from "@/components/initials";
import { RevTag, StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { colours, withoutBaseLine } from "@/lib/changes";
import { fmtDateTime, fmtShortDateTime } from "@/lib/dates";
import { isStaff, kindOf, regionsOf, ROLE_NAME, roleOf } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { dn, nextRev, revLabel, STATUS, type Status } from "@/lib/workflow";
import { PageHeader } from "@/components/page-header";

interface Project { id: string; name: string; status: Status; last_rev: number | null; location: string | null; region: string; updated_at: string; created_at: string; created_by: string | null; kind?: string }
interface Activity { id: string; at: string; by: string | null; dept: string | null; action: string; comment: string | null; project_id: string; rev: number | null; kind: string | null }

// what the department whose turn it is has to do next
const NEXT: Record<Status, (rev: number) => string> = {
  DRAFT: (r) => `Fill in the parameters and submit R${r} to Design`,
  RETURNED: () => "Make the changes asked for and submit again",
  SUBMITTED: () => "Start design work, or send it back to Base Line",
  DESIGN_IN_PROGRESS: () => "Finish the design changes and submit to Operations",
  DESIGN_DONE: () => "Start operations",
  OPS_IN_PROGRESS: () => "Finish and submit to Management",
  WITH_MGMT: (r) => `Approve R${r}, or send it back to Operations`,
  APPROVED: () => "",
  COMPLETED: () => "",
};

const weekAgo = () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

export default async function MyOverview() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub as string;
  const [{ data: me }, { data: mine }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", uid).single(),
    supabase.from("project_members").select("*").eq("user_id", uid),
  ]);
  const role = roleOf(me);
  const deptsOf = new Map<string, string[]>();
  for (const m of mine ?? []) deptsOf.set(m.project_id, [...(deptsOf.get(m.project_id) ?? []), m.dept]);
  // "your turn" only where you can act: View-only rows (migration 0008) aren't counted
  const actsIn = new Map<string, string[]>();
  for (const m of mine ?? []) if ((m as { access?: string }).access !== "view") actsIn.set(m.project_id, [...(actsIn.get(m.project_id) ?? []), m.dept]);
  const ids = [...deptsOf.keys()];

  const [{ data: projects }, { data: teams }, { data: recent }, { data: week }, { data: r0 }] = ids.length
    ? await Promise.all([
      supabase.from("projects").select("id, name, region, status, last_rev, location, updated_at, created_at, created_by, kind").in("id", ids).order("updated_at", { ascending: false }),
      supabase.from("project_members").select("project_id, user_id").in("project_id", ids),
      supabase.from("activity").select("id, at, by, dept, action, comment, project_id, rev, kind:details->>kind").in("project_id", ids).order("at", { ascending: false }).limit(150),
      supabase.from("activity").select("at, project_id, rev, kind:details->>kind").in("project_id", ids).neq("by", uid).gte("at", weekAgo()).limit(2000),
      supabase.from("versions").select("project_id, frozen_at").in("project_id", ids).eq("rev", 0),
    ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const weekCount = withoutBaseLine((week ?? []) as { at: string; project_id: string; rev: number | null; kind: string | null }[], r0 ?? []).length;

  const rows = (projects ?? []) as Project[];
  const activity = withoutBaseLine((recent ?? []) as Activity[], r0 ?? []).slice(0, 40);
  const waiting = rows.filter((p) => { const d = STATUS[p.status][1]; return d && actsIn.get(p.id)?.includes(d); });
  const approved = rows.filter((p) => !STATUS[p.status][1]).length;
  const tests = rows.filter((p) => kindOf(p) === "test").length;
  const lastStep = new Map<string, Activity>();
  for (const a of activity) if (!lastStep.has(a.project_id)) lastStep.set(a.project_id, a);

  // names, and each person's colour per project (team order first, as on the project screen)
  const personIds = [...new Set([...(teams ?? []).map((t) => t.user_id), ...activity.map((a) => a.by), ...rows.map((p) => p.created_by)].filter(Boolean))] as string[];
  const { data: ppl } = personIds.length ? await supabase.from("profiles").select("id, name").in("id", personIds) : { data: [] };
  const names = Object.fromEntries((ppl ?? []).map((p) => [p.id, p.name as string]));
  const colourOf = new Map(ids.map((pid) => {
    const team = [...new Set((teams ?? []).filter((t) => t.project_id === pid).map((t) => t.user_id))];
    const others = [...activity].reverse().filter((a) => a.project_id === pid && a.by).map((a) => a.by!);
    return [pid, colours(team, others, names)];
  }));
  const projectName = new Map(rows.map((p) => [p.id, p.name]));
  const first = (me?.name || "").trim().split(/\s+/)[0];

  return (
    <div className="grid gap-8">
      <PageHeader title={first ? `Hello, ${first}` : "My overview"}
        description="What's waiting for you, the projects you're on, and what changed on them."
        actions={<>
          {isStaff(role) && <Link href="/admin" className={buttonVariants({ variant: "outline" })}>Admin dashboard</Link>}
          <Link href="/projects" className={buttonVariants({ variant: isStaff(role) ? "default" : "outline" })}>{role === "member" ? "My projects" : "All projects"}</Link>
        </>} />
      {isStaff(role) && (
        <p className="flex items-start gap-2 rounded-lg border border-info/30 bg-info-soft px-3 py-2 text-sm text-info">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span><b>{ROLE_NAME[role]}.</b> {role === "admin"
            ? "Below are only the projects you're on the team of. You can open and act on every project, Live and Test: see Projects or the Administration section of the menu."
            : `Below are only the projects you're on the team of. You can also open and act on the Live projects of your region (${regionsOf(me).join(", ") || "none yet: ask an admin"}): see Projects or the Administration section of the menu.`}</span>
        </p>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([
          [Hourglass, waiting.length, "Waiting for you", waiting.length ? "your department's turn" : "nothing to do right now", waiting.length ? "bg-brand text-accent-ink" : "bg-brand-soft text-brand", waiting.length > 0],
          [FolderKanban, rows.length, "My projects", `${rows.length - tests} Live${tests ? ` · ${tests} Test` : ""}`, "bg-info-soft text-info", false],
          [PencilLine, rows.length - approved, "In progress", `${approved} approved`, "bg-amber-soft text-amber", false],
          [CircleCheck, weekCount ?? 0, "Changes by others", "on your projects, last 7 days", "bg-good-soft text-good", false],
        ] as [LucideIcon, number, string, string, string, boolean][]).map(([Icon, value, label, note, tone, hot]) => (
          <div key={label} className={`flex items-center gap-3 rounded-xl border bg-sheet p-4 ${hot ? "border-brand/50" : "border-line"}`}>
            <span className={`grid size-11 shrink-0 place-items-center rounded-lg ${tone}`}><Icon className="size-5" aria-hidden /></span>
            <div className="min-w-0">
              <div className={`text-2xl font-semibold leading-tight ${hot ? "text-brand" : ""}`}>{value}</div>
              <div className="text-sm">{label}</div>
              <div className="truncate text-xs text-soft">{note}</div>
            </div>
          </div>
        ))}
      </section>

      {!rows.length && <p className="rounded-xl border border-line bg-sheet p-5 text-soft">You&apos;re not on any project&apos;s team yet. When someone adds you to one, it shows here.</p>}

      {waiting.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-brand">Waiting for you <span className="font-normal">({waiting.length})</span></h2>
          <div className="overflow-x-auto rounded-xl border border-brand/50 bg-sheet">
            <table className="w-full">
              <thead className="bg-well text-left text-xs uppercase tracking-wide text-soft"><tr><th className="px-4 py-2.5">Project</th><th className="px-4 py-2.5">Revision</th><th className="px-4 py-2.5">To do</th><th className="px-4 py-2.5">Last step</th></tr></thead>
              <tbody>
                {waiting.map((p) => {
                  const a = lastStep.get(p.id);
                  return (
                    <ClickableRow key={p.id} href={`/projects/${p.id}`} label={`Open ${p.name}`} className="border-t border-line">
                      <td className="px-4 py-3"><Name p={p} /><div className="text-sm text-soft">as {dn(STATUS[p.status][1]!)}</div></td>
                      <td className="px-4 py-3"><RevTag>{revLabel(p.status, p.last_rev)}</RevTag></td>
                      <td className="px-4 py-3 font-medium">{NEXT[p.status](nextRev(p.last_rev))}</td>
                      <td className="max-w-xl px-4 py-3 text-sm text-soft">{a ? <>
                        <div className="line-clamp-2" title={`${(a.by && names[a.by]) || "Former member"}: ${a.action}`}>{(a.by && names[a.by]) || "Former member"}: {a.action}</div>
                        <div className="text-xs">{fmtShortDateTime(a.at)}</div>
                        {a.comment && <div className="line-clamp-2 text-ink" title={a.comment}>“{a.comment}”</div>}
                      </> : fmtShortDateTime(p.updated_at)}</td>
                    </ClickableRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {rows.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-soft">My projects <span className="font-normal">({rows.length})</span></h2>
          <div className="overflow-x-auto rounded-xl border border-line bg-sheet">
            <table className="w-full">
              <thead className="bg-well text-left text-xs uppercase tracking-wide text-soft"><tr><th className="px-4 py-2.5">Project</th><th className="px-4 py-2.5">My role</th><th className="px-4 py-2.5">Revision</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Waiting for</th><th className="px-4 py-2.5 text-right">Last change</th></tr></thead>
              <tbody>
                {rows.map((p) => {
                  const a = lastStep.get(p.id);
                  return (
                    <ClickableRow key={p.id} href={`/projects/${p.id}`} label={`Open ${p.name}`} className="border-t border-line">
                      <td className="px-4 py-3"><Name p={p} /><div className="text-sm text-soft">{p.location || p.region} rates</div><div className="text-xs text-soft">Created {fmtDateTime(p.created_at)}{p.created_by ? ` by ${names[p.created_by] || "a former member"}` : ""}</div></td>
                      <td className="px-4 py-3 text-soft">{(deptsOf.get(p.id) ?? []).map(dn).join(" + ")}</td>
                      <td className="px-4 py-3"><RevTag>{revLabel(p.status, p.last_rev)}</RevTag></td>
                      <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                      <td className="px-4 py-3 text-soft">{STATUS[p.status][1] ? dn(STATUS[p.status][1]!) : "–"}</td>
                      <td className="px-4 py-3 text-right text-sm text-soft">{fmtShortDateTime(a?.at ?? p.updated_at)}{a?.by && <div>{names[a.by] || "Former member"}</div>}</td>
                    </ClickableRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activity.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-soft">Recent changes on my projects</h2>
          <ol className="grid gap-2">
            {activity.slice(0, 15).map((a) => {
              const person = a.by ? colourOf.get(a.project_id)?.get(a.by) : undefined;
              // no name: the account was deleted (every signed-in user can read every name)
              const name = (a.by && names[a.by]) || "Former member";
              return (
                <li key={a.id} className="rounded-lg border border-line bg-sheet px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <Initials name={name} colour={person?.colour} />
                      <span><b style={person ? { color: person.colour } : undefined}>{a.by === uid ? "You" : name}</b>{a.dept ? <span className="text-soft"> ({a.dept})</span> : ""}: {a.action} · <Link href={`/projects/${a.project_id}`} className="font-medium text-brand hover:underline">{projectName.get(a.project_id) ?? "project"}</Link></span>
                    </span>
                    <span className="text-sm text-soft">{fmtShortDateTime(a.at)}</span>
                  </div>
                  {a.comment && <p className="mt-1 pl-9 text-soft">{a.comment}</p>}
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}

function Name({ p }: { p: Project }) {
  return (
    <>
      <Link href={`/projects/${p.id}`} className="font-semibold text-brand hover:underline">{p.name}</Link>
      {kindOf(p) === "test" && <span className="ml-2 rounded bg-amber-soft px-1.5 py-0.5 text-xs font-medium text-amber">Test</span>}
    </>
  );
}
