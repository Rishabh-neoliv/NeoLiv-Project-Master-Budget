"use client";
// Role activity: summary cards, search and filters, tabs, the log table, a details panel (before → after), paging, and
// export (CSV, which opens in Excel; Print → Save as PDF). Read-only: nothing here changes a record.
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Check, ChevronLeft, ChevronRight, FolderKanban, Mail, Printer, ShieldCheck, UserCog, Users, X, type LucideIcon } from "lucide-react";
import { CsvDownload } from "@/components/csv-download";
import { Initials } from "@/components/initials";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtDateTime, fmtShortDateTime } from "@/lib/dates";
import { ACCESS_NAME, type Access } from "@/lib/roles";
import { dn } from "@/lib/workflow";

type Side = { role?: string; label?: string; dept?: string; access?: Access; status?: string; name?: string; department?: string; region?: string | null; projects?: string[]; emailed?: boolean } | null;
export interface AuditRow { id: string; at: string; actor: string | null; actor_name: string; target: string | null; target_name: string; target_email: string; kind: "role" | "project_access" | "invite" | "member"; action: string; before: Side; after: Side; project_id: string | null; project_name: string | null; reason: string | null; status: "success" | "failed"; detail: string | null }

const KIND: Record<AuditRow["kind"], [string, LucideIcon, string]> = {
  role: ["Role", ShieldCheck, "bg-info-soft text-info"],
  project_access: ["Project access", FolderKanban, "bg-brand-soft text-brand"],
  invite: ["Invite", Mail, "bg-amber-soft text-amber"],
  member: ["Member details", UserCog, "bg-well text-soft"],
};
type Tab = "all" | "role" | "project_access" | "people" | "failed";
const DAY = 86400000, PAGE = 15;

// what a before / after holds, in words
function side(v: Side): string {
  if (!v) return "–";
  if (v.label) return v.label;
  if (v.dept || v.access) return [v.dept ? dn(v.dept) : "", v.access ? ACCESS_NAME[v.access] : ""].filter(Boolean).join(" · ");
  if (v.status) return v.status === "removed" ? "Removed" : "Active";
  const bits = [v.name, v.department, v.role ? `role: ${v.role}${v.region ? ` (${v.region})` : ""}` : "", v.projects?.length ? `projects: ${v.projects.join(", ")}` : "", v.emailed === false ? "link not emailed" : ""].filter(Boolean);
  return bits.join(" · ") || "–";
}
const summary = (r: AuditRow) => (r.status === "failed" ? r.detail ?? "Refused" : `${r.project_name ? `${r.project_name}: ` : ""}${side(r.before)} → ${side(r.after)}`);

export function RoleActivity({ rows }: { rows: AuditRow[] }) {
  // "now" once per page load, so the cards and filters agree
  const [now] = useState(() => Date.now());
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [who, setWho] = useState("");
  const [days, setDays] = useState("30");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<AuditRow | null>(null);

  const age = (r: AuditRow) => now - new Date(r.at).getTime();
  const last30 = rows.filter((r) => age(r) <= 30 * DAY), prev30 = rows.filter((r) => age(r) > 30 * DAY && age(r) <= 60 * DAY);
  const trend = prev30.length ? Math.round(((last30.length - prev30.length) / prev30.length) * 100) : null;
  const cards: [LucideIcon, number, string, string, string][] = [
    [Users, last30.length, "Changes", trend === null ? "last 30 days" : `${trend >= 0 ? "+" : ""}${trend}% vs the 30 days before`, "bg-good-soft text-good"],
    [ShieldCheck, last30.filter((r) => r.kind === "role").length, "Role changes", "last 30 days", "bg-info-soft text-info"],
    [FolderKanban, last30.filter((r) => r.kind === "project_access").length, "Project access", "last 30 days", "bg-brand-soft text-brand"],
    [Mail, last30.filter((r) => r.kind === "invite" || r.kind === "member").length, "Invites & members", "last 30 days", "bg-amber-soft text-amber"],
    [AlertTriangle, last30.filter((r) => r.status === "failed").length, "Refused attempts", "last 30 days", "bg-bad-soft text-bad"],
  ];
  const people = useMemo(() => [...new Map(rows.flatMap((r) => [[r.target ?? r.target_email, r.target_name || r.target_email], [r.actor ?? "", r.actor_name]] as [string, string][]).filter(([k, v]) => k && v)).entries()].sort((a, b) => a[1].localeCompare(b[1])), [rows]);

  const inTab = (r: AuditRow, t: Tab) => t === "all" || (t === "failed" ? r.status === "failed" : t === "people" ? r.kind === "invite" || r.kind === "member" : r.kind === t);
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = rows.filter((r) => inTab(r, tab) && (!kind || r.kind === kind) && (!who || r.target === who || r.actor === who || r.target_email === who) && (days === "all" || age(r) <= Number(days) * DAY)
    && words.every((w) => `${r.action} ${r.target_name} ${r.target_email} ${r.actor_name} ${r.project_name ?? ""} ${r.reason ?? ""} ${summary(r)}`.toLowerCase().includes(w)));
  const pages = Math.max(1, Math.ceil(shown.length / PAGE)), cur = Math.min(page, pages - 1);
  const reset = () => setPage(0);
  const csv = shown.map((r) => [fmtDateTime(r.at), KIND[r.kind][0], r.action, r.target_name, r.target_email, r.actor_name, r.project_name ?? "", side(r.before), side(r.after), r.reason ?? "", r.status === "failed" ? "Refused" : "Done", r.detail ?? ""]);
  const select = "h-9 rounded-lg border border-input bg-sheet px-2.5 text-sm";

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {cards.map(([Icon, value, label, note, tone]) => (
          <div key={label} className="flex items-center gap-3 rounded-xl border border-line bg-sheet p-4">
            <span className={`grid size-10 shrink-0 place-items-center rounded-lg ${tone}`}><Icon className="size-5" aria-hidden /></span>
            <div className="min-w-0"><div className="text-2xl font-semibold leading-tight">{value}</div><div className="text-sm">{label}</div><div className="truncate text-xs text-soft">{note}</div></div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Input type="search" value={q} onChange={(e) => { setQ(e.target.value); reset(); }} placeholder="Search by member, email, project or change" aria-label="Search role activity" className="min-w-60 flex-1 bg-sheet" />
        <select className={select} value={kind} onChange={(e) => { setKind(e.target.value); reset(); }} aria-label="Activity type">
          <option value="">All activity types</option>{(Object.keys(KIND) as AuditRow["kind"][]).map((k) => <option key={k} value={k}>{KIND[k][0]}</option>)}
        </select>
        <select className={select} value={who} onChange={(e) => { setWho(e.target.value); reset(); }} aria-label="Member">
          <option value="">All members</option>{people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select className={select} value={days} onChange={(e) => { setDays(e.target.value); reset(); }} aria-label="Date range">
          <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All time</option>
        </select>
        <CsvDownload filename="role-activity.csv" rows={csv} header={["Date and time", "Type", "Activity", "Member", "Email", "Changed by", "Project", "Before", "After", "Reason", "Status", "Detail"]} label="Export CSV" />
        <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5"><Printer className="size-4" aria-hidden />Print / PDF</Button>
      </div>

      <nav role="tablist" aria-label="Activity" className="flex flex-wrap gap-1.5 print:hidden">
        {([["all", "All"], ["role", "Role changes"], ["project_access", "Project access"], ["people", "Invites & members"], ["failed", "Refused"]] as [Tab, string][]).map(([t, l]) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => { setTab(t); reset(); }}
            className={`rounded-full px-3.5 py-1.5 text-sm ${tab === t ? (t === "failed" ? "bg-bad font-medium text-white" : "bg-brand font-medium text-accent-ink") : "text-soft hover:bg-well hover:text-ink"}`}>
            {l} <span className="opacity-75">({rows.filter((r) => inTab(r, t)).length})</span>
          </button>
        ))}
      </nav>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid gap-3">
          <div className="overflow-x-auto rounded-xl border border-line bg-sheet">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-well text-left text-xs uppercase tracking-wide text-soft"><tr><th className="px-3 py-2.5">Activity</th><th className="px-3 py-2.5">Member</th><th className="px-3 py-2.5">Changed by</th><th className="px-3 py-2.5">Date &amp; time</th><th className="px-3 py-2.5">Status</th></tr></thead>
              <tbody>
                {!shown.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-soft">{rows.length ? "Nothing matches these filters." : "Nothing recorded yet. Role and access changes appear here as they happen."}</td></tr>}
                {shown.slice(cur * PAGE, cur * PAGE + PAGE).map((r) => {
                  const [, Icon, tone] = KIND[r.kind];
                  return (
                    <tr key={r.id} tabIndex={0} onClick={() => setOpen(r)} onKeyDown={(e) => { if (e.key === "Enter") setOpen(r); }} className={`cursor-pointer border-t border-line hover:bg-tint ${open?.id === r.id ? "bg-brand-soft/40" : ""}`}>
                      <td className="px-3 py-2.5">
                        <div className="flex items-start gap-2.5">
                          <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${r.status === "failed" ? "bg-bad-soft text-bad" : tone}`}>{r.status === "failed" ? <AlertTriangle className="size-4" aria-hidden /> : <Icon className="size-4" aria-hidden />}</span>
                          <div className="min-w-0"><div className="font-medium">{r.action}{r.status === "failed" ? " (refused)" : ""}</div><div className="line-clamp-1 text-xs text-soft" title={summary(r)}>{summary(r)}</div></div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5"><div className="flex items-center gap-2"><Initials name={r.target_name || r.target_email || "?"} /><div className="min-w-0"><div className="truncate">{r.target_name || "–"}</div><div className="truncate text-xs text-soft">{r.target_email}</div></div></div></td>
                      <td className="px-3 py-2.5"><div className="flex items-center gap-2"><Initials name={r.actor_name || "?"} /><span className="truncate">{r.actor_name || "Former member"}</span></div></td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-soft">{fmtShortDateTime(r.at)}</td>
                      <td className="px-3 py-2.5">{r.status === "failed"
                        ? <span className="inline-flex items-center gap-1 rounded-full bg-bad-soft px-2 py-0.5 text-xs font-medium text-bad"><AlertTriangle className="size-3" aria-hidden />Refused</span>
                        : <span className="inline-flex items-center gap-1 rounded-full bg-good-soft px-2 py-0.5 text-xs font-medium text-good"><Check className="size-3" aria-hidden />Done</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-soft print:hidden">
            <span>{shown.length ? `Showing ${cur * PAGE + 1}–${Math.min(shown.length, cur * PAGE + PAGE)} of ${shown.length}` : "Showing 0"}</span>
            {pages > 1 && (
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" disabled={cur === 0} onClick={() => setPage(cur - 1)} aria-label="Previous page"><ChevronLeft className="size-4" /></Button>
                <span className="px-2">Page {cur + 1} of {pages}</span>
                <Button size="sm" variant="outline" disabled={cur === pages - 1} onClick={() => setPage(cur + 1)} aria-label="Next page"><ChevronRight className="size-4" /></Button>
              </div>
            )}
          </div>
        </div>

        <aside className="rounded-xl border border-line bg-sheet p-4 print:hidden">
          {!open ? <p className="text-sm text-soft">Click a row to see its details: what it was before and after, who made the change, when, and why.</p> : (
            <div className="grid gap-3">
              <div className="flex items-start justify-between gap-2">
                <div><h2 className="text-lg font-semibold">{open.action}</h2><p className="text-sm text-soft">{KIND[open.kind][0]}{open.project_name ? ` · ${open.project_name}` : ""}</p></div>
                <button type="button" onClick={() => setOpen(null)} aria-label="Close details" className="inline-flex size-8 items-center justify-center rounded-md text-soft hover:bg-well"><X className="size-4" /></button>
              </div>
              <span className={`w-fit rounded-full px-2 py-0.5 text-xs font-medium ${open.status === "failed" ? "bg-bad-soft text-bad" : "bg-good-soft text-good"}`}>{open.status === "failed" ? "Refused" : "Done"}</span>
              <dl className="grid gap-2 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-soft">Member</dt><dd className="text-right">{open.target_name || "–"}<span className="block text-xs text-soft">{open.target_email}</span></dd></div>
                <div className="flex justify-between gap-3"><dt className="text-soft">Changed by</dt><dd className="text-right">{open.actor_name || "Former member"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-soft">Date &amp; time</dt><dd className="text-right">{fmtDateTime(open.at)}</dd></div>
                {open.reason && <div className="flex justify-between gap-3"><dt className="text-soft">Reason</dt><dd className="text-right">{open.reason}</dd></div>}
                {open.detail && <div className="flex justify-between gap-3"><dt className="text-soft">Why refused</dt><dd className="text-right">{open.detail}</dd></div>}
              </dl>
              {open.status !== "failed" && (
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-lg bg-tint p-3 text-sm">
                  <div><div className="text-xs text-soft">Before</div><div className="font-medium">{side(open.before)}</div></div>
                  <ArrowRight className="size-4 text-soft" aria-hidden />
                  <div><div className="text-xs text-soft">After</div><div className="font-medium">{side(open.after)}</div></div>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
