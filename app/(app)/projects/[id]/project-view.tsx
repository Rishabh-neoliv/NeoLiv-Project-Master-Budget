"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AssumptionsForm, type Baseline } from "@/components/assumptions-form";
import { ChangeLegend } from "@/components/change-legend";
import { BudgetTable } from "@/components/budget-table";
import { ActivityTab, type ActivityRow } from "@/components/activity-tab";
import { FilesTab, type ProjectFile } from "@/components/files-tab";
import { RateAnalysis, type Side } from "@/components/rate-analysis";
import { RatesTab } from "@/components/rates-tab";
import { Initials } from "@/components/initials";
import { RevTag, StatusBadge } from "@/components/status-badge";
import { TeamEditor, teamFromRows, teamToRows, type Person, type Team } from "@/components/team-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { crore, isNum, missingInputs, numCell, problems, snapFromVersion, snapshot, type CellValue, type MasterRow, type Model, type Snapshot } from "@/lib/budget";
import { authorship, colours, type Authored, type ChangeRow } from "@/lib/changes";
import { createClient } from "@/lib/supabase/client";
import type { Kind } from "@/lib/roles";
import { actionLabel, availableActions, canEditDraft, canEditRates, canSubmit, DEPTS, dn, EDITABLE, editDept, hasDraft, nextRev, revLabel, STATUS, SUBMIT_TO, type Action, type Dept, type Status } from "@/lib/workflow";
import { fmtDateTime } from "@/lib/dates";

export interface ProjectData {
  project: {
    id: string; name: string; region: string; status: Status; template: string; inputs: Record<string, CellValue>; rates: Record<string, unknown>;
    last_rev: number | null; revision_reason: string; grand_total: number | null; location: string | null; acre: number | null;
    created_at: string; created_by: string | null;
  };
  team: { user_id: string; dept: string; name: string; email: string }[];
  versions: { rev: number; inputs: Record<string, CellValue>; rates: Record<string, unknown> | null; template: string | null; master: MasterRow[]; calc: Record<string, CellValue> | null; grand_total: number | null; reason: string; dept: string; xlsx_path: string | null; frozen_by: string | null; frozen_at: string }[];
  activity: ActivityRow[];
  /** every recorded field change (activity rows with details), for who-changed-what colours */
  changes: ChangeRow[];
  names: Record<string, string>;
  model: Model;
  templateDate: string;
  meId: string;
  /** an admin anywhere, a sub-admin on a Live project: acts for every department, team or not */
  actsForAll: boolean;
  roleName: string;
  kind: Kind;
  /** onboarded members to pick from (only sent to Base Line, who may change the team) */
  people: Person[];
  files: ProjectFile[];
  filesReady: boolean;
  currentTemplate: { stamp: string; date: string } | null;
}

const fmtDate = fmtDateTime;
const cr = (rupees: unknown) => (isNum(rupees) ? crore(rupees / 1e7) : "–");
type Tab = "assumptions" | "budget" | "rates" | "analysis" | "files" | "revisions" | "team" | "activity";

export function ProjectView({ data }: { data: ProjectData }) {
  const { project: p, team, versions, activity, names, model: m, meId } = data;
  const router = useRouter();
  const ownDepts = team.filter((t) => t.user_id === meId).map((t) => t.dept);
  // the admin can do everything a team member can, in every department
  const myDepts: string[] = data.actsForAll ? [...DEPTS] : ownDepts;
  // anyone on the team can change the open draft; only the department whose turn it is submits it
  const editable = canEditDraft(p.status, myDepts);
  const submittable = canSubmit(p.status, myDepts);
  const viewOnly = !ownDepts.length && !data.actsForAll;
  const actions = availableActions(p.status, myDepts);
  const r0 = versions.find((v) => v.rev === 0) ?? null;
  const rev = nextRev(p.last_rev);
  const draftOpen = hasDraft(p.status);

  const [tab, setTab] = useState<Tab>("assumptions");
  const [draft, setDraft] = useState<Record<string, CellValue>>(() => ({ ...m.defaults, ...p.inputs }));
  const [dirty, setDirty] = useState(false);
  // where values applied from a file came from, recorded in the history when the draft is saved
  const [source, setSource] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ kind: "submit" } | { kind: "action"; a: Action } | null>(null);
  const [comment, setComment] = useState("");
  // what both tabs show: the working draft or a frozen R<n>
  const [view, setView] = useState<"draft" | number>(draftOpen ? "draft" : p.last_rev ?? 0);
  const [teamEdit, setTeamEdit] = useState<Team | null>(null);
  // Rate analysis / compare: which two to compare ("master", "0".."n", "draft")
  const [cmp, setCmp] = useState<{ base: string; cur: string }>({ base: "", cur: "" });

  // a fresh copy from the server (someone else saved or moved the project) replaces the draft unless you have unsaved edits
  const [seen, setSeen] = useState(p.inputs);
  // the saved values this person's edits started from: only the fields they changed since are sent, so two
  // people editing the same draft at once don't undo each other's changes
  const [editBase, setEditBase] = useState(p.inputs);
  if (seen !== p.inputs) {
    setSeen(p.inputs);
    if (!dirty) { setDraft({ ...m.defaults, ...p.inputs }); setEditBase(p.inputs); }
  }
  const changedInputs = () => {
    const base = { ...m.defaults, ...editBase } as Record<string, CellValue>;
    const keys = new Set([...Object.keys(base), ...Object.keys(draft)]);
    return Object.fromEntries([...keys].filter((k) => JSON.stringify(base[k] ?? null) !== JSON.stringify(draft[k] ?? null)).map((k) => [k, draft[k] ?? null]));
  };
  // follow the draft opening and closing, for everyone with the page open: approval freezes it (show the frozen
  // revision); "Create new version" opens a new one (show the new draft, editable, not the frozen one before it)
  const [wasOpen, setWasOpen] = useState(draftOpen);
  if (wasOpen !== draftOpen) {
    setWasOpen(draftOpen);
    setView(draftOpen ? "draft" : p.last_rev ?? 0);
  }
  if (view === "draft" && !draftOpen) setView(p.last_rev ?? 0);

  // live updates: anyone's change to this project reloads the page data
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase.channel(`project-${p.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "projects", filter: `id=eq.${p.id}` }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "versions", filter: `project_id=eq.${p.id}` }, () => router.refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity", filter: `project_id=eq.${p.id}` }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "files", filter: `project_id=eq.${p.id}` }, () => router.refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [p.id, router]);

  const deferred = useDeferredValue(draft);
  const liveSnap = useMemo(() => snapshot(m, deferred, p.rates || {}), [m, deferred, p.rates]);
  const shownVersion = view === "draft" ? null : versions.find((v) => v.rev === view) ?? null;
  const snap: Snapshot = useMemo(() => (shownVersion ? snapFromVersion(shownVersion) : liveSnap), [shownVersion, liveSnap]);
  const shownRev = shownVersion ? shownVersion.rev : rev;
  const shownInputs = shownVersion ? { ...m.defaults, ...shownVersion.inputs } : draft;
  const issues = useMemo(() => problems(snap), [snap]);
  // inputs still empty on the working draft: until they're filled the Excel formulas can't give a budget
  const missing = useMemo(() => (shownVersion ? [] : missingInputs(m, draft)), [shownVersion, m, draft]);
  const baseline = r0 && shownRev !== 0 ? r0.master : null;
  // what the Assumptions form compares against: R0's frozen inputs, calculated values and budget lines
  const shownTemplate = shownVersion ? shownVersion.template : p.template;
  const formBase: Baseline | null = useMemo(() => (r0 && shownRev !== 0
    ? { inputs: r0.inputs as Record<string, CellValue>, calc: r0.calc ?? {}, master: r0.master ?? [], sameTemplate: r0.template === shownTemplate } : null), [r0, shownRev, shownTemplate]);
  const canChangeTeam = myDepts.includes("BD");

  // who changed what in the revision on screen, each person in their own colour (lib/changes.ts)
  const people = useMemo(() => colours([...new Set(team.map((t) => t.user_id))], data.changes.map((c) => c.by).filter((x): x is string => !!x).concat(meId), names), [team, data.changes, names, meId]);
  const winAfter = useMemo(() => [...versions].sort((a, b) => a.rev - b.rev).filter((v) => v.rev < shownRev).at(-1)?.frozen_at ?? null, [versions, shownRev]);
  const saved = useMemo(() => ({ ...m.defaults, ...p.inputs }) as Record<string, CellValue>, [m.defaults, p.inputs]);
  const [focus, setFocus] = useState<string | null>(null);
  const authors = useMemo(() => {
    const out = authorship(data.changes, shownRev, winAfter, shownVersion ? shownVersion.frozen_at : null, people);
    // your own edits that aren't saved yet show in your colour straight away
    if (!shownVersion && dirty) {
      const me = people.get(meId)!;
      for (const k of new Set([...Object.keys(saved), ...Object.keys(draft)])) {
        if (JSON.stringify(saved[k] ?? null) === JSON.stringify(draft[k] ?? null)) continue;
        const was = out.get(k);
        out.set(k, { by: me, at: "", from: was ? was.from : saved[k] ?? null, to: draft[k] ?? null, count: (was?.count ?? 0) + 1 });
      }
    }
    return out;
  }, [data.changes, shownRev, winAfter, shownVersion, people, dirty, draft, saved, meId]);
  const shownAuthors = useMemo(() => (focus ? new Map([...authors].filter(([, a]) => a.by.id === focus)) : authors), [authors, focus]);
  const legendLabel = shownVersion ? `R${shownVersion.rev}` : `R${rev} draft`;
  const legend = (only?: (cell: string) => boolean) => {
    const list = only ? new Map([...authors].filter(([k]) => only(k))) : authors;
    return <ChangeLegend authors={list as Map<string, Authored>} label={legendLabel} focus={focus} onFocus={setFocus} />;
  };
  // rate changes are "Sheet!Cell" refs that aren't inputs; inputs are the template's input cells
  const inputCells = useMemo(() => new Set(m.sections.flatMap((x) => x.fields.map((f) => f.cell))), [m]);

  async function call(url: string, method: string, body: unknown) {
    setBusy(true);
    try {
      const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const out = await res.json();
      if (!res.ok) { toast.error(out.error); return null; }
      if (out.workbookError) toast.warning("Frozen, but the Excel file couldn't be made: " + out.workbookError);
      return out;
    } finally { setBusy(false); }
  }
  async function save() {
    const out = await call(`/api/projects/${p.id}/draft`, "PUT", { inputs: changedInputs(), source: source ?? undefined });
    if (out) { setDirty(false); setSource(null); toast.success("Draft saved."); router.refresh(); }
  }
  async function confirm() {
    if (!pending) return;
    if (pending.kind === "submit") {
      const to = SUBMIT_TO[editDept(p.status)]![0];
      const out = await call(`/api/projects/${p.id}/draft`, "PUT", { inputs: changedInputs(), submit: true, note: comment, source: source ?? undefined });
      if (out) { setDirty(false); toast.success(rev === 0 ? `R0 submitted to ${dn(to)} and frozen as the Base Line.` : `R${rev} draft sent to ${dn(to)}.`); }
    } else {
      if (pending.a.needsComment && !comment.trim()) return void toast.error("Please add a comment first.");
      if (dirty && !window.confirm("You have unsaved changes on the Project Inputs tab. Continue without saving them?")) return;
      const out = await call(`/api/projects/${p.id}/action`, "POST", { key: pending.a.key, comment });
      if (out) toast.success(actionLabel(pending.a, p.last_rev) + " – done.");
    }
    setPending(null); setComment(""); router.refresh();
  }
  // submit from the side panel: press twice (the second press confirms), like the original app
  const [note, setNote] = useState("");
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 5000); return () => clearTimeout(t); }, [armed]);
  async function submitFromSide() {
    if (!armed) return setArmed(true);
    setArmed(false);
    const to = SUBMIT_TO[editDept(p.status)]![0];
    const out = await call(`/api/projects/${p.id}/draft`, "PUT", { inputs: changedInputs(), submit: true, note, source: source ?? undefined });
    if (out) { setDirty(false); setNote(""); toast.success(rev === 0 ? `R0 submitted to ${dn(to)} and frozen as the Base Line.` : `R${rev} draft sent to ${dn(to)}.`); router.refresh(); }
  }

  async function moveTemplate() {
    if (!window.confirm(`Move the R${rev} draft to the master template of ${data.currentTemplate?.date}? Values are carried across by field name.`)) return;
    const out = await call(`/api/projects/${p.id}/template`, "POST", {});
    if (out) {
      toast.success(`Moved: ${out.moved} value(s) carried over${out.dropped.length ? `; not carried: ${out.dropped.join(", ")}` : ""}${out.ratesLost ? `; ${out.ratesLost} project rate(s) had no matching item` : ""}. Grand total now ${crore(out.grandTotal)}.`);
      router.refresh();
    }
  }

  // a frozen revision costed on an older master template: Base Line can recalculate it with the current one
  const [rebaseWhy, setRebaseWhy] = useState("");
  const [rebaseArmed, setRebaseArmed] = useState(false);
  async function rebase(r: number) {
    if (!rebaseWhy.trim()) return void toast.error("Please give a reason first.");
    if (!rebaseArmed) return setRebaseArmed(true);
    setRebaseArmed(false);
    const out = await call(`/api/projects/${p.id}/versions/${r}/recalculate`, "POST", { reason: rebaseWhy });
    if (out) { toast.success(`R${r} recalculated: ${crore(out.fromTotal)} → ${crore(out.toTotal)}.`); setRebaseWhy(""); router.refresh(); }
  }
  const olderTemplate = !!shownVersion && !!data.currentTemplate && shownVersion.template !== data.currentTemplate.stamp;
  const recalcs = shownVersion ? activity.filter((a) => a.rev === shownVersion.rev && a.details?.kind === "recalc") : [];

  async function saveTeam() {
    if (!teamEdit) return;
    const out = await call(`/api/projects/${p.id}/team`, "PUT", { team: teamToRows(teamEdit) });
    if (out) { toast.success("Team saved."); setTeamEdit(null); router.refresh(); }
  }

  const memberCount = new Set(team.map((t) => t.user_id)).size;
  const rateCount = Object.keys((shownVersion ? shownVersion.rates : p.rates) || {}).length;
  const tabs: [Tab, string][] = [["assumptions", "Project Inputs"], ["budget", "Master Budget"], ["rates", `Rates${rateCount ? ` (${rateCount} changed)` : ""}`], ["analysis", "Rate analysis"], ["files", `Files (${data.files.length})`], ["revisions", `Revisions (${versions.length})`], ["team", `Team (${memberCount})`], ["activity", "Activity"]];
  const submitTo = SUBMIT_TO[editDept(p.status)]?.[0];
  const peopleIn = (d: string) => team.filter((t) => t.dept === d).map((t) => t.name || t.email);

  // who holds the draft now, in words, for the notice above the assumptions
  const holder = (EDITABLE.has(p.status) ? editDept(p.status) : STATUS[p.status][1]) as Dept | null;
  const holderNames = holder ? peopleIn(holder).join(", ") : "";
  let notice: React.ReactNode = null;
  if (shownVersion) notice = <>
    <b>R{shownVersion.rev}{shownVersion.rev === 0 ? " – Base Line" : ""}</b>, frozen on {fmtDate(shownVersion.frozen_at)}{shownVersion.frozen_by && names[shownVersion.frozen_by] ? ` by ${names[shownVersion.frozen_by]}` : ""}{shownVersion.reason ? ` (${shownVersion.reason})` : ""}. Frozen: these values can&apos;t change.
    {shownVersion.rev > 0 && " Changes against the Base Line (R0) are highlighted."}
    {!draftOpen && shownVersion.rev === p.last_rev && <> Base Line, Design or Operations can press <b>Create new version R{rev}</b> when the drawings change.</>}
    {recalcs.map((a) => <span key={a.id} className="block text-sm text-soft">{a.action} on {fmtDate(a.at)}{a.by && names[a.by] ? ` by ${names[a.by]}` : ""}: {a.comment}</span>)}
  </>;
  else if (viewOnly) notice = <><b>View only.</b> You aren&apos;t on this project&apos;s team, so you can look at everything and download it, but not change it. Base Line can add you to the team.</>;
  else if (editable && !submittable && holder) notice = p.status === "WITH_MGMT"
    ? <><b>The R{rev} draft is with Management</b>{holderNames && ` (${holderNames})`} for approval. Anyone on the team can still change it; it is frozen as it stands when Management approves it.</>
    : <><b>The R{rev} draft is with {dn(holder)}</b>{holderNames && ` (${holderNames})`}. Anyone on the team can change it and save; {dn(holder)} {EDITABLE.has(p.status) ? "submits it on" : "starts their work next"}.</>;
  else if (!editable && holder) notice = p.status === "WITH_MGMT"
    ? <><b>The R{rev} draft is with Management</b>{holderNames && ` (${holderNames})`}; the assumptions can&apos;t be changed at this step. It is frozen when Management approves it.</>
    : EDITABLE.has(p.status)
      ? <><b>The R{rev} draft is with {dn(holder)}</b>{holderNames && ` (${holderNames})`}, who can change it now. You can view it.</>
      : <><b>The R{rev} draft is waiting for {dn(holder)}</b>{holderNames && ` (${holderNames})`}. It can change once they start their work.</>;

  // what to do now, for whoever's turn it is (as in the original app)
  const guide: React.ReactNode = submittable && !shownVersion ? {
    BD: <><b>Base Line:</b> fill in the General parameters and the sections below (a new project starts with the master template&apos;s sample values: change what differs for this site). Design can refine them after R0 is submitted.</>,
    Design: <><b>Design:</b> refine any of the assumptions, then submit R{rev} to Operations. R0 stays frozen as the Base Line; every change against it is highlighted.</>,
    Operations: <><b>Operations:</b> finalise the budget by changing any assumption here, then submit R{rev} to Management for approval. It is frozen when Management approves it.</>,
    Management: null,
  }[editDept(p.status)] : null;

  return (
    <div className="grid gap-5">
      {/* header */}
      <section className="grid gap-4 rounded-xl border border-line bg-sheet p-5">
        <Link href="/projects" className="w-fit text-sm text-brand hover:underline">← All projects</Link>
        <div className="grid gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{p.name}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <RevTag>{revLabel(p.status, p.last_rev)}</RevTag>
            {data.kind === "test" && <span className="rounded bg-amber-soft px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber" title="A project for trying things out: only its team (and admins) can see it, and it can be deleted">Test project</span>}
            <StatusBadge status={p.status} />
            {ownDepts.length > 0 && <span className="flex flex-wrap items-center gap-1.5">You&apos;re on this project as {ownDepts.map((d) => <span key={d} className="rounded bg-brand-soft px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-brand">{dn(d)}</span>)}</span>}
            {viewOnly && <span className="rounded bg-well px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-soft" title="You aren't on this project's team">View only</span>}
            {data.actsForAll && <span className="rounded bg-info-soft px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-info" title={`As ${data.roleName.toLowerCase()} you can take every step and change the team`}>{data.roleName} · can act for every department</span>}
          </div>
          <p className="flex flex-wrap items-center gap-x-1.5 text-soft">
            {p.region !== p.location && <span>{p.region} region ·</span>}
            <span>{p.location} rates · {numCell(p.acre)} acre</span>
            {p.created_by && <span className="flex items-center gap-1.5">· created by <Initials name={names[p.created_by] || "?"} /> <span className="text-ink">{names[p.created_by] || "someone"}</span> on {fmtDate(p.created_at)}</span>}
          </p>
        </div>
        {draftOpen && p.revision_reason && <div className="rounded-lg bg-amber-soft px-4 py-2.5 text-amber"><b>Revision R{rev}:</b> {p.revision_reason}</div>}

        {/* action bar */}
        {pending ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-well p-3">
            <b>{pending.kind === "submit" ? `Submit R${rev}${rev === 0 ? " (freezes the Base Line)" : ""} to ${dn(submitTo!)}?` : actionLabel(pending.a, p.last_rev) + "?"}</b>
            <Input className="h-9 min-w-64 flex-1 bg-sheet" autoFocus value={comment} onChange={(e) => setComment(e.target.value)}
              placeholder={pending.kind === "action" && pending.a.needsComment ? (pending.a.key === "revise" ? "Reason, e.g. drawing reference Layout rev C (required)" : "What needs to change (required)") : "Comment (optional)"} />
            <Button disabled={busy} onClick={confirm}>{busy ? "Working…" : "Confirm"}</Button>
            <Button variant="ghost" onClick={() => { setPending(null); setComment(""); }}>Cancel</Button>
          </div>
        ) : (editable || actions.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            {editable && <>
              <Button variant="outline" disabled={busy || !dirty} onClick={save}>{dirty ? "Save draft" : "Saved"}</Button>
              {submittable && <Button disabled={busy} onClick={() => setPending({ kind: "submit" })}>Submit R{rev} to {dn(submitTo!)}</Button>}
            </>}
            {actions.map((a) => (
              <Button key={a.key} variant={a.key === "return_bd" || a.key === "mgmt_return" ? "outline" : "default"} disabled={busy} onClick={() => setPending({ kind: "action", a })}>
                {actionLabel(a, p.last_rev)}
              </Button>
            ))}
            {dirty && <span className="text-sm text-amber">Unsaved changes</span>}
          </div>
        )}
      </section>

      {/* tabs */}
      <nav role="tablist" className="flex flex-wrap gap-1 border-b border-line">
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`-mb-px border-b-2 px-4 py-2.5 ${tab === k ? "border-brand font-semibold text-brand" : "border-transparent text-soft hover:text-ink"}`}>{l}</button>
        ))}
      </nav>

      {(tab === "assumptions" || tab === "budget" || tab === "rates") && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-soft">Showing</span>
          <select className="h-9 rounded-lg border border-input bg-sheet px-2.5" value={String(view)} onChange={(e) => setView(e.target.value === "draft" ? "draft" : Number(e.target.value))} aria-label="Revision to show">
            {draftOpen && <option value="draft">R{rev} draft (working copy)</option>}
            {[...versions].reverse().map((v) => <option key={v.rev} value={v.rev}>R{v.rev} – {v.rev === 0 ? "Base Line" : "approved"}, frozen {fmtDate(v.frozen_at)}</option>)}
          </select>
          <span className="text-soft">· {String(shownInputs.C8)} rates</span>
        </div>
      )}

      {tab === "assumptions" && (
        // summary beside the form from 1280px; on narrower laptops it sits above it (two columns), so the road table
        // keeps its width and the total stays in view
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="grid gap-4">
            {guide && <div className="rounded-lg border border-info/30 bg-info-soft px-4 py-3 text-info">{guide}</div>}
            {!shownVersion && draftOpen && data.currentTemplate && data.currentTemplate.stamp !== p.template && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-info/30 bg-info-soft px-4 py-3 text-info">
                <span className="flex-1">This draft is on the master template of <b>{data.templateDate}</b>. A newer master template ({data.currentTemplate.date}) is available.{editable ? " Moving carries every value across by field name; check them afterwards, especially the road table." : ""}</span>
                {editable && <Button variant="outline" disabled={busy || dirty} title={dirty ? "Save the draft first" : undefined} onClick={moveTemplate}>Move to the new template</Button>}
              </div>
            )}
            {notice && <div className={`rounded-lg border px-4 py-3 ${shownVersion ? "border-line bg-tint text-ink" : "border-amber/30 bg-amber-soft text-amber"}`}>{shownVersion ? "🔒 " : ""}{notice}</div>}
            {shownVersion && olderTemplate && (
              <div className="grid gap-2 rounded-lg border border-amber/30 bg-amber-soft px-4 py-3 text-amber">
                <span><b>R{shownVersion.rev} was calculated on an older master template.</b> The current one is from {data.currentTemplate!.date} and may have changed rules or rates.</span>
                {myDepts.includes("BD") ? <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input className="h-9 min-w-64 flex-1 bg-sheet text-ink" value={rebaseWhy} onChange={(e) => { setRebaseWhy(e.target.value); setRebaseArmed(false); }} placeholder={`Reason for recalculating R${shownVersion.rev} (required)`} />
                    <Button variant="outline" disabled={busy} onClick={() => rebase(shownVersion.rev)}>{rebaseArmed ? `Confirm: recalculate R${shownVersion.rev}` : `Recalculate R${shownVersion.rev} with the current template`}</Button>
                  </div>
                  <small className="text-amber/90">Keeps R{shownVersion.rev}&apos;s own inputs and project rates; only the calculation rules change. The old total is kept in the Activity log{shownVersion.rev === 0 ? ", and every Delta vs R0 follows the new total" : ""}.</small>
                </> : <span className="text-sm">Until it is recalculated it shows the old template&apos;s rules. Only Base Line ({peopleIn("BD").join(", ") || "nobody yet"}) can recalculate it.</span>}
              </div>
            )}
            {missing.length > 0 && (
              <div className="rounded-lg border border-info/30 bg-info-soft px-4 py-3 text-info">
                <b>{missing.length} input(s) still to fill in</b> before the budget can be worked out and R{rev} submitted: {missing.slice(0, 8).map((f) => f.label).join(", ")}{missing.length > 8 ? `, and ${missing.length - 8} more` : ""}.
                {" "}Roads are added in the Roadworks section with “+ Add road”.
              </div>
            )}
            {!shownVersion && missing.length === 0 && (issues.errors.length > 0 || issues.gaps.length > 0) && (
              <div className="rounded-lg bg-bad-soft px-4 py-3 text-bad">
                {issues.errors.length > 0 && <p><b>{issues.errors.length} line(s) can&apos;t be calculated</b>: {issues.errors.slice(0, 4).map((e) => `${e.item} (${e.code})`).join(", ")}</p>}
                {issues.gaps.length > 0 && <p><b>{issues.gaps.length} line(s) have a quantity but no rate</b> for {String(draft.C8)}: {issues.gaps.slice(0, 4).map((g) => g.item).join(", ")}</p>}
              </div>
            )}
            {legend((k) => inputCells.has(k))}
            <AssumptionsForm model={m} draft={shownInputs} snap={snap} editable={editable && !shownVersion}
              base={formBase} authors={shownAuthors} onChange={(d) => { setDraft(d); setDirty(true); }} />
          </div>
          <div className="order-first grid items-start gap-4 md:grid-cols-2 xl:order-none xl:sticky xl:top-4 xl:grid-cols-1">
            <Summary snap={snap} r0={shownRev !== 0 ? r0?.grand_total ?? null : null} label={shownVersion ? `R${shownRev}` : `R${rev} draft`} templateDate={data.templateDate} live={editable && !shownVersion} incomplete={missing.length} />
            {editable && !shownVersion && (
              <section className="grid gap-3 rounded-xl border border-line bg-sheet p-5">
                <Button variant="outline" disabled={busy || !dirty} onClick={save}>{dirty ? "Save draft" : "Draft saved"}</Button>
                {submittable ? <>
                  <label htmlFor="sideNote" className="text-sm font-medium">Note for {dn(submitTo!)} (optional)</label>
                  <Input id="sideNote" className="bg-sheet" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Layout v3 is in the Files tab" />
                  <Button disabled={busy} onClick={submitFromSide}>{armed ? `Confirm: submit R${rev}` : `Submit R${rev} to ${dn(submitTo!)}`}</Button>
                  <p className="text-sm text-soft">{rev === 0 ? "Submitting freezes these numbers as R0, the Base Line. It can't be changed afterwards." : `R${rev} stays a draft through Design and Operations; it is frozen when Management approves it.`}</p>
                </> : <p className="text-sm text-soft">Your changes go into the R{rev} draft. {holder ? `${dn(holder)} ${holder === "Management" ? "approves it" : "submits it on"}.` : ""}</p>}
              </section>
            )}
          </div>
        </div>
      )}

      {tab === "files" && !data.filesReady && (
        <div className="rounded-xl border border-bad/30 bg-bad-soft px-5 py-4 text-bad">
          <b>Uploading isn&apos;t switched on yet.</b> It needs a one-time database update: in Supabase, open <b>SQL Editor → + New query</b>,
          paste the contents of <code>supabase/migrations/0002_files_history.sql</code>, press <b>Run</b>, then reload this page.
        </div>
      )}
      {tab === "files" && data.filesReady && (
        <FilesTab projectId={p.id} files={data.files} names={names} meId={meId} canRemoveAny={myDepts.includes("BD")} canUpload={!viewOnly} model={m} current={draft} canApply={editable}
          onApply={(vals, from) => {
            setDraft((d) => ({ ...d, ...vals })); setDirty(true); setSource(from); setView("draft"); setTab("assumptions");
            toast.success(`${Object.keys(vals).length} value(s) applied from ${from}. Check them (they're highlighted against R0), then Save draft.`);
          }} />
      )}

      {tab === "budget" && (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {shownVersion
              ? shownVersion.xlsx_path && <a className="font-medium text-brand hover:underline" href={`/api/projects/${p.id}/versions/${shownVersion.rev}/download`}>Download R{shownVersion.rev} as Excel</a>
              : <a className="font-medium text-brand hover:underline" href={`/api/projects/${p.id}/draft/excel`}>Download the R{rev} draft as Excel</a>}
            {!shownVersion && dirty && <span className="text-sm text-amber">The download has the draft as last saved. Save first to include your changes.</span>}
          </div>
          {missing.length > 0 && <div className="rounded-lg border border-info/30 bg-info-soft px-4 py-3 text-info">The draft still has {missing.length} empty input(s), so some lines can&apos;t be worked out yet. Fill them in on the Project Inputs tab.</div>}
          <BudgetTable master={snap.master} baseline={baseline} title={`Master Budget – R${shownRev}${shownVersion ? "" : " draft"}`} />
        </div>
      )}

      {tab === "rates" && legend((k) => !inputCells.has(k))}
      {tab === "rates" && (
        <RatesTab authors={shownAuthors} key={`${p.id}-${String(view)}`} projectId={p.id} model={m} inputs={shownVersion ? shownInputs : { ...m.defaults, ...p.inputs }}
          saved={((shownVersion ? shownVersion.rates : p.rates) || {}) as Record<string, number>}
          editable={!shownVersion && canEditRates(p.status, myDepts)} label={shownVersion ? `R${shownRev}` : `R${rev} draft`}
          who={shownVersion ? `R${shownRev} is frozen; its rates can't change.` : viewOnly ? "Only the project's team can change these." : "The team can change these while a draft is open."} />
      )}

      {tab === "analysis" && (() => {
        // any two of: the master template, R0..Rn, the working draft
        const ms = snapshot(m, m.defaults, {});
        const sides: Record<string, Side> = { master: { label: "Master template", inputs: m.defaults, rates: {}, master: ms.master, calc: ms.calc, grandTotal: ms.grandTotal } };
        for (const v of versions) sides[String(v.rev)] = { label: `R${v.rev}`, inputs: { ...m.defaults, ...v.inputs }, rates: v.rates || {}, master: v.master, calc: v.calc || {}, grandTotal: v.grand_total };
        if (draftOpen) sides.draft = { label: `R${rev} draft`, inputs: draft, rates: p.rates || {}, master: liveSnap.master, calc: liveSnap.calc, grandTotal: liveSnap.grandTotal };
        const baseKey = sides[cmp.base] ? cmp.base : r0 ? "0" : "master";
        const curKey = sides[cmp.cur] ? cmp.cur : draftOpen ? "draft" : String(p.last_rev ?? 0) in sides ? String(p.last_rev ?? 0) : "master";
        const opts = Object.entries(sides).map(([k, s]) => <option key={k} value={k}>{s.label}{k === "0" ? " – Base Line" : ""}</option>);
        return (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-soft">Compare</span>
              <select className="h-9 rounded-lg border border-input bg-sheet px-2.5" value={curKey} onChange={(e) => setCmp({ base: baseKey, cur: e.target.value })} aria-label="Revision to analyse">{opts}</select>
              <span className="text-soft">with</span>
              <select className="h-9 rounded-lg border border-input bg-sheet px-2.5" value={baseKey} onChange={(e) => setCmp({ base: e.target.value, cur: curKey })} aria-label="Revision to compare with">{opts}</select>
              {versions.some((v) => v.template && v.template !== p.template) && <span className="text-sm text-amber">Some revisions use an older master template, so part of a difference can come from template changes.</span>}
            </div>
            <RateAnalysis model={m} base={sides[baseKey]} cur={sides[curKey]} />
          </div>
        );
      })()}

      {tab === "revisions" && (
        <div className="overflow-x-auto rounded-xl border border-line bg-sheet">
          <table className="w-full">
            <thead className="bg-well text-left text-xs uppercase tracking-wide text-soft"><tr><th className="px-4 py-2.5">Revision</th><th className="px-4 py-2.5">Frozen</th><th className="px-4 py-2.5">By</th><th className="px-4 py-2.5">Reason</th><th className="px-4 py-2.5 text-right">Grand total</th><th className="px-4 py-2.5 text-right">Delta vs R0</th><th className="px-4 py-2.5" /></tr></thead>
            <tbody>
              {!versions.length && <tr><td colSpan={7} className="px-4 py-5 text-soft">Nothing frozen yet. R0 freezes when Base Line submits it.</td></tr>}
              {versions.map((v) => {
                const open = () => { setView(v.rev); setTab("budget"); };
                return (
                  <tr key={v.rev} tabIndex={0} title={`Open R${v.rev}`} onClick={open} onKeyDown={(e) => { if (e.key === "Enter") open(); }}
                    className="cursor-pointer border-t border-line hover:bg-tint focus-visible:bg-tint focus-visible:outline-none">
                    <td className="px-4 py-3"><RevTag>R{v.rev}</RevTag> <span className="text-sm text-soft">{v.rev === 0 ? "Base Line" : v.dept === "Management" ? "Approved" : "Frozen"}</span></td>
                    <td className="px-4 py-3">{fmtDate(v.frozen_at)}</td>
                    <td className="px-4 py-3">{(v.frozen_by && names[v.frozen_by]) || "–"} <span className="text-sm text-soft">{v.dept}</span></td>
                    <td className="px-4 py-3">{v.reason}</td>
                    <td className="px-4 py-3 text-right font-medium">{crore(v.grand_total)}</td>
                    <td className="px-4 py-3 text-right">{v.rev === 0 || r0?.grand_total == null || v.grand_total == null ? "" : crore(v.grand_total - r0.grand_total, true)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {v.rev > 0 && <button className="mr-3 font-medium text-brand hover:underline" onClick={() => { setCmp({ base: "0", cur: String(v.rev) }); setTab("analysis"); }}>Compare with R0</button>}
                      {v.xlsx_path ? <a className="font-medium text-brand hover:underline" href={`/api/projects/${p.id}/versions/${v.rev}/download`}>Download Excel</a> : <span className="text-sm text-soft">no Excel</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "team" && (teamEdit ? (
        <div className="grid gap-4 rounded-xl border border-line bg-sheet p-5">
          <TeamEditor team={teamEdit} people={data.people} onChange={setTeamEdit} lockedId={data.actsForAll ? undefined : meId} />
          <div className="flex gap-2"><Button disabled={busy} onClick={saveTeam}>{busy ? "Saving…" : "Save team"}</Button><Button variant="ghost" onClick={() => setTeamEdit(null)}>Cancel</Button></div>
        </div>
      ) : (
        <div className="grid gap-4">
          {canChangeTeam && <Button variant="outline" className="w-fit" onClick={() => setTeamEdit(teamFromRows(team))}>Change team</Button>}
          <div className="grid gap-3 sm:grid-cols-2">
            {DEPTS.map((d) => (
              <div key={d} className="rounded-xl border border-line bg-sheet p-4">
                <h3 className="mb-2 font-semibold">{dn(d)}</h3>
                <ul className="grid gap-2">
                  {team.filter((t) => t.dept === d).map((t) => (
                    <li key={t.user_id} className="flex items-center gap-2"><Initials name={t.name || t.email} /><span>{t.name || t.email}</span><span className="text-sm text-soft">{t.email}</span></li>
                  ))}
                  {!team.some((t) => t.dept === d) && <li className="text-bad">Nobody yet</li>}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ))}

      {tab === "activity" && <ActivityTab activity={activity} names={names} model={m} people={people} />}
    </div>
  );
}

// The figures that matter, beside the assumptions as you scroll (like the original app's side panel)
function Summary({ snap, r0, label, templateDate, live, incomplete }: { snap: Snapshot; r0: number | null; label: string; templateDate: string; live: boolean; incomplete: number }) {
  const rows: [string, string][] = [
    ["Cost / acre", isNum(snap.costPerAcre) ? crore(snap.costPerAcre) : "–"],
    ["Infra", cr(snap.infra)],
    ["Non-infra", cr(snap.nonInfra)],
  ];
  return (
    <aside className="grid gap-4 rounded-xl border border-line bg-sheet p-5">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-soft">Grand total – COC · {label}</div>
        {incomplete > 0
          ? <div className="mt-1 text-lg font-medium text-soft">Fill in the inputs to see the total ({incomplete} to go)</div>
          : <div className="mt-1 text-3xl font-semibold tabular-nums">{crore(snap.grandTotal)}</div>}
        {r0 !== null && isNum(snap.grandTotal) && (
          <div className={`mt-1 text-sm font-medium ${snap.grandTotal - r0 > 0.005 ? "text-bad" : snap.grandTotal - r0 < -0.005 ? "text-good" : "text-soft"}`}>
            {Math.abs(snap.grandTotal - r0) < 0.005 ? "Same as R0" : `${crore(snap.grandTotal - r0, true)} vs R0 (${crore(r0)})`}
          </div>
        )}
      </div>
      <dl className="grid gap-2 border-t border-line pt-3">
        {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-soft">{k}</dt><dd className="font-medium tabular-nums">{incomplete > 0 ? "–" : v}</dd></div>)}
      </dl>
      <p className="border-t border-line pt-3 text-sm text-soft">{live ? "Updates as you type. " : ""}Rates: master template of {templateDate}.</p>
    </aside>
  );
}
