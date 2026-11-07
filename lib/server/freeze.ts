// Freezing a revision: the working draft becomes version R<n> (with its Excel file). Used by Base Line's
// R0 submit and by Management's approval.
import "server-only";
import type { Model, Snapshot } from "@/lib/budget";
import { HttpError, type ProjectRow, type VersionRow } from "./data";
import { buildFrozenWorkbook } from "./workbook";
import type { createAdminClient } from "@/lib/supabase/admin";

type Db = ReturnType<typeof createAdminClient>;

export async function freezeVersion(db: Db, args: {
  project: ProjectRow; rev: number; m: Model; snap: Snapshot; inputs: Record<string, unknown>; rates: Record<string, unknown>;
  reason: string; dept: string; by: string;
}) {
  const { project, rev, m, snap, inputs, rates, reason, dept, by } = args;
  const row = {
    project_id: project.id, rev, inputs, rates, master: snap.master, calc: snap.calc, grand_total: snap.grandTotal,
    reason, dept, template: m.stamp, frozen_by: by,
  };
  const { data: version, error } = await db.from("versions").insert(row).select("*").single();
  if (error) throw new HttpError(error.code === "23505" ? 409 : 400, error.code === "23505" ? `R${rev} is already frozen.` : error.message);
  // the working draft's files now belong to this revision (as the original app moved them into its folder)
  await db.from("files").update({ rev }).eq("project_id", project.id).is("rev", null);

  // the Excel is a convenience: a failure here must not undo the freeze, so it is reported, not thrown
  let workbookError: string | null = null;
  try {
    const { data: all } = await db.from("versions").select("*").eq("project_id", project.id);
    const ids = [...new Set((all ?? []).map((v) => v.frozen_by).filter(Boolean))];
    const { data: ppl } = ids.length ? await db.from("profiles").select("id, name").in("id", ids) : { data: [] };
    const names = Object.fromEntries((ppl ?? []).map((p) => [p.id, p.name]));
    await buildFrozenWorkbook(project, version as VersionRow, (all ?? []) as VersionRow[], names);
  } catch (e) {
    workbookError = e instanceof Error ? e.message : String(e);
    console.error("workbook for", project.id, "R" + rev, e);
  }
  return { version: version as VersionRow, workbookError };
}
