// The approval workflow, ported from the original app. Used by the screens (which buttons to show)
// and by the API (which is the only place a project's status actually changes).
//
// Base Line -> Design -> Operations -> Management.
// R0 freezes when Base Line submits it. R1 onwards freezes only when Management approves it,
// and a new version can start only after that.

export const DEPTS = ["BD", "Design", "Operations", "Management"] as const;
export type Dept = (typeof DEPTS)[number];
// "BD" stays the stored key; on screen and in emails it is the Base Line team
export const DEPT_NAME: Record<Dept, string> = { BD: "Base Line", Design: "Design", Operations: "Operations", Management: "Management" };
export const dn = (d: string) => DEPT_NAME[d as Dept] || d;

export type Status = "DRAFT" | "RETURNED" | "SUBMITTED" | "DESIGN_IN_PROGRESS" | "DESIGN_DONE" | "OPS_IN_PROGRESS" | "WITH_MGMT" | "APPROVED" | "COMPLETED";
export const STATUS: Record<Status, [label: string, dept: Dept | null]> = {
  DRAFT: ["Base Line draft", "BD"], RETURNED: ["Returned to Base Line", "BD"], SUBMITTED: ["Submitted to Design", "Design"],
  DESIGN_IN_PROGRESS: ["Design in progress", "Design"], DESIGN_DONE: ["With Operations", "Operations"],
  OPS_IN_PROGRESS: ["Operations in progress", "Operations"], WITH_MGMT: ["With Management", "Management"],
  APPROVED: ["Approved", null], COMPLETED: ["Completed", null],
};

// the department whose turn it is works on the draft in these states, and submits it on
export const EDITABLE = new Set<Status>(["DRAFT", "RETURNED", "DESIGN_IN_PROGRESS", "OPS_IN_PROGRESS"]);
export const editDept = (status: Status): Dept => (status === "DESIGN_IN_PROGRESS" ? "Design" : status === "OPS_IN_PROGRESS" ? "Operations" : "BD");
const CLOSED = new Set<Status>(["APPROVED", "COMPLETED"]);
export const hasDraft = (status: Status) => !CLOSED.has(status);
export const nextRev = (lastRev: number | null | undefined) => (lastRev === null || lastRev === undefined ? 0 : lastRev + 1);
export const revLabel = (status: Status, lastRev: number | null) => (!hasDraft(status) ? `R${lastRev ?? 0}` : `R${nextRev(lastRev)} draft`);

// where each department's Submit sends the draft: [to, new status, email rule]
export const SUBMIT_TO: Partial<Record<Dept, [Dept, Status, NotifyKey]>> = {
  BD: ["Design", "SUBMITTED", "submit"],
  Design: ["Operations", "DESIGN_DONE", "design_done"],
  Operations: ["Management", "WITH_MGMT", "ops_submit"],
};

export type ActionKey = "revise" | "design_start" | "return_bd" | "ops_start" | "approve" | "mgmt_return";
export interface Action { key: ActionKey; label: string; depts: Dept[]; from: Status[]; to: Status; needsComment: boolean }
export const ACTIONS: Action[] = [
  // a new revision only once Management has approved (frozen) the last one
  { key: "revise", label: "Create new version", depts: ["BD", "Design", "Operations"], from: ["APPROVED", "COMPLETED"], to: "SUBMITTED", needsComment: true },
  { key: "design_start", label: "Start design work", depts: ["Design"], from: ["SUBMITTED"], to: "DESIGN_IN_PROGRESS", needsComment: false },
  { key: "return_bd", label: "Send back to Base Line", depts: ["Design"], from: ["SUBMITTED", "DESIGN_IN_PROGRESS"], to: "RETURNED", needsComment: true },
  { key: "ops_start", label: "Start operations", depts: ["Operations"], from: ["DESIGN_DONE"], to: "OPS_IN_PROGRESS", needsComment: false },
  { key: "approve", label: "Approve", depts: ["Management"], from: ["WITH_MGMT"], to: "APPROVED", needsComment: false },
  { key: "mgmt_return", label: "Send back to Operations", depts: ["Management"], from: ["WITH_MGMT"], to: "OPS_IN_PROGRESS", needsComment: true },
];

export function actionLabel(a: Action, lastRev: number | null) {
  const r = nextRev(lastRev);
  if (a.key === "approve") return `Approve R${r}`;
  if (a.key === "revise") return `Create new version R${r}`;
  return a.label;
}

/** Actions this person can take now, given their departments on the project. */
export const availableActions = (status: Status, myDepts: string[]) =>
  ACTIONS.filter((a) => a.from.includes(status) && a.depts.some((d) => myDepts.includes(d)));

/** Can this person change the working draft (inputs, rates, files) right now? Anyone on the project's team,
 *  from any department, whenever a draft is open (user's decision, 2026-11-13). People not on the team only view. */
export const canEditDraft = (status: Status, myDepts: string[]) => hasDraft(status) && myDepts.length > 0;

/** Can this person submit the draft on to the next department? Only the department whose turn it is. */
export const canSubmit = (status: Status, myDepts: string[]) => EDITABLE.has(status) && myDepts.includes(editDept(status));

// Which steps send an email, and to whom (To). The person who took the step is in Cc. No email when a project is
// created or someone joins a team (user's decision, 2026-11-18). Each step goes to the department that has to act
// next; an approval goes to the whole team.
export type NotifyKey = "submit" | "revise" | "return_bd" | "design_done" | "ops_submit" | "approve" | "mgmt_return";
export const NOTIFY: Record<NotifyKey, { to: readonly Dept[]; verb: (rev: number) => string }> = {
  submit: { to: ["Design"], verb: (rev) => `submitted R${rev} to Design` },
  revise: { to: ["Design"], verb: (rev) => `created new version R${rev}; it is with Design` },
  return_bd: { to: ["BD"], verb: (rev) => `sent R${rev} back to Base Line` },
  design_done: { to: ["Operations"], verb: (rev) => `submitted the R${rev} draft; it is now with Operations` },
  ops_submit: { to: ["Management"], verb: (rev) => `submitted R${rev} to Management for approval` },
  approve: { to: DEPTS, verb: (rev) => `approved R${rev}; it is now frozen` },
  mgmt_return: { to: ["Operations"], verb: (rev) => `sent R${rev} back to Operations` },
};

/** Who may change project rates: like the draft, anyone on the team while a draft is open.
 *  (The original app allowed Base Line while preparing R0 and Operations on R1+.) Frozen revisions never change. */
export const canEditRates = canEditDraft;
