// Administration → Admin dashboard (it was "Overview"; renamed so it isn't confused with My overview, user 2026-11-27): people, where every project stands, and the latest activity. Admins see every project and
// a note when a Security and setup check needs attention (the checks are on Settings); sub-admins see Live projects only, without the setup checks (lib/roles.ts).
import Link from "next/link";
import { BarList } from "@/components/bar-list";
import { ClickableRow } from "@/components/clickable-row";
import { Initials } from "@/components/initials";
import { RevTag, StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { crore, isNum } from "@/lib/budget";
import { withoutBaseLine } from "@/lib/changes";
import { linkExpired } from "@/lib/members";
import { kindOf, REGIONS } from "@/lib/roles";
import { staffOrRedirect } from "@/lib/server/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEPTS, dn, revLabel, STATUS, type Status } from "@/lib/workflow";
import { fmtShortDateTime } from "@/lib/dates";
import { setupStatus } from "@/lib/server/setup-status";

const fmtDate = fmtShortDateTime;

export default async function AdminOverview() {
  const me = await staffOrRedirect();
  const isAdmin = me.role === "admin";
  const db = createAdminClient();
  const [{ data: projects }, { data: people }, { data: auth }, { data: recent }, { data: teams }, { data: steps }, checks] = await Promise.all([
    db.from("projects").select("*").order("updated_at", { ascending: false }),
    db.from("profiles").select("id, name"),
    db.auth.admin.listUsers({ perPage: 1000 }),
    db.from("activity").select("id, at, by, dept, action, comment, project_id, rev, kind:details->>kind").order("at", { ascending: false }).limit(200),
    db.from("project_members").select("project_id"),
    // the steps that start each project's current wait (as on Reports)
    db.from("activity").select("project_id, at, action").order("at", { ascending: false }).limit(5000),
    isAdmin ? setupStatus() : Promise.resolve([]),
  ]);
  // a sub-admin's overview covers the Live projects of their regions only
  const rows = ((projects ?? []) as { id: string; name: string; region: string; location: string | null; status: Status; last_rev: number | null; grand_total: number | null; acre: number | null; created_at: string; updated_at: string; kind?: string }[])
    .filter((p) => isAdmin || (kindOf(p) === "live" && me.regions.includes(p.region)));
  const shown = new Set(rows.map((p) => p.id));
  // Base Line's work on R0 isn't listed (lib/changes.ts afterBaseLine)
  const { data: r0 } = await db.from("versions").select("project_id, frozen_at").eq("rev", 0);
  const activity = withoutBaseLine((recent ?? []).filter((a) => shown.has(a.project_id)), r0 ?? []).slice(0, 15);
  const users = auth?.users ?? [];
  const removed = users.filter((u) => u.banned_until && new Date(u.banned_until) > new Date()).length;
  const invited = users.filter((u) => !u.last_sign_in_at && !(u.banned_until && new Date(u.banned_until) > new Date())).length;
  const names = new Map((people ?? []).map((p) => [p.id, p.name]));
  const projectName = new Map(rows.map((p) => [p.id, p.name]));
  const staffed = new Set((teams ?? []).map((t) => t.project_id));
  const noTeam = rows.filter((p) => !staffed.has(p.id));
  // projects waiting on each department
  const waitingOn = Object.fromEntries(DEPTS.map((d) => [d, rows.filter((p) => STATUS[p.status][1] === d)]));
  const approved = rows.filter((p) => !STATUS[p.status][1]).length;

  // ---- at a glance (user's choice 2026-11-27: the admin dashboard as a management view)
  // budget by region: Live projects; until there are any, the Test ones (said so)
  const live = rows.filter((p) => kindOf(p) === "live");
  const budgetRows = live.length ? live : rows;
  const placeOf = (p: { location: string | null; region: string }) => (p.location || p.region).trim();
  const regionBars = [...new Set([...REGIONS, ...budgetRows.map(placeOf)])].map((place) => {
    const list = budgetRows.filter((p) => placeOf(p) === place);
    const total = list.reduce((t, p) => t + (isNum(p.grand_total) ? p.grand_total : 0), 0);
    const acres = list.reduce((t, p) => t + (isNum(p.acre) && isNum(p.grand_total) ? p.acre : 0), 0);
    return { label: place, value: total, display: crore(total), note: `${list.length} project${list.length === 1 ? "" : "s"}${acres > 0 ? ` · ${crore(total / acres)}/acre` : ""}` };
  }).filter((b, i) => i < REGIONS.length || b.value > 0);
  // projects by stage
  const stageBars = [...DEPTS.map((d) => ({ label: dn(d), value: waitingOn[d].length })), { label: "Approved", value: approved }]
    .map((b) => ({ ...b, display: String(b.value), note: undefined as string | undefined }));
  // longest waiting: days since the step that started the current wait (or since creation)
  const STEP = /^(Created project|Submitted|Start design work|Start operations|Send back|Approve|Create new version|Created R\d)/;
  const lastStep = new Map<string, string>();
  for (const a of steps ?? []) if (shown.has(a.project_id) && STEP.test(a.action) && !lastStep.has(a.project_id)) lastStep.set(a.project_id, a.at);
  const nowMs = Date.parse(new Date().toISOString());
  const longest = rows.filter((p) => STATUS[p.status][1]).map((p) => {
    const since = lastStep.get(p.id) ?? p.created_at;
    return { p, dept: STATUS[p.status][1]!, days: Math.floor((nowMs - Date.parse(since)) / 86400000) };
  }).sort((a, b) => b.days - a.days).slice(0, 6);
  // team status
  const latestLink = (u: (typeof users)[number]) => [u.invited_at, u.recovery_sent_at, u.confirmation_sent_at].filter((t): t is string => !!t).sort().at(-1) ?? null;
  const expired = users.filter((u) => !u.last_sign_in_at && !(u.banned_until && new Date(u.banned_until) > new Date()) && linkExpired({ status: "invited", linkSentAt: latestLink(u) }, nowMs)).length;

  const card = "rounded-xl border border-line bg-sheet p-5";
  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Admin dashboard</h1>
          <p className="text-soft">{isAdmin ? "Where every project stands, and who has access." : `Where the Live projects of your region (${me.regions.join(", ") || "none yet: ask an admin"}) stand.`}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/members" className={buttonVariants({ variant: "outline" })}>Add a team member</Link>
          <Link href="/admin/live/new" className={buttonVariants()}>New Live project</Link>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/admin/members" className={`${card} hover:border-brand`}>
          <div className="text-sm text-soft">Team members</div>
          <div className="mt-1 text-3xl font-semibold">{users.length - removed}</div>
          <div className="mt-1 text-sm text-soft">{users.length - removed - invited} active{invited ? <> · <span className="text-amber">{invited} invited</span></> : ""}{expired ? <> · <span className="text-bad">{expired} link{expired > 1 ? "s" : ""} expired</span></> : ""}{removed ? ` · ${removed} removed` : ""}</div>
        </Link>
        <Link href="/admin/live" className={`${card} hover:border-brand`}>
          <div className="text-sm text-soft">{isAdmin ? "Projects (Live and Test)" : "Live projects"}</div>
          <div className="mt-1 text-3xl font-semibold">{rows.length}</div>
          <div className="mt-1 text-sm text-soft">{approved} approved · {rows.length - approved} in progress</div>
        </Link>
        <Link href="/admin/live" className={`${card} hover:border-brand`}>
          <div className="text-sm text-soft">Without a team</div>
          <div className={`mt-1 text-3xl font-semibold ${noTeam.length ? "text-bad" : ""}`}>{noTeam.length}</div>
          <div className="mt-1 text-sm text-soft">only admins{isAdmin ? "" : " and sub-admins"} can open these</div>
        </Link>
        <div className={card}>
          <div className="text-sm text-soft">Waiting on</div>
          <dl className="mt-2 grid gap-1 text-sm">
            {DEPTS.map((d) => <div key={d} className="flex justify-between"><dt>{dn(d)}</dt><dd className="font-semibold">{waitingOn[d].length}</dd></div>)}
          </dl>
        </div>
      </section>

      {/* the checks themselves are on Settings (user, 2026-11-27); here only a note when one needs attention */}
      {isAdmin && checks.some((c) => c.level === "bad" || c.level === "warn") && (
        <Link href="/admin/settings" className="flex flex-wrap items-center gap-2 rounded-xl border border-amber/40 bg-amber-soft px-4 py-3 text-amber hover:underline">
          <b>Security and setup needs attention:</b> {checks.filter((c) => c.level === "bad" || c.level === "warn").map((c) => c.label).join(", ")} → Settings
        </Link>
      )}

      <section className="grid gap-4 lg:grid-cols-3">
        <div className={`${card} grid content-start gap-3`}>
          <div className="flex items-baseline justify-between gap-2"><h2 className="font-semibold">Budget by region</h2><Link href="/admin/reports#budget" className="text-sm text-brand hover:underline">Report →</Link></div>
          <p className="-mt-2 text-xs text-soft">{live.length ? "Grand totals of Live projects" : "No Live projects yet: Test projects shown"}</p>
          <BarList title="Budget by region" unit="Grand total" bars={regionBars} />
        </div>
        <div className={`${card} grid content-start gap-3`}>
          <div className="flex items-baseline justify-between gap-2"><h2 className="font-semibold">Projects by stage</h2><Link href="/admin/reports#workflow" className="text-sm text-brand hover:underline">Report →</Link></div>
          <p className="-mt-2 text-xs text-soft">Who each project is waiting for</p>
          <BarList title="Projects by stage" unit="Projects" bars={stageBars} />
        </div>
        <div className={`${card} grid content-start gap-3`}>
          <div className="flex items-baseline justify-between gap-2"><h2 className="font-semibold">Waiting longest</h2><Link href="/admin/reports#workflow" className="text-sm text-brand hover:underline">Report →</Link></div>
          <p className="-mt-2 text-xs text-soft">Days since the last workflow step</p>
          {!longest.length ? <p className="text-sm text-soft">Nothing is waiting.</p> : (
            <ol className="grid gap-2">
              {longest.map(({ p, dept, days }) => (
                <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                  <Link href={`/projects/${p.id}`} className="min-w-0 truncate font-medium text-brand hover:underline">{p.name}</Link>
                  <span className="shrink-0 text-right"><b className={`tabular-nums ${days >= 7 ? "text-bad" : days >= 3 ? "text-amber" : ""}`}>{days} day{days === 1 ? "" : "s"}</b><span className="block text-xs text-soft">on {dn(dept)}</span></span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      <section className="grid gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-soft">Recently changed projects</h2>
        <div className="overflow-x-auto rounded-xl border border-line bg-sheet">
          <table className="w-full">
            <thead className="bg-well text-left text-xs uppercase tracking-wide text-soft"><tr><th className="px-4 py-2.5">Project</th><th className="px-4 py-2.5">Revision</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Waiting for</th><th className="px-4 py-2.5 text-right">Grand total</th><th className="px-4 py-2.5 text-right">Changed</th></tr></thead>
            <tbody>
              {rows.slice(0, 8).map((p) => (
                <ClickableRow key={p.id} href={`/projects/${p.id}`} label={`Open ${p.name}`} className="border-t border-line">
                  <td className="px-4 py-3 font-semibold text-brand">{p.name}{kindOf(p) === "test" && <span className="ml-2 rounded bg-well px-1.5 py-0.5 text-xs font-medium text-soft">Test</span>}{!staffed.has(p.id) && <span className="ml-2 rounded bg-bad-soft px-1.5 py-0.5 text-xs font-medium text-bad">no team</span>}</td>
                  <td className="px-4 py-3"><RevTag>{revLabel(p.status, p.last_rev)}</RevTag></td>
                  <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                  <td className="px-4 py-3 text-soft">{STATUS[p.status][1] ? dn(STATUS[p.status][1]!) : "–"}</td>
                  <td className="px-4 py-3 text-right font-medium">{crore(p.grand_total)}</td>
                  <td className="px-4 py-3 text-right text-soft">{fmtDate(p.updated_at)}</td>
                </ClickableRow>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-soft">Latest activity, {isAdmin ? "all projects" : "Live projects"}</h2>
        <ol className="grid gap-2">
          {activity.map((a) => (
            <li key={a.id} className="rounded-lg border border-line bg-sheet px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <Initials name={(a.by && names.get(a.by)) || "?"} />
                  <span><b>{(a.by && names.get(a.by)) || "Former member"}</b>{a.dept ? <span className="text-soft"> ({a.dept})</span> : ""}: {a.action} · <Link href={`/projects/${a.project_id}`} className="font-medium text-brand hover:underline">{projectName.get(a.project_id) ?? "project"}</Link></span>
                </span>
                <span className="text-sm text-soft">{fmtDate(a.at)}</span>
              </div>
              {a.comment && <p className="mt-1 pl-9 text-soft">{a.comment}</p>}
            </li>
          ))}
          {!activity.length && <li className="text-soft">Nothing yet.</li>}
        </ol>
      </section>
    </div>
  );
}
