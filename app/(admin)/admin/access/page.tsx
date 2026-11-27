// Admin panel → Roles & access: who can do what, in plain words, and where each thing is changed. The rules
// themselves are fixed in the app (lib/roles.ts, lib/workflow.ts, agreed with Rishabh 2026-11-18 / 2026-11-26) and
// mirrored by the database; this page explains them and links to the places that use them.
import Link from "next/link";
import { ShieldCheck, Users, FolderKanban, Mail } from "lucide-react";
import { staffOrRedirect } from "@/lib/server/admin-guard";

const ROLES: [role: string, what: string[]][] = [
  ["Admin", [
    "Sees and opens every project, Live and Test, and can take any department's step on it.",
    "Creates Live and Test projects; deletes Test projects (Live projects are never deleted).",
    "Adds people, makes or removes admins and sub-admins (at least one admin always stays), uploads master templates.",
  ]],
  ["Sub-admin", [
    "Has one region (NCR, MMR, Alibaug or Nagpur), picked by an admin.",
    "Sees the Live projects of that region and acts for every department on them; creates Live projects there.",
    "Adds people and gets their sign-up link; removes, restores and edits ordinary members.",
    "Other projects only if on their team, like a member.",
  ]],
  ["Member", [
    "Sees only the projects they're on the team of, in the department(s) they have there.",
    "Anyone on the team can edit the open draft, rates and files; Submit and workflow steps stay with whose turn it is.",
    "Can add people: the sign-up link goes to the new person by email only.",
  ]],
];

export default async function AccessPage() {
  const me = await staffOrRedirect();
  const isAdmin = me.role === "admin";
  const card = "grid gap-2 rounded-xl border border-line bg-sheet p-5";
  const actions: [href: string, Icon: typeof Users, title: string, text: string][] = [
    ["/admin/members", Users, "Change someone's role", isAdmin ? "Team members → ⋯ on their row: Make admin, Make sub-admin (pick the region), Remove admin." : "Only admins change roles. You can edit, remove and restore ordinary members on Team members."],
    ["/admin/live", FolderKanban, "Project access", "Who works on a project, and in which department (Base Line, Design, Operations, Management), is set on the project's Team tab by its Base Line team, an admin, or the region's sub-admin."],
    [isAdmin ? "/admin/settings" : "/admin/members", Mail, "Invites", "Invite people from Team members. Admins and sub-admins can also set their department and projects, and get the sign-up link to send themselves. How emails are sent is on Settings."],
  ];

  return (
    <div className="grid max-w-5xl gap-8">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight"><ShieldCheck className="size-7 text-brand" aria-hidden />Roles &amp; access</h1>
        <p className="text-soft">Who can do what in the app. These rules are fixed (agreed with the project owner) and the database enforces them too, so this page explains them and shows where each thing is changed.</p>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        {ROLES.map(([role, what]) => (
          <div key={role} className={card}>
            <h2 className="text-lg font-semibold">{role}</h2>
            <ul className="grid list-disc gap-1.5 pl-5 text-sm">{what.map((w) => <li key={w}>{w}</li>)}</ul>
          </div>
        ))}
      </section>

      <section className="grid gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-soft">Where to change things</h2>
        <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line">
          {actions.map(([href, Icon, title, text]) => (
            <Link key={title} href={href} className="flex items-start gap-3 bg-sheet px-4 py-3 hover:bg-tint">
              <Icon className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
              <span><span className="font-medium">{title} →</span><span className="block text-sm text-soft">{text}</span></span>
            </Link>
          ))}
        </div>
      </section>

      <section className={card}>
        <h2 className="text-lg font-semibold">The workflow</h2>
        <p className="text-sm">Base Line → Design → Operations → Management. R0 freezes when Base Line submits it; R1 onwards freeze when Management approves. Each step emails the department that acts next. Delta is always against R0.</p>
      </section>
    </div>
  );
}
