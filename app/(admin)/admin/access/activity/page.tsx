// Administration → Roles & access → Role activity (admins): the read-only audit log (migration 0008) of every change
// to a person's role, project access, invites and member details, refused attempts included. Records can't be edited
// or deleted by anyone; this page only reads them. Filters, details and the CSV / print export are in the browser.
import Link from "next/link";
import { Lock } from "lucide-react";
import { adminOrRedirect } from "@/lib/server/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { RoleActivity, type AuditRow } from "./role-activity";
import { PageHeader } from "@/components/page-header";

export default async function RoleActivityPage() {
  await adminOrRedirect();
  const { data, error } = await createAdminClient().from("audit_log")
    .select("id, at, actor, actor_name, target, target_name, target_email, kind, action, before, after, project_id, project_name, reason, status, detail")
    .order("at", { ascending: false }).limit(3000);
  return (
    <div className="grid gap-6">
      <PageHeader title="Role activity"
        above={<><Link href="/admin/access" className="text-brand hover:underline">Roles &amp; access</Link> / Role activity</>}
        description="Every change to a person's role, project access, invite or details, who made it and when, with what it was before and after."
        actions={<div className="flex items-start gap-3 rounded-xl border border-good/30 bg-good-soft px-4 py-3 text-good">
          <Lock className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div><b>Read-only audit log</b><div className="text-sm">Records can&apos;t be edited or deleted, by anyone.</div></div>
        </div>} />
      {error
        ? <p className="rounded-xl border border-amber/40 bg-amber-soft p-5 text-amber"><b>Role activity isn&apos;t switched on yet.</b> Run <code>supabase/migrations/0008_access_levels_audit.sql</code> in Supabase → SQL Editor; from then on every role and access change is recorded here.</p>
        : <RoleActivity rows={(data ?? []) as AuditRow[]} />}
    </div>
  );
}
