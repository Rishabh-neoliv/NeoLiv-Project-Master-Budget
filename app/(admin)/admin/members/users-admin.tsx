"use client";
// The people page (Admin panel → Team members, and the Members page every member can open): summary cards, tabs and
// filters, the members table with view / edit / ⋯ actions, pending invitations, quick links, and the invite pop-up.
// What each person can do follows lib/roles.ts: admins get every action; sub-admins the sign-up links, edit and
// remove/restore for ordinary members; other members can invite people and resend an invite to someone who hasn't
// signed in yet (the link then goes only by email). Each action asks to confirm first.
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Crown, Eye, Mail, MoreHorizontal, Pencil, Send, ShieldCheck, UserCheck, UserPlus, Users, ChevronLeft, ChevronRight, X, Settings, FolderKanban } from "lucide-react";
import { Initials } from "@/components/initials";
import { ProjectAccessDialog, RoleDialog } from "@/components/member-access-dialogs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtDay, fmtShortDateTime } from "@/lib/dates";
import { DEPARTMENTS } from "@/lib/departments";
import { linkExpired, memberRole, type Member } from "@/lib/members";
import { REGIONS, ROLE_NAME, type Role } from "@/lib/roles";
import { DEPTS, dn, type Dept } from "@/lib/workflow";

export type { Member };
export interface InviteProject { id: string; name: string; kind: "live" | "test"; region: string }

const PAGE = 15;
const MicrosoftMark = () => (
  <svg aria-hidden viewBox="0 0 21 21" className="size-3.5"><path fill="#f25022" d="M1 1h9v9H1z" /><path fill="#7fba00" d="M11 1h9v9h-9z" /><path fill="#00a4ef" d="M1 11h9v9H1z" /><path fill="#ffb900" d="M11 11h9v9h-9z" /></svg>
);
// a steady colour per person for their initials (the app's person colours, --who-1..8)
const colourFor = (id: string) => `var(--who-${([...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 8) + 1})`;
type StatusKey = "active" | "invited" | "expired" | "removed";
const statusOf = (m: Member): StatusKey => (m.status === "invited" && linkExpired(m) ? "expired" : m.status);
const STATUS_TAG: Record<StatusKey, [string, string]> = {
  active: ["Active", "bg-good-soft text-good"],
  invited: ["Invited", "bg-amber-soft text-amber"],
  expired: ["Link expired", "bg-bad-soft text-bad"],
  removed: ["Removed", "bg-well text-soft"],
};
type Tab = "all" | "staff" | "members" | "invited" | "removed";

export function UsersAdmin({ members, microsoft, meId, role, projects = [] }: { members: Member[]; microsoft: boolean; meId: string; role: Role; projects?: InviteProject[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const isAdmin = role === "admin";
  const staff = role !== "member";
  // whom this person manages (links back, edit, remove/restore): admins everyone, sub-admins ordinary members
  const manages = (m: Member) => isAdmin || (role === "subadmin" && !m.isAdmin && !m.isSubadmin);
  const admins = members.filter((m) => m.isAdmin && m.status !== "removed").length;
  const [busy, setBusy] = useState(false);
  // the latest sign-up link, shown so it can be copied and sent on Teams, WhatsApp or mail
  const [link, setLink] = useState<{ who: string; url: string; emailed: boolean; queued?: boolean; microsoft?: boolean } | null>(null);
  const sentNote = (l: NonNullable<typeof link>) => !l.emailed ? "" : l.queued ? " (queued for your Power Automate flow, which emails it within about 2 minutes)" : " (also emailed to them)";
  // Roles & access → "Send invites" opens the invite pop-up straight away (?invite=1)
  const [inviting, setInviting] = useState(params.get("invite") === "1");
  const [editing, setEditing] = useState<Member | null>(null);
  // the role and project-access pop-ups (components/member-access-dialogs.tsx)
  const [roleFor, setRoleFor] = useState<Member | null>(null);
  const [accessFor, setAccessFor] = useState<Member | null>(null);

  // tabs, filters, paging
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState(params.get("q") ?? "");
  const [dept, setDept] = useState("");
  const [roleF, setRoleF] = useState("");
  const [statusF, setStatusF] = useState("");
  const [page, setPage] = useState(0);
  const inTab = (m: Member, t: Tab) => t === "all" ? m.status !== "removed" : t === "staff" ? (m.isAdmin || m.isSubadmin) && m.status !== "removed" : t === "members" ? !m.isAdmin && !m.isSubadmin && m.status !== "removed" : t === "invited" ? m.status === "invited" : m.status === "removed";
  const departments = useMemo(() => [...new Set(members.map((m) => m.department).filter(Boolean))].sort(), [members]);
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = members.filter((m) => inTab(m, tab)
    && words.every((w) => `${m.name} ${m.email} ${m.department}`.toLowerCase().includes(w))
    && (!dept || (dept === "-" ? !m.department : m.department === dept))
    && (!roleF || memberRole(m) === roleF)
    && (!statusF || statusOf(m) === statusF));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE)), cur = Math.min(page, pages - 1);
  const shown = filtered.slice(cur * PAGE, cur * PAGE + PAGE);
  const reset = () => setPage(0);

  const live = members.filter((m) => m.status !== "removed");
  const invited = members.filter((m) => m.status === "invited");
  const expired = invited.filter((m) => linkExpired(m)).length;
  const cards: [Icon: typeof Users, value: number, label: string, note: string, tone: string][] = [
    [Users, live.length, "Members", `${members.length - live.length} removed`, "bg-brand-soft text-brand"],
    [UserCheck, live.filter((m) => m.status === "active").length, "Active", "have signed in", "bg-good-soft text-good"],
    [Mail, invited.length, "Pending invites", expired ? `${expired} link(s) expired` : "waiting to sign in", "bg-info-soft text-info"],
    [Crown, live.filter((m) => m.isAdmin || m.isSubadmin).length, "Admins & sub-admins", `${admins} admin(s)`, "bg-amber-soft text-amber"],
  ];

  async function call(url: string, method: string, body: unknown) {
    setBusy(true);
    try {
      const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const out = await res.json();
      if (!res.ok) { toast.error(out.error); return null; }
      router.refresh();
      return out;
    } finally { setBusy(false); }
  }
  async function setAdmin(m: Member, make: boolean) {
    const ask = make ? `Make ${m.name} an admin? They get the whole Administration section too; you stay admin.`
      : m.id === meId ? "Stop being admin? You become an ordinary member, without the Administration section."
        : `Remove ${m.name} as admin? They become an ordinary member, without the Administration section.`;
    if (!window.confirm(ask)) return;
    if (!(await call(`/api/admin/users/${m.id}`, "POST", { action: make ? "make_admin" : "remove_admin" }))) return;
    if (!make && m.id === meId) { toast.success("You're no longer an admin."); router.replace("/overview"); return; }
    toast.success(make ? `${m.name} is now an admin too.` : `${m.name} is no longer an admin.`);
  }
  async function newLink(m: Member) {
    const out = await call(`/api/admin/users/${m.id}`, "POST", { action: "link" });
    if (!out) return;
    if (out.link) setLink({ who: m.name, url: out.link, emailed: out.emailed, queued: out.via === "powerautomate" });
    else toast.success(`A new link is on its way to ${m.name} by email${out.via === "powerautomate" ? " (within about 2 minutes)" : ""}.`);
  }
  async function setRemoved(m: Member, remove: boolean) {
    if (remove && !window.confirm(`Remove ${m.name}? They won't be able to sign in. Their work and history stay, and you can restore them later.`)) return;
    if (await call(`/api/admin/users/${m.id}`, "POST", { action: remove ? "remove" : "restore" })) toast.success(remove ? `${m.name} can no longer sign in.` : `${m.name} can sign in again.`);
  }
  async function copy() {
    if (!link) return;
    await navigator.clipboard.writeText(link.url);
    toast.success("Link copied.");
  }

  const select = "h-9 rounded-lg border border-input bg-sheet px-2.5 text-sm";
  return (
    <div className="grid gap-6">
      {/* summary */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid flex-1 grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map(([Icon, value, label, note, tone]) => (
            <div key={label} className="flex items-center gap-3 rounded-xl border border-line bg-sheet p-4">
              <span className={`grid size-10 shrink-0 place-items-center rounded-lg ${tone}`}><Icon className="size-5" aria-hidden /></span>
              <div className="min-w-0"><div className="text-2xl font-semibold leading-tight">{value}</div><div className="text-sm">{label}</div><div className="truncate text-xs text-soft">{note}</div></div>
            </div>
          ))}
        </div>
        <Button onClick={() => setInviting(true)} className="gap-1.5"><UserPlus className="size-4" aria-hidden />Invite member</Button>
      </div>

      {link && (
        <div className="grid gap-3 rounded-xl border border-brand bg-brand-soft p-5">
          <p className="font-medium">{link.microsoft
            ? <>{link.who} can sign in now with “Sign in with Microsoft”.{sentNote(link)} Optional password link:</>
            : <>Sign-up link for {link.who}{sentNote(link)}</>}</p>
          <div className="flex flex-wrap gap-2">
            <Input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 bg-sheet font-mono text-xs" aria-label="Sign-up link" />
            <Button type="button" onClick={copy}>Copy link</Button>
            <Button type="button" variant="ghost" onClick={() => setLink(null)}>Done</Button>
          </div>
          <p className="text-sm text-soft">{!link.emailed ? "It wasn't emailed, so send this link yourself (Teams, WhatsApp or mail). " : link.queued ? "Until your Power Automate flow is running, copy the link and send it yourself. " : ""}It works once and expires after an hour. If it does, press “New link” on their row.</p>
        </div>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid min-w-0 gap-4">
          {/* tabs */}
          <nav role="tablist" aria-label="Members" className="flex flex-wrap gap-1.5">
            {([["all", "All"], ["staff", "Admins & sub-admins"], ["members", "Members"], ["invited", "Invited"], ["removed", "Removed"]] as [Tab, string][]).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); reset(); }}
                className={`rounded-full px-3.5 py-1.5 text-sm ${tab === k ? "bg-brand font-medium text-accent-ink" : "text-soft hover:bg-well hover:text-ink"}`}>
                {l} <span className="opacity-75">({members.filter((m) => inTab(m, k)).length})</span>
              </button>
            ))}
          </nav>

          {/* filters */}
          <div className="flex flex-wrap items-center gap-2">
            <Input type="search" value={q} onChange={(e) => { setQ(e.target.value); reset(); }} placeholder="Search by name, email or department" aria-label="Search members" className="min-w-56 flex-1 bg-sheet" />
            <select className={select} value={dept} onChange={(e) => { setDept(e.target.value); reset(); }} aria-label="Department">
              <option value="">All departments</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
              <option value="-">No department</option>
            </select>
            <select className={select} value={roleF} onChange={(e) => { setRoleF(e.target.value); reset(); }} aria-label="Role">
              <option value="">All roles</option><option value="admin">Admin</option><option value="subadmin">Sub-admin</option><option value="member">Member</option>
            </select>
            <select className={select} value={statusF} onChange={(e) => { setStatusF(e.target.value); reset(); }} aria-label="Status">
              <option value="">All statuses</option>
              {(Object.keys(STATUS_TAG) as StatusKey[]).map((s) => <option key={s} value={s}>{STATUS_TAG[s][0]}</option>)}
            </select>
          </div>

          {/* table */}
          <div className="overflow-x-auto rounded-xl border border-line bg-sheet">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-well text-left text-xs uppercase tracking-wide text-soft">
                <tr><th className="w-10 px-3 py-2.5">#</th><th className="px-3 py-2.5">Member</th><th className="px-3 py-2.5">Role</th><th className="px-3 py-2.5">Department</th><th className="px-3 py-2.5 text-right">Projects</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5">Last active</th><th className="px-3 py-2.5 text-right">Actions</th></tr>
              </thead>
              <tbody>
                {!shown.length && <tr><td colSpan={8} className="px-4 py-8 text-center text-soft">{members.length ? "Nobody matches these filters." : "No members yet."}</td></tr>}
                {shown.map((m, i) => {
                  const st = statusOf(m), r = memberRole(m);
                  return (
                    <tr key={m.id} className="border-t border-line">
                      <td className="px-3 py-3 text-soft">{cur * PAGE + i + 1}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          <Initials name={m.name || m.email} colour={colourFor(m.id)} />
                          <div className="min-w-0"><div className="truncate font-medium">{m.name}{m.id === meId && <span className="ml-1.5 text-xs text-soft">(you)</span>}</div><div className="truncate text-soft">{m.email}</div></div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${r === "admin" ? "bg-info-soft text-info" : r === "subadmin" ? "bg-brand-soft text-brand" : "bg-well text-soft"}`}>
                          {r === "admin" ? <Crown className="size-3" aria-hidden /> : r === "subadmin" ? <ShieldCheck className="size-3" aria-hidden /> : null}{ROLE_NAME[r]}
                        </span>
                        {r === "subadmin" && <div className={`mt-1 text-xs ${m.regions.length ? "text-soft" : "text-amber"}`}>{m.regions.length ? m.regions.join(", ") : "no region yet"}</div>}
                      </td>
                      <td className="px-3 py-3">{m.department || <span className="text-soft">–</span>}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{m.projects}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TAG[st][1]}`}><span aria-hidden className="size-1.5 rounded-full bg-current" />{STATUS_TAG[st][0]}</span>
                        {st !== "invited" && st !== "expired" && <div className="mt-1 flex items-center gap-1 text-xs text-soft">{m.microsoft ? <><MicrosoftMark />Microsoft</> : "Password"}</div>}
                      </td>
                      <td className="px-3 py-3 text-soft">{m.lastSignIn ? fmtShortDateTime(m.lastSignIn) : st === "invited" || st === "expired" ? (m.linkSentAt ? `invited ${fmtDay(m.linkSentAt)}` : "–") : "–"}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-0.5">
                          {staff && <Link href={`/admin/members/${m.id}`} title={`View ${m.name}`} aria-label={`View ${m.name}`} className="inline-flex size-8 items-center justify-center rounded-md text-soft hover:bg-well hover:text-ink"><Eye className="size-4" aria-hidden /></Link>}
                          {manages(m) && m.id !== meId && m.status !== "removed" && <button type="button" onClick={() => setEditing(m)} title={`Edit ${m.name}`} aria-label={`Edit ${m.name}`} className="inline-flex size-8 items-center justify-center rounded-md text-soft hover:bg-well hover:text-ink"><Pencil className="size-4" aria-hidden /></button>}
                          {manages(m)
                            ? <>
                              {m.id !== meId && m.status !== "removed" && <Button size="sm" variant="outline" disabled={busy} onClick={() => newLink(m)} className="ml-1">New link</Button>}
                              {!m.isAdmin && m.id !== meId && m.status === "removed" && <Button size="sm" variant="outline" disabled={busy} onClick={() => setRemoved(m, false)} className="ml-1">Restore</Button>}
                              <RowMenu name={m.name} disabled={busy} items={[
                                // roles in one pop-up with a preview (admins); your own admin role you can only give up
                                ...(isAdmin && m.id !== meId && m.status !== "removed" ? [{ label: "Change role…", run: () => setRoleFor(m) }] : []),
                                ...(m.status !== "removed" ? [{ label: "Project access…", run: () => setAccessFor(m) }] : []),
                                ...(isAdmin && m.id === meId && admins > 1 ? [{ label: "Stop being admin", run: () => setAdmin(m, false) }] : []),
                                ...(!m.isAdmin && m.id !== meId && m.status !== "removed" ? [{ label: "Remove…", run: () => setRemoved(m, true), danger: true }] : []),
                              ]} />
                            </>
                            : m.status === "invited" && <Button size="sm" variant="outline" disabled={busy} onClick={() => newLink(m)} title="Emails them a fresh link to set their password" className="ml-1">Resend invite</Button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* paging */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-soft">
            <span>{filtered.length ? `Showing ${cur * PAGE + 1}–${Math.min(filtered.length, cur * PAGE + PAGE)} of ${filtered.length}` : "Showing 0"}</span>
            {pages > 1 && (
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" disabled={cur === 0} onClick={() => setPage(cur - 1)} aria-label="Previous page"><ChevronLeft className="size-4" /></Button>
                {Array.from({ length: pages }, (_, n) => <Button key={n} size="sm" variant={n === cur ? "default" : "ghost"} onClick={() => setPage(n)}>{n + 1}</Button>)}
                <Button size="sm" variant="outline" disabled={cur === pages - 1} onClick={() => setPage(cur + 1)} aria-label="Next page"><ChevronRight className="size-4" /></Button>
              </div>
            )}
          </div>
        </div>

        {/* side panels */}
        <aside className="grid gap-4">
          <section className="grid gap-3 rounded-xl border border-line bg-sheet p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-semibold"><Mail className="size-4 text-brand" aria-hidden />Invitations</h2>
              {invited.length > 0 && <span className="rounded-full bg-amber-soft px-2 py-0.5 text-xs font-medium text-amber">{invited.length} pending</span>}
            </div>
            {!invited.length && <p className="text-sm text-soft">Nobody is waiting to sign in.</p>}
            <ul className="grid gap-2.5">
              {invited.slice(0, 6).map((m) => {
                const ex = linkExpired(m);
                return (
                  <li key={m.id} className="flex items-center gap-2.5">
                    <Initials name={m.name || m.email} colour={colourFor(m.id)} />
                    <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{m.name}</div><div className="truncate text-xs text-soft">{m.email}</div></div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${ex ? "bg-bad-soft text-bad" : "bg-amber-soft text-amber"}`}>{ex ? "Expired" : "Pending"}</span>
                    <button type="button" disabled={busy} onClick={() => newLink(m)} title={ex ? "Send a new link" : "Send the link again"} aria-label={`Send ${m.name} a new link`} className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-soft hover:bg-well hover:text-brand disabled:opacity-50"><Send className="size-3.5" aria-hidden /></button>
                  </li>
                );
              })}
            </ul>
            {invited.length > 6 && <button type="button" className="w-fit text-sm text-brand hover:underline" onClick={() => { setTab("invited"); reset(); }}>All {invited.length} invitations →</button>}
            <p className="text-xs text-soft">Sign-up links work once and expire after an hour. Send a new one when it says Expired.</p>
          </section>

          {staff && (
            <section className="grid gap-1 rounded-xl border border-line bg-sheet p-4">
              <h2 className="mb-1 font-semibold">Quick links</h2>
              {([["/admin/access", ShieldCheck, "Roles & access", "Who can do what"], ["/admin/live", FolderKanban, "Project teams", "Set on each project's Team tab"], ...(isAdmin ? [["/admin/settings", Settings, "Invite & email settings", "How invites are sent"]] : [])] as [string, typeof Users, string, string][]).map(([href, Icon, title, note]) => (
                <Link key={href} href={href} className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-tint">
                  <Icon className="size-4 shrink-0 text-brand" aria-hidden />
                  <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{title}</span><span className="block text-xs text-soft">{note}</span></span>
                  <ChevronRight className="size-4 text-soft" aria-hidden />
                </Link>
              ))}
            </section>
          )}
        </aside>
      </div>

      <InviteDialog open={inviting} onClose={() => setInviting(false)} role={role} microsoft={microsoft} projects={projects} busy={busy}
        onSubmit={async (body) => {
          const out = await call("/api/admin/users", "POST", body);
          if (!out) return false;
          if (out.link) setLink({ who: body.name, url: out.link, emailed: out.emailed, queued: out.via === "powerautomate", microsoft: !!out.microsoft });
          else toast.success(`${body.name} is added. ${out.via === "powerautomate" ? "Their invite email goes out within about 2 minutes" : "Their invite has been emailed"}.`);
          return true;
        }} />
      {editing && <EditDialog member={editing} onClose={() => setEditing(null)} busy={busy}
        onSave={async (upd) => { if (await call("/api/admin/users", "PATCH", { id: editing.id, ...upd })) { toast.success(`${upd.name ?? editing.name} is updated.`); setEditing(null); } }} />}
      {roleFor && <RoleDialog member={roleFor} onClose={() => setRoleFor(null)} onDone={() => { setRoleFor(null); router.refresh(); }} />}
      {accessFor && <ProjectAccessDialog member={accessFor} isAdmin={isAdmin} onClose={() => setAccessFor(null)} onDone={() => { setAccessFor(null); router.refresh(); }} />}
    </div>
  );
}

// A row's less frequent actions (role changes, Remove) behind "⋯", so they aren't pressed by mistake. Remove is last,
// in red, after a line. Each item asks to confirm before it acts.
function RowMenu({ name, items, disabled }: { name: string; items: { label: string; run: () => void; danger?: boolean }[]; disabled: boolean }) {
  if (!items.length) return null;
  const safe = items.filter((i) => !i.danger), danger = items.filter((i) => i.danger);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger disabled={disabled} aria-label={`More actions for ${name}`}
        className="inline-flex size-8 items-center justify-center rounded-md text-soft hover:bg-well hover:text-ink focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-50">
        <MoreHorizontal className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-48">
        {safe.map((i) => <DropdownMenuItem key={i.label} onClick={i.run}>{i.label}</DropdownMenuItem>)}
        {safe.length > 0 && danger.length > 0 && <DropdownMenuSeparator />}
        {danger.map((i) => <DropdownMenuItem key={i.label} variant="destructive" onClick={i.run}>{i.label}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface InviteBody { name: string; email: string; role: Role; region?: string; department?: string; projects: { projectId: string; dept: Dept }[]; sendEmail: boolean }

// The invite pop-up: name and email for everyone; department for everyone; role (admins), projects and "send the email"
// (admins and sub-admins). The email's wording is the approved one (lib/server/email.ts); this only chooses whether it goes.
function InviteDialog({ open, onClose, role, microsoft, projects, busy, onSubmit }: {
  open: boolean; onClose: () => void; role: Role; microsoft: boolean; projects: InviteProject[]; busy: boolean; onSubmit: (b: InviteBody) => Promise<boolean>;
}) {
  const staff = role !== "member", isAdmin = role === "admin";
  const blank = { name: "", email: "", role: "member" as Role, region: "", department: "", sendEmail: true };
  const [f, setF] = useState(blank);
  const [joins, setJoins] = useState<{ projectId: string; dept: Dept }[]>([]);
  const select = "h-9 w-full rounded-lg border border-input bg-sheet px-2.5 text-sm";
  const close = () => { setF(blank); setJoins([]); onClose(); };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await onSubmit({
      name: f.name, email: f.email, role: f.role, ...(f.role === "subadmin" ? { region: f.region } : {}), ...(f.department ? { department: f.department } : {}),
      projects: joins.filter((j) => j.projectId), sendEmail: staff ? f.sendEmail : true,
    });
    if (ok) close();
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg"><UserPlus className="size-5 text-brand" aria-hidden />Invite a team member</DialogTitle>
            <DialogDescription>{microsoft ? "They can sign in with “Sign in with Microsoft” straight away; a sign-up link to set a password is made too." : "They get a sign-up link to set their password, and from then on sign in with their email."}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label htmlFor="inv-name">Full name *</Label><Input id="inv-name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Parth Shah" /></div>
            <div className="grid gap-1.5"><Label htmlFor="inv-email">Work email *</Label><Input id="inv-email" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="name@neoliv.in" /></div>
            {isAdmin && (
              <div className="grid gap-1.5"><Label htmlFor="inv-role">Role</Label>
                <select id="inv-role" className={select} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
                  <option value="member">Member</option><option value="subadmin">Sub-admin (one region)</option><option value="admin">Admin</option>
                </select>
              </div>
            )}
            {f.role === "subadmin" && (
              <div className="grid gap-1.5"><Label htmlFor="inv-region">Region *</Label>
                <select id="inv-region" required className={select} value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })}>
                  <option value="">Pick a region</option>{REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            )}
            <div className="grid gap-1.5"><Label htmlFor="inv-dept">Department</Label>
              <select id="inv-dept" className={select} value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })}>
                <option value="">Not set (they can pick it on My profile)</option>{DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          {staff && projects.length > 0 && (
            <div className="grid gap-2">
              <Label>Projects <span className="font-normal text-soft">(optional)</span></Label>
              {joins.map((j, i) => (
                <div key={i} className="grid grid-cols-[1fr_150px_auto] gap-2">
                  <select aria-label="Project" className={select} value={j.projectId} onChange={(e) => setJoins(joins.map((x, k) => (k === i ? { ...x, projectId: e.target.value } : x)))}>
                    <option value="">Pick a project</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}{p.kind === "test" ? " (Test)" : ""} · {p.region}</option>)}
                  </select>
                  <select aria-label="Their department on this project" className={select} value={j.dept} onChange={(e) => setJoins(joins.map((x, k) => (k === i ? { ...x, dept: e.target.value as Dept } : x)))}>
                    {DEPTS.map((d) => <option key={d} value={d}>{dn(d)}</option>)}
                  </select>
                  <button type="button" onClick={() => setJoins(joins.filter((_, k) => k !== i))} aria-label="Remove this project" className="inline-flex size-9 items-center justify-center rounded-md text-soft hover:bg-well hover:text-bad"><X className="size-4" /></button>
                </div>
              ))}
              <button type="button" onClick={() => setJoins([...joins, { projectId: "", dept: "Design" }])} className="w-fit text-sm text-brand hover:underline">+ Add a project</button>
              <p className="text-xs text-soft">They join each project&apos;s team in that department, recorded in the project&apos;s history as a team change.</p>
            </div>
          )}

          {staff && (
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" className="mt-0.5" checked={f.sendEmail} onChange={(e) => setF({ ...f, sendEmail: e.target.checked })} />
              <span><b className="font-medium">Send the invitation email</b><span className="block text-soft">Untick to send the sign-up link yourself (it&apos;s shown after inviting).</span></span>
            </label>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>Cancel</Button>
            <Button type="submit" disabled={busy} className="gap-1.5"><Send className="size-4" aria-hidden />{busy ? "Inviting…" : "Send invite"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Edit a member's name and department (admins: anyone; sub-admins: ordinary members). Roles are in the ⋯ menu.
function EditDialog({ member, onClose, onSave, busy }: { member: Member; onClose: () => void; onSave: (u: { name?: string; department?: string }) => void; busy: boolean }) {
  const [name, setName] = useState(member.name);
  const [department, setDepartment] = useState(member.department);
  const known = (DEPARTMENTS as readonly string[]).includes(member.department) || !member.department;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(e) => { e.preventDefault(); onSave({ ...(name.trim() !== member.name ? { name: name.trim() } : {}), ...(department !== member.department ? { department } : {}) }); }} className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg"><Pencil className="size-4 text-brand" aria-hidden />Edit {member.name}</DialogTitle>
            <DialogDescription>{member.email} · the email (their sign-in) can&apos;t be changed here.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5"><Label htmlFor="ed-name">Name</Label><Input id="ed-name" required value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label htmlFor="ed-dept">Department</Label>
            <select id="ed-dept" className="h-9 w-full rounded-lg border border-input bg-sheet px-2.5 text-sm" value={department} onChange={(e) => setDepartment(e.target.value)}>
              <option value="">Not set</option>
              {!known && <option value={member.department} disabled>{member.department} (not in the list)</option>}
              {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <p className="text-xs text-soft">Their role on each project (Base Line, Design…) is set on the project&apos;s Team tab; admin and sub-admin roles in the ⋯ menu.</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy || !name.trim()}>{busy ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
