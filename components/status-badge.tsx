import { STATUS, type Status } from "@/lib/workflow";

const TONE: Record<Status, string> = {
  DRAFT: "bg-info-soft text-info", RETURNED: "bg-bad-soft text-bad", SUBMITTED: "bg-amber-soft text-amber",
  DESIGN_IN_PROGRESS: "bg-amber-soft text-amber", DESIGN_DONE: "bg-amber-soft text-amber", OPS_IN_PROGRESS: "bg-amber-soft text-amber",
  WITH_MGMT: "bg-brand-soft text-brand", APPROVED: "bg-good-soft text-good", COMPLETED: "bg-good-soft text-good",
};

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TONE[status]}`}>{STATUS[status][0]}</span>;
}

export function RevTag({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex rounded bg-amber-soft px-1.5 py-0.5 font-mono text-xs text-amber">{children}</span>;
}
