// The read-only audit log (migration 0008): every change to someone's role, project access, invite or member details,
// and every refused attempt, with before and after. Written here only, by the server; read by admins on
// Administration → Roles & access → Role activity. Records can't be changed or deleted (database triggers).
// Writing is best effort: if the table isn't there yet (migration not run), the change itself still goes through.
import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

type Db = ReturnType<typeof createAdminClient>;
export type AuditKind = "role" | "project_access" | "invite" | "member";
export interface AuditEntry {
  actor: { id: string; name: string } | null;
  target?: { id: string; name?: string; email?: string } | null;
  kind: AuditKind;
  action: string;
  before?: unknown;
  after?: unknown;
  project?: { id: string; name: string } | null;
  reason?: string | null;
  status?: "success" | "failed";
  detail?: string | null;
}

export async function audit(db: Db, ...entries: AuditEntry[]) {
  if (!entries.length) return;
  const { error } = await db.from("audit_log").insert(entries.map((e) => ({
    actor: e.actor?.id || null, actor_name: e.actor?.name ?? "",
    target: e.target?.id || null, target_name: e.target?.name ?? "", target_email: e.target?.email ?? "",
    kind: e.kind, action: e.action, before: e.before ?? null, after: e.after ?? null,
    project_id: e.project?.id || null, project_name: e.project?.name ?? null,
    reason: e.reason?.trim() || null, status: e.status ?? "success", detail: e.detail ?? null,
  })));
  if (error) console.error("audit log:", error.message);
}
