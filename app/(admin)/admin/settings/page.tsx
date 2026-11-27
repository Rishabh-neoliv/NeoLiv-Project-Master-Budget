// Administration → Settings (admins), in tabs (user, 2026-11-27):
//   General           this copy of the app: version, address, current template, contingency, sign-in, email
//   Security & access sign-up and sign-in status (changed in Supabase), who has which role, links to roles and activity
//   Notifications     how emails go, which events send one, and the email delivery history (Power Automate outbox)
//   Master templates  the current template, how many are loaded, recent uploads
//   System health     the Security and setup checks (monitoring, not settings)
//   Data export       projects, members and role activity as CSV
// Read-only: each check says where its setting is changed (Supabase, Vercel, Power Automate). The workflow, roles and
// budget rules are fixed in the app or the master Excel on purpose.
import Link from "next/link";
import { Activity, Database, FileSpreadsheet, Info, Mail, ShieldCheck, type LucideIcon } from "lucide-react";
import { CsvDownload, type CsvCell } from "@/components/csv-download";
import { SetupChecks } from "@/components/setup-checks";
import { CONTINGENCY } from "@/lib/budget";
import { fmtDateTime } from "@/lib/dates";
import { linkExpired, memberRole } from "@/lib/members";
import { kindOf, ROLE_NAME } from "@/lib/roles";
import { adminOrRedirect } from "@/lib/server/admin-guard";
import { mailProvider } from "@/lib/server/mailer";
import { listMembers } from "@/lib/server/members";
import { authSettings, microsoftReady, setupStatus } from "@/lib/server/setup-status";
import { createAdminClient } from "@/lib/supabase/admin";
import { APP_VERSION } from "@/lib/version";
import { revLabel, STATUS, type Status } from "@/lib/workflow";

type Tab = "general" | "security" | "notifications" | "templates" | "health" | "data";
const TABS: [Tab, string, LucideIcon][] = [
  ["general", "General", Info],
  ["security", "Security & access", ShieldCheck],
  ["notifications", "Notifications", Mail],
  ["templates", "Master templates", FileSpreadsheet],
  ["health", "System health", Activity],
  ["data", "Data export", Database],
];
const MAIL: Record<string, string> = { microsoft365: "Microsoft 365 (sent straight away)", powerautomate: "Power Automate flow (within about 2 minutes)", resend: "Resend" };

function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid gap-px overflow-hidden rounded-xl border border-line bg-line">
      {rows.map(([k, v]) => <div key={k} className="grid gap-1 bg-sheet px-4 py-3 sm:grid-cols-[260px_1fr]"><dt className="text-soft">{k}</dt><dd className="font-medium">{v}</dd></div>)}
    </dl>
  );
}
const H2 = ({ children }: { children: React.ReactNode }) => <h2 className="text-sm font-semibold uppercase tracking-wider text-soft">{children}</h2>;

export default async function SettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  await adminOrRedirect();
  const sp = await searchParams;
  const tab: Tab = TABS.some(([t]) => t === sp.tab) ? (sp.tab as Tab) : "general";
  const db = createAdminClient();
  const provider = mailProvider();
  // the file name and who added it are kept in the template's model (as on Master templates)
  const current = async () => (await db.from("templates").select("stamp, modified, created_at, addedBy:model->>addedBy, source:model->>source").eq("is_current", true).maybeSingle()).data;

  let body: React.ReactNode = null;
  if (tab === "general") {
    const [cur, settings, { count }] = await Promise.all([current(), authSettings(), db.from("templates").select("stamp", { count: "exact", head: true })]);
    body = (
      <section className="grid gap-2">
        <H2>This copy of the app</H2>
        <Facts rows={[
          ["App version", APP_VERSION],
          ["Environment", process.env.VERCEL ? `Online (Vercel${process.env.VERCEL_ENV ? `, ${process.env.VERCEL_ENV}` : ""})` : "This computer (development)"],
          ["App address", process.env.APP_URL || "taken from the address you opened"],
          ["Current master template", cur ? <>saved in Excel {String(cur.modified || cur.stamp)}{cur.source ? <span className="block text-sm font-normal text-soft">{String(cur.source)}</span> : null}</> : "none"],
          ["Master templates loaded", <>{count ?? 0} · <Link href="/admin/settings?tab=templates" className="text-brand hover:underline">details</Link></>],
          ["Currency and time", "Indian rupees (₹, amounts in crore where shown); dates and times in India time"],
          ["Contingency on the cost of construction", `${+(CONTINGENCY * 100).toFixed(2)}% (from the master template's formulas; change it in the master Excel)`],
          ["Sign-in", microsoftReady(settings) ? "Email and password, and Sign in with Microsoft" : "Email and password"],
          ["Emails go through", provider ? MAIL[provider] ?? provider : "nothing (email is off)"],
        ]} />
      </section>
    );
  } else if (tab === "security") {
    const [checks, members] = await Promise.all([setupStatus(), listMembers()]);
    const live = members.filter((m) => m.status !== "removed");
    const count = (r: string) => live.filter((m) => memberRole(m) === r).length;
    body = (
      <div className="grid gap-6">
        <section className="grid gap-2">
          <H2>Sign-up and sign-in</H2>
          <SetupChecks checks={checks.filter((c) => /sign-up|sign-in|microsoft/i.test(c.label))} />
          <p className="text-sm text-soft">Password length, session length, two-step sign-in and sign-in limits are Supabase settings (Authentication → Sign In / Providers, Policies). They stay there on purpose: changing them from the app would need a Supabase management key inside the app.</p>
        </section>
        <section className="grid gap-2">
          <H2>Who has access</H2>
          <Facts rows={[
            [ROLE_NAME.admin, `${count("admin")}`],
            [ROLE_NAME.subadmin, `${count("subadmin")}${count("subadmin") ? ` · ${live.filter((m) => m.isSubadmin).map((m) => `${m.name} (${m.regions.join(", ") || "no region"})`).join(", ")}` : ""}`],
            [ROLE_NAME.member, `${count("member")}`],
            ["Waiting to sign in", `${members.filter((m) => m.status === "invited").length} (${members.filter((m) => linkExpired(m)).length} with an expired link)`],
            ["Removed (can't sign in)", `${members.length - live.length}`],
          ]} />
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Link href="/admin/access" className="text-brand hover:underline">Roles &amp; access →</Link>
            <Link href="/admin/access/activity" className="text-brand hover:underline">Role activity (audit log) →</Link>
            <Link href="/admin/members" className="text-brand hover:underline">Team members →</Link>
          </p>
        </section>
      </div>
    );
  } else if (tab === "notifications") {
    const [checks, { data: outbox, error }] = await Promise.all([
      setupStatus(),
      db.from("email_outbox").select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    body = (
      <div className="grid gap-6">
        <section className="grid gap-2">
          <H2>Email</H2>
          <SetupChecks checks={checks.filter((c) => /^email/i.test(c.label))} />
        </section>
        <section className="grid gap-2">
          <H2>What sends an email</H2>
          <Facts rows={[
            ["Each workflow step", "One email: the department that acts next in To (an approval: the whole team), the person who took the step in Cc. Starting design or operations work sends none."],
            ["Invites and new sign-up links", "One email to the person, unless an admin or sub-admin chose to send the link themselves."],
            ["Forgot password", "A reset link to the person."],
            ["No email", "Project created, someone added to a team, a role or access change."],
          ]} />
          <p className="text-sm text-soft">The wording and who receives each email were approved on 16 Nov 2026; changing them needs a new approval first.</p>
        </section>
        <section className="grid gap-2">
          <H2>Delivery history</H2>
          {provider !== "powerautomate" && <p className="text-sm text-soft">This list is kept only when emails go through Power Automate.</p>}
          {error ? <p className="text-sm text-soft">The email outbox isn&apos;t available.</p> : (
            <div className="overflow-x-auto rounded-xl border border-line bg-sheet">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-well text-left text-xs uppercase tracking-wide text-soft"><tr><th className="px-3 py-2.5">Queued</th><th className="px-3 py-2.5">To</th><th className="px-3 py-2.5">Cc</th><th className="px-3 py-2.5">Subject</th></tr></thead>
                <tbody>
                  {!(outbox ?? []).length && <tr><td colSpan={4} className="px-3 py-6 text-center text-soft">No emails yet.</td></tr>}
                  {(outbox ?? []).map((e) => (
                    <tr key={e.id as string} className="border-t border-line align-top">
                      <td className="whitespace-nowrap px-3 py-2 text-soft">{fmtDateTime(e.created_at as string)}</td>
                      <td className="px-3 py-2">{String(e.to).split(";").join(", ")}</td>
                      <td className="px-3 py-2 text-soft">{e.cc ? String(e.cc).split(";").join(", ") : "–"}</td>
                      <td className="px-3 py-2">{String(e.subject)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-soft">The last 50 emails the app handed to Power Automate. Whether each one arrived is in the flow&apos;s Run history in Power Automate.</p>
        </section>
      </div>
    );
  } else if (tab === "templates") {
    const [cur, { data: list }] = await Promise.all([
      current(),
      db.from("templates").select("stamp, modified, is_current, created_at, addedBy:model->>addedBy, source:model->>source").order("created_at", { ascending: false }).limit(10),
    ]);
    body = (
      <div className="grid gap-6">
        <section className="grid gap-2">
          <H2>Current master template</H2>
          <Facts rows={[
            ["Saved in Excel", cur ? String(cur.modified || cur.stamp) : "none"],
            ["File", cur?.source ? String(cur.source) : "–"],
            ["Added by", cur?.addedBy ? String(cur.addedBy) : "–"],
            ["Added to the app", cur?.created_at ? fmtDateTime(String(cur.created_at)) : "–"],
          ]} />
        </section>
        <section className="grid gap-2">
          <H2>Recent uploads</H2>
          <div className="overflow-x-auto rounded-xl border border-line bg-sheet">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-well text-left text-xs uppercase tracking-wide text-soft"><tr><th className="px-3 py-2.5">Saved in Excel</th><th className="px-3 py-2.5">File</th><th className="px-3 py-2.5">Added by</th><th className="px-3 py-2.5">Added</th></tr></thead>
              <tbody>
                {(list ?? []).map((t) => (
                  <tr key={t.stamp as string} className="border-t border-line">
                    <td className="px-3 py-2">{String(t.modified || t.stamp)}{t.is_current && <span className="ml-2 rounded bg-good-soft px-1.5 py-0.5 text-xs font-medium text-good">Current</span>}</td>
                    <td className="px-3 py-2 text-soft">{t.source ? String(t.source) : "–"}</td>
                    <td className="px-3 py-2">{t.addedBy ? String(t.addedBy) : "Set-up"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-soft">{fmtDateTime(String(t.created_at))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm"><Link href="/admin/templates" className="text-brand hover:underline">Master templates: upload a new one, make one current, download →</Link></p>
        </section>
      </div>
    );
  } else if (tab === "health") {
    const checks = await setupStatus();
    body = (
      <section className="grid gap-2">
        <H2>Security and setup checks{checks.some((c) => c.level === "bad") && <span className="ml-2 rounded bg-bad-soft px-1.5 py-0.5 text-xs normal-case tracking-normal text-bad">needs attention</span>}</H2>
        <SetupChecks checks={checks} />
        <p className="text-sm text-soft">These watch how the app is set up; they change nothing. Backups need Supabase Pro and are shown in Supabase, not here.</p>
      </section>
    );
  } else {
    // data export: built now, downloaded by the browser (nothing is sent anywhere)
    const [{ data: projects }, { data: people }, members, { data: log, error: logError }] = await Promise.all([
      db.from("projects").select("id, name, kind, region, location, status, last_rev, acre, grand_total, base_total, created_at, created_by, updated_at").order("created_at", { ascending: false }),
      db.from("profiles").select("id, name"),
      listMembers(),
      db.from("audit_log").select("at, kind, action, target_name, target_email, actor_name, project_name, before, after, reason, status, detail").order("at", { ascending: false }).limit(5000),
    ]);
    const nameOf = new Map((people ?? []).map((p) => [p.id as string, p.name as string]));
    const num = (v: unknown, d = 4) => (typeof v === "number" ? +v.toFixed(d) : null);
    const projectRows: CsvCell[][] = (projects ?? []).map((p) => [p.name, kindOf(p) === "test" ? "Test" : "Live", p.region, p.location, STATUS[p.status as Status]?.[0] ?? p.status, revLabel(p.status as Status, p.last_rev), num(p.acre, 2), num(p.base_total), num(p.grand_total), fmtDateTime(p.created_at), p.created_by ? nameOf.get(p.created_by) ?? "Former member" : "", fmtDateTime(p.updated_at)]);
    const memberRows: CsvCell[][] = members.map((m) => [m.name, m.email, m.department, ROLE_NAME[memberRole(m)], m.regions.join(", "), m.status === "invited" && linkExpired(m) ? "Invited (link expired)" : m.status, m.lastSignIn ? fmtDateTime(m.lastSignIn) : "", m.projects]);
    const j = (v: unknown) => (v ? JSON.stringify(v) : "");
    const logRows: CsvCell[][] = (log ?? []).map((r) => [fmtDateTime(r.at), r.kind, r.action, r.target_name, r.target_email, r.actor_name, r.project_name, j(r.before), j(r.after), r.reason, r.status, r.detail]);
    const card = "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-sheet p-4";
    body = (
      <section className="grid gap-3">
        <H2>Download as CSV (opens in Excel)</H2>
        <div className={card}><div><b>Projects</b><div className="text-sm text-soft">{projectRows.length} projects: kind, region, status, revision, area, R0 and grand totals (₹ Cr), created and changed</div></div>
          <CsvDownload filename="projects.csv" rows={projectRows} header={["Project", "Kind", "Region", "Rates location", "Status", "Revision", "Area (acre)", "R0 total (Rs Cr)", "Grand total (Rs Cr)", "Created", "Created by", "Last change"]} /></div>
        <div className={card}><div><b>Members</b><div className="text-sm text-soft">{memberRows.length} people: department, role, region, status, last sign-in, number of projects</div></div>
          <CsvDownload filename="members.csv" rows={memberRows} header={["Name", "Email", "Department", "Role", "Region", "Status", "Last signed in", "Projects"]} /></div>
        <div className={card}><div><b>Role activity</b><div className="text-sm text-soft">{logError ? "Switched on by migration 0008 (not run yet)." : `${logRows.length} records of role and access changes`}</div></div>
          <CsvDownload filename="role-activity.csv" rows={logRows} header={["Date and time", "Type", "Activity", "Member", "Email", "Changed by", "Project", "Before", "After", "Reason", "Status", "Detail"]} /></div>
        <p className="text-sm text-soft">Budget, workflow and project-rate reports are on <Link href="/admin/reports" className="text-brand hover:underline">Reports</Link>. A frozen revision&apos;s Excel is on its project&apos;s Revisions tab.</p>
      </section>
    );
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-soft">How this copy of the app is set up. Each check says where its setting is changed (Supabase, Vercel or Power Automate); nothing here changes data.</p>
      </div>
      <nav aria-label="Settings" className="flex flex-wrap gap-1.5 border-b border-line pb-3">
        {TABS.map(([t, label, Icon]) => (
          <Link key={t} href={`/admin/settings?tab=${t}`} aria-current={tab === t ? "page" : undefined}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm ${tab === t ? "bg-brand font-medium text-accent-ink" : "text-soft hover:bg-well hover:text-ink"}`}>
            <Icon className="size-4" aria-hidden />{label}
          </Link>
        ))}
      </nav>
      {body}
    </div>
  );
}
