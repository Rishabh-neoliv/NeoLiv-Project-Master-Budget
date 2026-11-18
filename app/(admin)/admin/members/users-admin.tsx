"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtDay } from "@/lib/dates";
import type { Role } from "@/lib/roles";

export interface Member { id: string; name: string; email: string; department: string; isAdmin: boolean; isSubadmin: boolean; status: "active" | "invited" | "removed"; lastSignIn: string | null; projects: number; microsoft: boolean }

const STATUS_TAG: Record<Member["status"], [string, string]> = {
  active: ["Active", "bg-good-soft text-good"],
  invited: ["Invited – hasn't signed in yet", "bg-amber-soft text-amber"],
  removed: ["Removed – can't sign in", "bg-bad-soft text-bad"],
};
const fmtDate = fmtDay;
const MicrosoftMark = () => (
  <svg aria-hidden viewBox="0 0 21 21" className="size-3.5"><path fill="#f25022" d="M1 1h9v9H1z" /><path fill="#7fba00" d="M11 1h9v9h-9z" /><path fill="#00a4ef" d="M1 11h9v9H1z" /><path fill="#ffb900" d="M11 11h9v9h-9z" /></svg>
);

// The members table and "Add a member" form (Admin panel → Team members, and the Members page). What each person
// can do follows lib/roles.ts: admins get every button; sub-admins get the sign-up links and remove/restore for
// ordinary members; other members can add people and resend an invite to someone who hasn't signed in yet (the
// link then goes only by email).
export function UsersAdmin({ members, microsoft, meId, role }: { members: Member[]; microsoft: boolean; meId: string; role: Role }) {
  const router = useRouter();
  const isAdmin = role === "admin";
  const staff = role !== "member";
  // whom this person manages (links back, remove/restore): admins everyone, sub-admins ordinary members
  const manages = (m: Member) => isAdmin || (role === "subadmin" && !m.isAdmin && !m.isSubadmin);
  // "Make admin" / "Remove admin" ask for a second press, like the app's other one-way steps
  const [armed, setArmed] = useState<string | null>(null);
  const admins = members.filter((m) => m.isAdmin && m.status !== "removed").length;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  // the latest sign-up link, shown so the admin can copy it and send it on Teams, WhatsApp or mail
  const [link, setLink] = useState<{ who: string; url: string; emailed: boolean; queued?: boolean; microsoft?: boolean } | null>(null);
  // Power Automate only queues the email: it's sent when the flow picks it up, so don't promise delivery
  const sentNote = (l: NonNullable<typeof link>) => !l.emailed ? "" : l.queued ? " (queued for your Power Automate flow, which emails it within about 2 minutes)" : " (also emailed to them)";

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

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const out = await call("/api/admin/users", "POST", { name, email });
    if (!out) return;
    // only admins and sub-admins get the link back; for everyone else it goes to the new member by email only
    if (out.link) setLink({ who: name, url: out.link, emailed: out.emailed, queued: out.via === "powerautomate", microsoft: !!out.microsoft });
    else toast.success(`${name} is added. ${out.via === "powerautomate" ? "Their invite email goes out within about 2 minutes" : "Their invite has been emailed"}.`);
    setName(""); setEmail("");
  }
  async function setAdmin(m: Member, make: boolean) {
    const key = (make ? "make:" : "unmake:") + m.id;
    if (armed !== key) { setArmed(key); return; }
    setArmed(null);
    if (!(await call(`/api/admin/users/${m.id}`, "POST", { action: make ? "make_admin" : "remove_admin" }))) return;
    if (!make && m.id === meId) { toast.success("You're no longer an admin."); router.replace("/overview"); return; }
    toast.success(make ? `${m.name} is now an admin too.` : `${m.name} is no longer an admin.`);
  }
  async function setSubadmin(m: Member, make: boolean) {
    const key = (make ? "sub:" : "unsub:") + m.id;
    if (armed !== key) { setArmed(key); return; }
    setArmed(null);
    if (!(await call(`/api/admin/users/${m.id}`, "POST", { action: make ? "make_subadmin" : "remove_subadmin" }))) return;
    toast.success(make ? `${m.name} is now a sub-admin.` : `${m.name} is no longer a sub-admin.`);
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

  return (
    <div className="grid gap-6">
      <form onSubmit={add} className="grid gap-4 rounded-xl border border-line bg-sheet p-5">
        <h2 className="text-lg font-semibold">Add a team member</h2>
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="grid gap-1.5"><Label htmlFor="n">Name</Label><Input id="n" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Parth Shah" /></div>
          <div className="grid gap-1.5"><Label htmlFor="e">Work email</Label><Input id="e" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@neoliv.in" /></div>
          <Button type="submit" disabled={busy}>{busy ? "Adding…" : "Add member"}</Button>
        </div>
        <p className="text-sm text-soft">{!staff
          ? (microsoft ? "They can sign in straight away with “Sign in with Microsoft”, using their NeoLiv account, and also get an email with a link to set a password." : "They get an email with a link to set their password, and from then on sign in with their email. The password is only for this app.")
          : microsoft
            ? "They can sign in straight away with “Sign in with Microsoft”, using their NeoLiv account. You also get a link in case they'd rather set a password."
            : "You get a sign-up link to send them. They open it, set a password, and from then on sign in with their email."}</p>
      </form>

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
          <p className="text-sm text-soft">{!link.emailed ? "Email isn't set up yet, so send this link yourself (Teams, WhatsApp or mail). " : link.queued ? "Until your Power Automate flow is running, copy the link and send it yourself. " : ""}It works once and expires after an hour. If it does, press “New link” on their row.</p>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-line bg-sheet">
        <table className="w-full text-sm">
          <thead className="bg-well text-left text-xs uppercase tracking-wide text-soft">
            <tr><th className="px-4 py-2.5">Name</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5 text-right">Projects</th><th className="px-4 py-2.5"><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-t border-line">
                <td className="px-4 py-3">
                  <div className="font-medium">{m.name}{m.isAdmin && <span className="ml-2 rounded bg-info-soft px-1.5 py-0.5 text-xs text-info">Admin</span>}{m.isSubadmin && <span className="ml-2 rounded bg-brand-soft px-1.5 py-0.5 text-xs text-brand">Sub-admin</span>}</div>
                  <div className="text-soft">{m.email}</div>
                  {m.department && <div className="text-xs text-soft">{m.department}</div>}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TAG[m.status][1]}`}>{STATUS_TAG[m.status][0]}</span>
                  {m.status !== "invited" && <div className="mt-1 flex items-center gap-1.5 text-xs text-soft">
                    {m.microsoft ? <><MicrosoftMark />Microsoft</> : "Password"}{m.lastSignIn && m.status === "active" && <> · last signed in {fmtDate(m.lastSignIn)}</>}
                  </div>}
                </td>
                <td className="px-4 py-3 text-right">{m.projects}</td>
                {/* the buttons wrap onto a second line on narrow screens instead of widening the table */}
                <td className="px-4 py-3 text-right">
                  {manages(m) ? <div className="flex flex-wrap justify-end gap-1">
                    {isAdmin && (m.isAdmin
                      ? admins > 1 && <Button size="sm" variant={armed === "unmake:" + m.id ? "default" : "ghost"} disabled={busy} onClick={() => setAdmin(m, false)}
                          title="They become an ordinary member, without the Admin panel">{armed === "unmake:" + m.id ? "Confirm: remove admin" : m.id === meId ? "Stop being admin" : "Remove admin"}</Button>
                      : m.status !== "removed" && <>
                        <Button size="sm" variant={armed === "make:" + m.id ? "default" : "ghost"} disabled={busy} onClick={() => setAdmin(m, true)}
                          title="They get the whole Admin panel too; you stay admin">{armed === "make:" + m.id ? "Confirm: make admin" : "Make admin"}</Button>
                        {m.isSubadmin
                          ? <Button size="sm" variant={armed === "unsub:" + m.id ? "default" : "ghost"} disabled={busy} onClick={() => setSubadmin(m, false)}
                              title="They become an ordinary member">{armed === "unsub:" + m.id ? "Confirm: remove sub-admin" : "Remove sub-admin"}</Button>
                          : <Button size="sm" variant={armed === "sub:" + m.id ? "default" : "ghost"} disabled={busy} onClick={() => setSubadmin(m, true)}
                              title="They can create Live projects, open and act on every Live project, and remove or restore ordinary members">{armed === "sub:" + m.id ? "Confirm: make sub-admin" : "Make sub-admin"}</Button>}
                      </>)}
                    {m.id !== meId && m.status !== "removed" && <Button size="sm" variant="outline" disabled={busy} onClick={() => newLink(m)}>New link</Button>}
                    {!m.isAdmin && m.id !== meId && (m.status === "removed"
                      ? <Button size="sm" variant="outline" disabled={busy} onClick={() => setRemoved(m, false)}>Restore</Button>
                      : <Button size="sm" variant="ghost" className="text-bad" disabled={busy} onClick={() => setRemoved(m, true)}>Remove</Button>)}
                  </div>
                    : m.status === "invited" && <div className="flex justify-end"><Button size="sm" variant="outline" disabled={busy} onClick={() => newLink(m)} title="Emails them a fresh link to set their password">Resend invite</Button></div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
