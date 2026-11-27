// Admin panel → Master templates: the master Excel workbooks (with the rates) the budgets are costed on.
// Upload a new one, see what it changes, make it current; switch back to an older one if needed.
import { adminOrRedirect } from "@/lib/server/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { TemplatesAdmin, type TemplateRow } from "./templates-admin";
import { PageHeader } from "@/components/page-header";

export default async function TemplatesPage() {
  await adminOrRedirect();
  const db = createAdminClient();
  const [{ data: list }, { data: projects }, { data: versions }] = await Promise.all([
    db.from("templates").select("stamp, modified, is_current, created_at, addedBy:model->>addedBy, source:model->>source").order("stamp", { ascending: false }),
    db.from("projects").select("template, status"),
    db.from("versions").select("template"),
  ]);
  const open = new Map<string, number>(), frozen = new Map<string, number>();
  for (const p of projects ?? []) if (!["APPROVED", "COMPLETED"].includes(p.status as string)) open.set(p.template as string, (open.get(p.template as string) ?? 0) + 1);
  for (const v of versions ?? []) frozen.set(v.template as string, (frozen.get(v.template as string) ?? 0) + 1);
  const rows: TemplateRow[] = (list ?? []).map((t) => ({
    stamp: t.stamp as string, label: (t.modified as string) || (t.stamp as string), current: !!t.is_current,
    addedBy: (t.addedBy as string | null) ?? null, source: (t.source as string | null) ?? null,
    drafts: open.get(t.stamp as string) ?? 0, revisions: frozen.get(t.stamp as string) ?? 0,
  }));

  return (
    <div className="grid gap-6">
      <PageHeader title="Master templates" description="The master Excel workbook with the rates and formulas every budget is costed on. Upload a new version here: the app reads it, checks that it calculates exactly like Excel, and shows what changes before you make it current." />
      <div className="max-w-5xl"><TemplatesAdmin rows={rows} /></div>
    </div>
  );
}
