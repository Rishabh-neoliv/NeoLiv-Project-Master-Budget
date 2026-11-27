// Admin panel → Overview: people, where every project stands, and the latest activity. Admins see every project and
// the Security and setup checks; sub-admins see Live projects only, without the setup checks (lib/roles.ts).
import Link from "next/link";
import { ClickableRow } from "@/components/clickable-row";
import { Initials } from "@/components/initials";
import { RevTag, StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { crore } from "@/lib/budget";
import { withoutBaseLine } from "@/lib/changes";
import { kindOf } from "@/lib/roles";
import { staffOrRedirect } from "@/lib/server/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEPTS, dn, revLabel, STATUS, type Status } from "@/lib/workflow";
import { fmtShortDateTime } from "@/lib/dates";
import { setupStatus, type Level } from "@/lib/server/setup-status";

const LEVEL: Record<Level, [string, string]> = {
  good: ["✓", "bg-good-soft text-good"], bad: ["!", "bg-bad-soft text-bad"], warn: ["!", "bg-amber-soft text-amber"], info: ["i", "bg-info-soft text-info"],
};

const fmtDate = fmtShortDateTime;

export default async function AdminOverview() {
  const me = await staffOrRedirect();
  const isAdmin = me.role === "admin";
  const db = createAdminClient();
  const [{ data: projects }, { data: people }, { data: auth }, { data: recent }, { data: teams }, checks] = await Promise.all([
    db.from("projects").select("*").order("updated_at", { ascending: false }),
    db.from("profiles").select("id, name"),
    db.auth.admin.listUsers({ perPage: 1000 }),
    db.from("activity").select("id, at, by, dept, action, comment, project_id, rev, kind:details->>kind").order("at", { ascending: false }).limit(200),
    db.from("project_members").select("project_id"),
    isAdmin ? setupStatus() : Promise.resolve([]),
  ]);
  // a sub-admin's overview covers the Live projects of their regions only
  const rows = ((projects ?? []) as { id: string; name: string; region: string; status: Status; last_rev: number | null; grand_total: number | null; updated_at: string; kind?: string }[])
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

  const card = "rounded-xl border border-line bg-sheet p-5";
  return (
    <div className="grid max-w-6xl gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
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
          <div className="mt-1 text-sm text-soft">{invited ? <span className="text-amber">{invited} haven&apos;t signed in yet</span> : "all signed in"}{removed ? ` · ${removed} removed` : ""}</div>
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

      {isAdmin && <section className="grid gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-soft">
          Security and setup{checks.some((c) => c.level === "bad") && <span className="ml-2 rounded bg-bad-soft px-1.5 py-0.5 text-xs normal-case tracking-normal text-bad">needs attention</span>}
        </h2>
        <ul className="grid gap-px overflow-hidden rounded-xl border border-line bg-line">
          {checks.map((c) => (
            <li key={c.label} className="flex gap-3 bg-sheet px-4 py-3">
              <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${LEVEL[c.level][1]}`} aria-hidden>{LEVEL[c.level][0]}</span>
              <div className="min-w-0">
                <div className="font-medium">{c.label}</div>
                <div className="text-sm text-soft">{c.detail}</div>
                {c.fix && c.level !== "good" && <div className="mt-0.5 text-sm">{c.level === "info" ? "To turn on: " : "Fix: "}{c.fix}</div>}
                {c.fix && c.level === "good" && <div className="mt-0.5 text-sm text-soft">{c.fix}</div>}
              </div>
            </li>
          ))}
        </ul>
      </section>}

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
