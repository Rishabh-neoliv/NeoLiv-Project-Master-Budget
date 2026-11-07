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

// a working draft can be edited in these states, by the department whose turn it is
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

/** Can this person edit (save / submit) the working draft right now? */
export const canEditDraft = (status: Status, myDepts: string[]) => EDITABLE.has(status) && myDepts.includes(editDept(status));

export type NotifyKey = "created" | "team_added" | "submit" | "revise" | "return_bd" | "design_done" | "ops_submit" | "approve" | "mgmt_return";
// who hears about each step by email
export const NOTIFY: Record<NotifyKey, { to: readonly Dept[]; verb: (rev: number) => string }> = {
  created: { to: DEPTS, verb: () => "set up a new project and added you to its team" },
  team_added: { to: DEPTS, verb: () => "added you to the team of" },
  submit: { to: ["Design"], verb: (rev) => `submitted R${rev} to Design` },
  revise: { to: ["BD", "Design", "Operations"], verb: (rev) => `created new version R${rev}; it is with Design` },
  return_bd: { to: ["BD"], verb: (rev) => `sent R${rev} back to Base Line` },
  design_done: { to: ["Operations"], verb: (rev) => `submitted the R${rev} draft; it is now with Operations` },
  ops_submit: { to: ["Management"], verb: (rev) => `submitted R${rev} to Management for approval` },
  approve: { to: DEPTS, verb: (rev) => `approved R${rev}; it is now frozen` },
  mgmt_return: { to: ["Operations"], verb: (rev) => `sent R${rev} back to Operations` },
};

/** Who may change project rates (as in the original app): Base Line while preparing R0,
 *  Operations once the R1+ draft is with them. Frozen revisions never change. */
export const RATE_STAGES = new Set<Status>(["DESIGN_DONE", "OPS_IN_PROGRESS"]);
export const canEditRates = (status: Status, lastRev: number | null, myDepts: string[]) =>
  (myDepts.includes("Operations") && RATE_STAGES.has(status) && lastRev !== null)
  || (myDepts.includes("BD") && (status === "DRAFT" || status === "RETURNED") && lastRev === null);
