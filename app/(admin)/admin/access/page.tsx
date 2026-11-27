// Administration → Roles & access: who can do what. Role cards, the permission matrix (lib/roles.ts PERMISSIONS, the
// same rules the server and database apply), the project access levels, quick actions, and the workflow. The rules
// are fixed in the app (agreed with Rishabh, 2026-11-18 / 26 / 27); changes to a person are made on Team members
// (Change role…, Project access…) and recorded in Role activity.
import Link from "next/link";
import { ArrowRight, Check, ChevronRight, Crown, FolderKanban, History, Mail, Minus, ShieldCheck, UserRound, Users, type LucideIcon } from "lucide-react";
import { staffOrRedirect } from "@/lib/server/admin-guard";
import { ACCESS_HELP, ACCESS_LEVELS, ACCESS_NAME, PERMISSIONS, ROLE_NAME, ROLE_POINTS, type Can, type Role } from "@/lib/roles";

const ROLES: [Role, LucideIcon, string, string][] = [
  ["admin", Crown, "Full access", "bg-info-soft text-info"],
  ["subadmin", ShieldCheck, "One region", "bg-brand-soft text-brand"],
  ["member", UserRound, "Own teams", "bg-amber-soft text-amber"],
];

function Cell({ v }: { v: Can }) {
  return (
    <td className="px-3 py-2.5 text-center text-sm">
      {v === true ? <><Check className="mx-auto size-5 text-good" aria-hidden /><span className="sr-only">Yes</span></>
        : v === false ? <><Minus className="mx-auto size-5 text-soft" aria-hidden /><span className="sr-only">No</span></>
          : <span className="inline-block rounded-full bg-well px-2 py-0.5 text-xs font-medium">{v}</span>}
    </td>
  );
}

export default async function AccessPage() {
  const me = await staffOrRedirect();
  const isAdmin = me.role === "admin";
  const actions: [href: string, Icon: LucideIcon, title: string, text: string][] = [
    ...(isAdmin ? [["/admin/members", Users, "Change someone's role", "Team members → ⋯ → Change role…: member, sub-admin (with its region) or admin, with a preview of what changes."] as [string, LucideIcon, string, string]] : []),
    ["/admin/members", FolderKanban, "Manage project access", "Team members → ⋯ → Project access…: which projects, which department, and Edit / View only / Manage."],
    ["/admin/members?invite=1", Mail, "Send invites", "Invite someone with their department, role and projects; you get the sign-up link."],
    ...(isAdmin ? [["/admin/access/activity", History, "View role activity", "The read-only log of every role and access change, refused attempts included."] as [string, LucideIcon, string, string]] : []),
  ];

  return (
    <div className="grid gap-8">
      <div className="flex items-start gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"><ShieldCheck className="size-7" aria-hidden /></span>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Roles &amp; access</h1>
          <p className="text-soft">Who can do what in the app. The rules are fixed and the database enforces them too; a person&apos;s role and project access are changed on Team members.</p>
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        {ROLES.map(([role, Icon, tag, tone]) => (
          <div key={role} className="grid content-start gap-3 rounded-xl border border-line bg-sheet p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2.5 text-lg font-semibold"><span className={`grid size-9 place-items-center rounded-lg ${tone}`}><Icon className="size-5" aria-hidden /></span>{ROLE_NAME[role]}</h2>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>{tag}</span>
            </div>
            <ul className="grid gap-1.5 text-sm">{ROLE_POINTS[role].map((p) => <li key={p} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-good" aria-hidden />{p}</li>)}</ul>
          </div>
        ))}
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="grid gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-soft">Permission overview</h2>
          <div className="overflow-x-auto rounded-xl border border-line bg-sheet">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-well text-left text-xs uppercase tracking-wide text-soft">
                <tr><th className="px-3 py-2.5">Permission</th>{ROLES.map(([role, Icon]) => <th key={role} className="px-3 py-2.5 text-center"><span className="inline-flex items-center gap-1"><Icon className="size-3.5" aria-hidden />{ROLE_NAME[role]}</span></th>)}</tr>
              </thead>
              <tbody>
                {PERMISSIONS.map(([what, can]) => (
                  <tr key={what} className="border-t border-line"><td className="px-3 py-2.5 font-medium">{what}</td>{ROLES.map(([role]) => <Cell key={role} v={can[role]} />)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="grid gap-4">
          <section className="grid gap-1 rounded-xl border border-line bg-sheet p-4">
            <h2 className="mb-1 font-semibold">Quick actions</h2>
            {actions.map(([href, Icon, title, text]) => (
              <Link key={title} href={href} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-tint">
                <Icon className="size-5 shrink-0 text-brand" aria-hidden />
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{title}</span><span className="block text-xs text-soft">{text}</span></span>
                <ChevronRight className="size-4 shrink-0 text-soft" aria-hidden />
              </Link>
            ))}
          </section>
          <section className="grid gap-2 rounded-xl border border-line bg-sheet p-4">
            <h2 className="font-semibold">Project access levels</h2>
            <p className="text-sm text-soft">On each project, per department. Every department keeps at least one person at Edit or Manage.</p>
            <ul className="grid gap-2 text-sm">
              {ACCESS_LEVELS.map((a) => <li key={a}><span className={`mr-2 inline-block rounded px-1.5 py-0.5 text-xs font-medium ${a === "manage" ? "bg-brand-soft text-brand" : a === "edit" ? "bg-good-soft text-good" : "bg-well text-soft"}`}>{ACCESS_NAME[a]}</span>{ACCESS_HELP[a]}</li>)}
            </ul>
          </section>
        </div>
      </div>

      <section className="grid gap-3 rounded-xl border border-line bg-sheet p-5">
        <h2 className="text-lg font-semibold">The workflow</h2>
        <div className="flex flex-wrap items-center gap-2">
          {[["Base Line", "R0"], ["Design", "R0, R1…"], ["Operations", "R1…"], ["Management", "approves R1+"]].map(([d, r], i, all) => (
            <span key={d} className="flex items-center gap-2">
              <span className="rounded-lg border border-line bg-tint px-3 py-2 text-sm"><b>{d}</b><span className="block text-xs text-soft">{r}</span></span>
              {i < all.length - 1 && <ArrowRight className="size-4 text-soft" aria-hidden />}
            </span>
          ))}
        </div>
        <ul className="grid list-disc gap-1 pl-5 text-sm text-soft">
          <li>R0 freezes when Base Line submits it; R1 onwards freeze when Management approves.</li>
          <li>Each step emails the department that acts next. Delta is always against R0.</li>
          <li>Anyone on the team at Edit or Manage can change the open draft; only the department whose turn it is submits.</li>
        </ul>
      </section>
    </div>
  );
}
