"use client";
// The two pop-ups on Team members for one person (user's designs, 2026-11-27, adapted to the app's rules):
//   RoleDialog           current → new role (member / sub-admin with its region / admin), with a live preview of what
//                        changes (lib/roles.ts PERMISSIONS) and an optional reason. Admins only. No email (user's choice).
//   ProjectAccessDialog  which projects they're on, in which department, at which level (Edit / View only / Manage),
//                        on the projects you manage; their access history (admins); what they can do overall.
// Both save through the API, which checks the rules again and writes the read-only audit log.
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Check, Crown, FolderKanban, History, Minus, Search, ShieldCheck, UserRound, X } from "lucide-react";
import { Initials } from "@/components/initials";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { fmtShortDateTime } from "@/lib/dates";
import { memberRole, type Member } from "@/lib/members";
import { ACCESS_HELP, ACCESS_LEVELS, ACCESS_NAME, PERMISSIONS, REGIONS, ROLE_NAME, ROLE_POINTS, type Access, type Can, type Role } from "@/lib/roles";
import { DEPTS, dn, type Dept } from "@/lib/workflow";

const ROLE_ICON: Record<Role, typeof Crown> = { admin: Crown, subadmin: ShieldCheck, member: UserRound };
const ROLE_TONE: Record<Role, string> = { admin: "bg-info-soft text-info", subadmin: "bg-brand-soft text-brand", member: "bg-amber-soft text-amber" };

function CanCell({ v, changed }: { v: Can; changed?: boolean }) {
  return (
    <td className={`px-3 py-2 text-center text-xs ${changed ? "bg-brand-soft/50 font-medium" : ""}`}>
      {v === true ? <><Check className="mx-auto size-4 text-good" aria-hidden /><span className="sr-only">Yes</span></>
        : v === false ? <><Minus className="mx-auto size-4 text-soft" aria-hidden /><span className="sr-only">No</span></>
          : <span>{v}</span>}
    </td>
  );
}

export function RolePill({ role, region }: { role: Role; region?: string }) {
  const Icon = ROLE_ICON[role];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-medium ${ROLE_TONE[role]}`}><Icon className="size-3.5" aria-hidden />{ROLE_NAME[role]}{region ? ` · ${region}` : ""}</span>;
}

function MemberCard({ m }: { m: Member }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line p-3">
      <span className="scale-125 p-1"><Initials name={m.name || m.email} /></span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{m.name}</div>
        <div className="truncate text-sm text-soft">{m.email}</div>
        <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
          {m.department && <span className="rounded-full bg-well px-2 py-0.5">{m.department}</span>}
          <span className="rounded-full bg-well px-2 py-0.5">{m.projects} project{m.projects === 1 ? "" : "s"}</span>
          <span className={`rounded-full px-2 py-0.5 ${m.status === "active" ? "bg-good-soft text-good" : m.status === "invited" ? "bg-amber-soft text-amber" : "bg-well text-soft"}`}>{m.status === "active" ? "Active" : m.status === "invited" ? "Invited" : "Removed"}</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- role
export function RoleDialog({ member, onClose, onDone }: { member: Member; onClose: () => void; onDone: () => void }) {
  const current = memberRole(member) as Role;
  const [role, setRole] = useState<Role>(current);
  const [region, setRegion] = useState(member.regions[0] ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const same = role === current && (role !== "subadmin" || region === (member.regions[0] ?? ""));
  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${member.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "set_role", role, ...(role === "subadmin" ? { region } : {}), reason }) });
      const out = await res.json();
      if (!res.ok) { toast.error(out.error); return; }
      toast.success(`${member.name} is now ${role === "admin" ? "an admin" : role === "subadmin" ? `the sub-admin for ${region}` : "a member"}.`);
      onDone();
    } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="size-5 text-brand" aria-hidden />Change {member.name}&apos;s role</DialogTitle>
          <DialogDescription>Pick the new role: the preview shows what changes before you confirm.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <MemberCard m={member} />
          <div className="grid gap-2 rounded-xl border border-line bg-tint p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-soft">Current</span><RolePill role={current} region={current === "subadmin" ? member.regions[0] : undefined} />
              <ArrowRight className="size-4 text-soft" aria-hidden />
              <select aria-label="New role" className="h-8 rounded-lg border border-input bg-sheet px-2 text-sm font-medium" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="member">Member</option><option value="subadmin">Sub-admin</option><option value="admin">Admin</option>
              </select>
            </div>
            {role === "subadmin" && (
              <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Region">
                <span className="text-sm text-soft">Region</span>
                {REGIONS.map((r) => <button key={r} type="button" role="radio" aria-checked={region === r} onClick={() => setRegion(r)} className={`rounded-full border px-2.5 py-0.5 text-sm ${region === r ? "border-brand bg-brand text-accent-ink" : "border-line bg-sheet text-soft hover:border-brand hover:text-brand"}`}>{r}</button>)}
              </div>
            )}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_240px]">
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead className="bg-well text-left text-xs uppercase tracking-wide text-soft"><tr><th className="px-3 py-2">Permission</th><th className="px-3 py-2 text-center">{ROLE_NAME[current]} (now)</th><th className="px-3 py-2 text-center">{ROLE_NAME[role]} (new)</th></tr></thead>
              <tbody>
                {PERMISSIONS.map(([what, can]) => {
                  const changed = String(can[current]) !== String(can[role]);
                  return <tr key={what} className="border-t border-line"><td className="px-3 py-2">{what}</td><CanCell v={can[current]} /><CanCell v={can[role]} changed={changed} /></tr>;
                })}
              </tbody>
            </table>
          </div>
          <div className="grid content-start gap-2 rounded-xl border border-line p-3 text-sm">
            <h3 className="font-semibold">About {ROLE_NAME[role].toLowerCase()}</h3>
            <ul className="grid list-disc gap-1 pl-4 text-soft">{ROLE_POINTS[role].map((a) => <li key={a}>{a}</li>)}</ul>
          </div>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="role-reason" className="text-sm font-medium">Reason <span className="font-normal text-soft">(optional, kept in role activity)</span></label>
          <Input id="role-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Handles the MMR projects from December" maxLength={300} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || same || (role === "subadmin" && !region)} onClick={save}>{busy ? "Saving…" : same ? "No change" : "Update role"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- project access
interface Assigned { projectId: string; name: string; kind: "live" | "test"; region: string; dept: Dept; access: Access; manageable: boolean }
interface HistoryRow { id: string; at: string; actor_name: string; kind: string; action: string; before: { dept?: string; access?: Access; label?: string } | null; after: { dept?: string; access?: Access; label?: string } | null; project_name: string | null; reason: string | null; status: string; detail: string | null }
type Tab = "access" | "history" | "effective";

export function ProjectAccessDialog({ member, isAdmin, onClose, onDone }: { member: Member; isAdmin: boolean; onClose: () => void; onDone: () => void }) {
  const [tab, setTab] = useState<Tab>("access");
  const [loaded, setLoaded] = useState<{ assigned: Assigned[]; projects: { id: string; name: string; kind: "live" | "test"; region: string }[]; history: HistoryRow[] } | null>(null);
  const [rows, setRows] = useState<Assigned[]>([]);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Record<string, Dept>>({});
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const key = (r: { projectId: string; dept: string }) => `${r.projectId}|${r.dept}`;

  useEffect(() => {
    let live = true;
    fetch(`/api/admin/users/${member.id}/projects`).then((r) => r.json().then((o) => ({ ok: r.ok, o }))).then(({ ok, o }) => {
      if (!live) return;
      if (!ok) { toast.error(o.error); onClose(); return; }
      setLoaded(o); setRows(o.assigned);
    }).catch(() => { if (live) toast.error("Couldn't load their projects."); });
    return () => { live = false; };
  }, [member.id, onClose]);

  const available = useMemo(() => (loaded?.projects ?? []).filter((p) => `${p.name} ${p.region}`.toLowerCase().includes(q.trim().toLowerCase())), [loaded, q]);
  const before = useMemo(() => new Map((loaded?.assigned ?? []).map((r) => [key(r), r])), [loaded]);
  const now = new Map(rows.map((r) => [key(r), r]));
  const removing = [...before.values()].filter((r) => r.manageable && !now.has(key(r)));
  const adding = rows.filter((r) => !before.has(key(r)));
  const leveling = rows.filter((r) => before.has(key(r)) && before.get(key(r))!.access !== r.access);
  const dirty = removing.length + adding.length + leveling.length > 0;

  function add() {
    const items = Object.entries(picked);
    if (!items.length) return;
    const next = [...rows];
    for (const [pid, dept] of items) {
      const p = loaded!.projects.find((x) => x.id === pid)!;
      if (!next.some((r) => r.projectId === pid && r.dept === dept)) next.push({ projectId: pid, name: p.name, kind: p.kind, region: p.region, dept, access: "edit", manageable: true });
    }
    setRows(next); setPicked({});
  }
  const setLevel = (keys: string[], access: Access) => setRows(rows.map((r) => (keys.includes(key(r)) && r.manageable ? { ...r, access } : r)));
  const remove = (keys: string[]) => { setRows(rows.filter((r) => !(keys.includes(key(r)) && r.manageable))); setTicked(new Set()); };

  async function save() {
    if (removing.length && !window.confirm(`Remove ${member.name} from ${removing.length} project team place(s)? ${removing.map((r) => `${r.name} (${dn(r.dept)})`).join(", ")}`)) return;
    setBusy(true);
    try {
      const assignments = rows.filter((r) => r.manageable).map((r) => ({ projectId: r.projectId, dept: r.dept, access: r.access }));
      const res = await fetch(`/api/admin/users/${member.id}/projects`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ assignments, reason }) });
      const out = await res.json();
      if (!res.ok) { toast.error(out.error); return; }
      toast.success(out.unchanged ? "No changes." : `${member.name}'s project access is updated.`);
      onDone();
    } finally { setBusy(false); }
  }

  const select = "h-8 rounded-md border border-input bg-sheet px-2 text-sm";
  const role = memberRole(member) as Role;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg"><FolderKanban className="size-5 text-brand" aria-hidden />Manage project access</DialogTitle>
          <DialogDescription>Which projects {member.name} works on, in which department, and at which level. Departments and the workflow stay as they are.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <MemberCard m={member} />
          <div className="flex items-center gap-2"><RolePill role={role} region={role === "subadmin" ? member.regions[0] : undefined} /></div>
        </div>
        <nav role="tablist" className="flex flex-wrap gap-1.5">
          {([["access", "Project access", FolderKanban], ["history", "Access history", History], ["effective", "Effective permissions", ShieldCheck]] as [Tab, string, typeof History][]).filter(([t]) => t !== "history" || isAdmin).map(([t, l, Icon]) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm ${tab === t ? "bg-brand font-medium text-accent-ink" : "text-soft hover:bg-well hover:text-ink"}`}><Icon className="size-4" aria-hidden />{l}</button>
          ))}
        </nav>

        {!loaded && <p className="text-sm text-soft">Loading…</p>}

        {loaded && tab === "access" && (
          <div className="grid gap-3 lg:grid-cols-[1fr_auto_1.3fr]">
            <section className="grid content-start gap-2 rounded-xl border border-line p-3">
              <h3 className="font-semibold">Projects you manage <span className="font-normal text-soft">({loaded.projects.length})</span></h3>
              <label className="flex h-9 items-center gap-2 rounded-lg border border-input px-2.5"><Search className="size-4 text-soft" aria-hidden /><input className="w-full bg-transparent text-sm outline-none" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects" aria-label="Search projects" /></label>
              <ul className="grid max-h-80 gap-1 overflow-y-auto">
                {available.map((p) => {
                  const on = p.id in picked;
                  return (
                    <li key={p.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${on ? "bg-brand-soft/50" : ""}`}>
                      <input type="checkbox" checked={on} aria-label={`Pick ${p.name}`} onChange={(e) => setPicked((x) => { const n = { ...x }; if (e.target.checked) n[p.id] = "Design"; else delete n[p.id]; return n; })} />
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{p.name}</span><span className="text-xs text-soft">{p.region}{p.kind === "test" ? " · Test" : ""}</span></span>
                      {on && <select aria-label={`Department on ${p.name}`} className={select} value={picked[p.id]} onChange={(e) => setPicked((x) => ({ ...x, [p.id]: e.target.value as Dept }))}>{DEPTS.map((d) => <option key={d} value={d}>{dn(d)}</option>)}</select>}
                    </li>
                  );
                })}
                {!available.length && <li className="px-2 py-3 text-sm text-soft">No project matches.</li>}
              </ul>
            </section>
            <div className="flex items-center justify-center"><Button size="sm" disabled={!Object.keys(picked).length} onClick={add} aria-label="Add the picked projects" className="gap-1">Add <ArrowRight className="size-4" /></Button></div>
            <section className="grid content-start gap-2 rounded-xl border border-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">Assigned <span className="font-normal text-soft">({rows.length})</span></h3>
                {ticked.size > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 text-sm">
                    <span className="text-soft">{ticked.size} picked:</span>
                    {ACCESS_LEVELS.map((a) => <Button key={a} size="sm" variant="outline" onClick={() => setLevel([...ticked], a)}>{ACCESS_NAME[a]}</Button>)}
                    <Button size="sm" variant="ghost" className="text-bad" onClick={() => remove([...ticked])}>Remove</Button>
                  </div>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-soft"><tr><th className="w-8 py-1.5"><input type="checkbox" aria-label="Pick all" checked={rows.filter((r) => r.manageable).length > 0 && ticked.size === rows.filter((r) => r.manageable).length} onChange={(e) => setTicked(e.target.checked ? new Set(rows.filter((r) => r.manageable).map(key)) : new Set())} /></th><th className="py-1.5">Project</th><th className="py-1.5">Department</th><th className="py-1.5">Access</th><th /></tr></thead>
                  <tbody>
                    {!rows.length && <tr><td colSpan={5} className="py-4 text-center text-soft">Not on any project yet.</td></tr>}
                    {rows.map((r) => {
                      const k = key(r), fresh = !before.has(k), moved = !fresh && before.get(k)!.access !== r.access;
                      return (
                        <tr key={k} className={`border-t border-line ${fresh || moved ? "bg-brand-soft/40" : ""}`}>
                          <td className="py-1.5">{r.manageable && <input type="checkbox" aria-label={`Pick ${r.name} ${dn(r.dept)}`} checked={ticked.has(k)} onChange={(e) => setTicked((t) => { const n = new Set(t); if (e.target.checked) n.add(k); else n.delete(k); return n; })} />}</td>
                          <td className="py-1.5"><span className="font-medium">{r.name}</span><span className="block text-xs text-soft">{r.region}{r.kind === "test" ? " · Test" : ""}{fresh ? " · new" : ""}</span></td>
                          <td className="py-1.5">{dn(r.dept)}</td>
                          <td className="py-1.5">{r.manageable
                            ? <select aria-label={`Access on ${r.name}`} className={select} value={r.access} onChange={(e) => setLevel([k], e.target.value as Access)} title={ACCESS_HELP[r.access]}>{ACCESS_LEVELS.map((a) => <option key={a} value={a}>{ACCESS_NAME[a]}</option>)}</select>
                            : <span className="text-soft" title="Not a project you manage">{ACCESS_NAME[r.access]}</span>}</td>
                          <td className="py-1.5 text-right">{r.manageable && <button type="button" onClick={() => remove([k])} aria-label={`Remove from ${r.name} (${dn(r.dept)})`} className="inline-flex size-7 items-center justify-center rounded-md text-soft hover:bg-well hover:text-bad"><X className="size-4" /></button>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="grid gap-1 rounded-lg bg-tint p-2.5 text-xs text-soft">
                {ACCESS_LEVELS.map((a) => <div key={a}><b className="text-ink">{ACCESS_NAME[a]}:</b> {ACCESS_HELP[a]}</div>)}
                <div>Each project keeps at least one person at Edit or Manage in every department.</div>
              </div>
            </section>
          </div>
        )}

        {loaded && tab === "history" && (
          <ul className="grid max-h-96 gap-px overflow-y-auto rounded-xl border border-line bg-line">
            {!loaded.history.length && <li className="bg-sheet p-4 text-sm text-soft">No recorded changes yet. Changes are recorded once the role activity log is switched on (migration 0008).</li>}
            {loaded.history.map((h) => (
              <li key={h.id} className="bg-sheet px-4 py-2.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><b>{h.action}</b>{h.project_name ? <> · {h.project_name}</> : null}{h.status === "failed" && <span className="ml-2 rounded bg-bad-soft px-1.5 py-0.5 text-xs text-bad">Refused</span>}</span>
                  <span className="text-xs text-soft">{h.actor_name || "Former member"} · {fmtShortDateTime(h.at)}</span>
                </div>
                <div className="text-xs text-soft">{change(h.before)} → {change(h.after)}{h.reason ? ` · “${h.reason}”` : ""}{h.detail ? ` · ${h.detail}` : ""}</div>
              </li>
            ))}
          </ul>
        )}

        {loaded && tab === "effective" && (
          <div className="grid gap-3 md:grid-cols-2">
            <section className="rounded-xl border border-line p-3">
              <h3 className="mb-2 font-semibold">As {ROLE_NAME[role].toLowerCase()}</h3>
              <ul className="grid gap-1 text-sm">{PERMISSIONS.map(([what, can]) => <li key={what} className="flex items-start justify-between gap-3"><span>{what}</span><span className={`shrink-0 text-right ${can[role] === false ? "text-soft" : "font-medium"}`}>{can[role] === true ? "Yes" : can[role] === false ? "No" : String(can[role])}</span></li>)}</ul>
            </section>
            <section className="rounded-xl border border-line p-3">
              <h3 className="mb-2 font-semibold">On each project</h3>
              {!rows.length ? <p className="text-sm text-soft">Not on any project.</p> : (
                <ul className="grid gap-1.5 text-sm">{rows.map((r) => <li key={key(r)}><b>{r.name}</b> · {dn(r.dept)} · {ACCESS_NAME[r.access]}<span className="block text-xs text-soft">{ACCESS_HELP[r.access]}</span></li>)}</ul>
              )}
            </section>
          </div>
        )}

        {tab === "access" && (
          <div className="grid gap-1.5">
            <label htmlFor="pa-reason" className="text-sm font-medium">Reason <span className="font-normal text-soft">(optional, kept in each project&apos;s history and role activity)</span></label>
            <Input id="pa-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. Joins the NCR design team" />
          </div>
        )}
        <DialogFooter>
          <span className="mr-auto self-center text-xs text-soft">{dirty ? `${adding.length} to add, ${removing.length} to remove, ${leveling.length} level change(s)` : "No changes yet"}</span>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {tab === "access" && <Button disabled={busy || !dirty} onClick={save}>{busy ? "Saving…" : "Update access"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// "Design · Edit", or a role label, for the history
function change(v: HistoryRow["before"]) {
  if (!v) return "–";
  if (v.label) return v.label;
  const parts = [v.dept ? dn(v.dept) : "", v.access ? ACCESS_NAME[v.access] : ""].filter(Boolean);
  return parts.join(" · ") || "–";
}
