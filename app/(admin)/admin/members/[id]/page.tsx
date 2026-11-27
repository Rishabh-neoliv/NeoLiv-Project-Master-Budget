// Admin panel → Team members → a member (the 👁 on their row): who they are, their role and sign-in status, the projects
// they're on (in which department) and what they did lately. Admins and sub-admins; a sub-admin sees only the
// projects they can see themselves (lib/roles.ts). Read-only: changes are made on Team members (edit, ⋯) and on each
// project's Team tab.
import Link from "next/link";
import { notFound } from "next/navigation";
import { Crown, Mail, ShieldCheck } from "lucide-react";
import { Initials } from "@/components/initials";
import { RevTag, StatusBadge } from "@/components/status-badge";
import { crore } from "@/lib/budget";
import { fmtDateTime, fmtShortDateTime } from "@/lib/dates";
import { linkExpired, memberRole } from "@/lib/members";
import { canSeeProject, kindOf, ROLE_NAME } from "@/lib/roles";
import { staffOrRedirect } from "@/lib/server/admin-guard";
import { listMembers } from "@/lib/server/members";
import { createAdminClient } from "@/lib/supabase/admin";
import { dn, revLabel, type Status } from "@/lib/workflow";

export default async function MemberPage({ params }: PageProps<"/admin/members/[id]">) {
  const me = await staffOrRedirect();
  const { id } = await params;
  const db = createAdminClient();
  const [members, { data: teams }, { data: mine }] = await Promise.all([
    listMembers(),
    db.from("project_members").select("project_id, dept").eq("user_id", id),
    db.from("project_members").select("project_id").eq("user_id", me.id),
  ]);
  const m = members.find((x) => x.id === id);
  if (!m) notFound();
  const myProjects = new Set((mine ?? []).map((t) => t.project_id as string));
  const ids = [...new Set((teams ?? []).map((t) => t.project_id as string))];
  const [{ data: rows }, { data: acts }] = await Promise.all([
    ids.length ? db.from("projects").select("id, name, region, location, kind, status, last_rev, grand_total, updated_at").in("id", ids).order("updated_at", { ascending: false }) : Promise.resolve({ data: [] }),
    db.from("activity").select("id, at, action, comment, project_id").eq("by", id).order("at", { ascending: false }).limit(60),
  ]);
  // only what the viewer may see themselves
  const visible = (p: { id: string; kind?: string; region: string }) => canSeeProject(me.role, kindOf(p), myProjects.has(p.id), p.region, me.regions);
  const projects = ((rows ?? []) as { id: string; name: string; region: string; location: string | null; kind?: string; status: Status; last_rev: number | null; grand_total: number | null; updated_at: string }[]).filter(visible);
  const hidden = ((rows ?? []) as unknown[]).length - projects.length;
  const deptsOf = new Map<string, string[]>();
  for (const t of teams ?? []) deptsOf.set(t.project_id, [...(deptsOf.get(t.project_id) ?? []), t.dept]);
  const { data: actProjects } = acts?.length ? await db.from("projects").select("id, name, region, kind").in("id", [...new Set(acts.map((a) => a.project_id as string))]) : { data: [] };
  const projectOf = new Map((actProjects ?? []).filter(visible).map((p) => [p.id as string, p.name as string]));
  const activity = (acts ?? []).filter((a) => projectOf.has(a.project_id)).slice(0, 20);

  const r = memberRole(m), expired = linkExpired(m);
  const status = m.status === "removed" ? ["Removed – can't sign in", "bg-well text-soft"] : m.status === "active" ? ["Active", "bg-good-soft text-good"] : expired ? ["Invited – link expired", "bg-bad-soft text-bad"] : ["Invited – hasn't signed in yet", "bg-amber-soft text-amber"];
  const facts: [string, React.ReactNode][] = [
    ["Department", m.department || "–"],
    ["Role", <>{ROLE_NAME[r]}{r === "subadmin" ? ` · ${m.regions.join(", ") || "no region yet"}` : ""}</>],
    ["Signs in with", m.status === "invited" ? "– (not yet)" : m.microsoft ? "Microsoft (NeoLiv account)" : "Email and password"],
    ["Last signed in", m.lastSignIn ? fmtDateTime(m.lastSignIn) : "–"],
    ["Latest sign-up link", m.linkSentAt ? `${fmtDateTime(m.linkSentAt)}${expired ? " (expired)" : ""}` : "–"],
    ["Added", m.createdAt ? fmtDateTime(m.createdAt) : "–"],
  ];

  return (
    <div className="grid max-w-6xl gap-6">
      <Link href="/admin/members" className="w-fit text-sm text-brand hover:underline">← Team members</Link>
      <section className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-sheet p-5">
        <span className="scale-150 p-2"><Initials name={m.name || m.email} /></span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{m.name}</h1>
          <p className="flex items-center gap-1.5 text-soft"><Mail className="size-4" aria-hidden />{m.email}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${r === "admin" ? "bg-info-soft text-info" : r === "subadmin" ? "bg-brand-soft text-brand" : "bg-well text-soft"}`}>
              {r === "admin" ? <Crown className="size-3" aria-hidden /> : r === "subadmin" ? <ShieldCheck className="size-3" aria-hidden /> : null}{ROLE_NAME[r]}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status[1]}`}>{status[0]}</span>
          </div>
        </div>
      </section>

      <dl className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
        {facts.map(([k, v]) => <div key={k} className="bg-sheet px-4 py-3"><dt className="text-sm text-soft">{k}</dt><dd className="font-medium">{v}</dd></div>)}
      </dl>

      <section className="grid gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-soft">Projects ({projects.length})</h2>
        <div className="overflow-x-auto rounded-xl border border-line bg-sheet">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-well text-left text-xs uppercase tracking-wide text-soft"><tr><th className="px-4 py-2.5">Project</th><th className="px-4 py-2.5">Their department</th><th className="px-4 py-2.5">Revision</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5 text-right">Grand total</th></tr></thead>
            <tbody>
              {!projects.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-soft">{hidden ? "Only on projects you can't see." : "Not on any project's team yet. Base Line adds people on a project's Team tab."}</td></tr>}
              {projects.map((p) => (
                <tr key={p.id} className="border-t border-line">
                  <td className="px-4 py-3"><Link href={`/projects/${p.id}`} className="font-medium text-brand hover:underline">{p.name}</Link>{kindOf(p) === "test" && <span className="ml-2 rounded bg-amber-soft px-1.5 py-0.5 text-xs text-amber">Test</span>}<div className="text-xs text-soft">{p.location ?? p.region} rates</div></td>
                  <td className="px-4 py-3">{(deptsOf.get(p.id) ?? []).map(dn).join(" + ")}</td>
                  <td className="px-4 py-3"><RevTag>{revLabel(p.status, p.last_rev)}</RevTag></td>
                  <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{crore(p.grand_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {hidden > 0 && projects.length > 0 && <p className="text-xs text-soft">Also on {hidden} project(s) you can&apos;t see.</p>}
      </section>

      <section className="grid gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-soft">Recent activity</h2>
        {!activity.length ? <p className="rounded-xl border border-line bg-sheet p-4 text-sm text-soft">Nothing yet on projects you can see.</p> : (
          <ul className="grid gap-px overflow-hidden rounded-xl border border-line bg-line">
            {activity.map((a) => (
              <li key={a.id} className="bg-sheet px-4 py-2.5 text-sm">
                <div className="flex flex-wrap justify-between gap-2"><span>{a.action} · <Link href={`/projects/${a.project_id}`} className="font-medium text-brand hover:underline">{projectOf.get(a.project_id)}</Link></span><span className="text-xs text-soft">{fmtShortDateTime(a.at)}</span></div>
                {a.comment && <div className="text-xs text-soft">“{a.comment}”</div>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
