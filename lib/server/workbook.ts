// Builds a frozen revision's "Master Budget Rn.xlsx" on the server and stores it in the "versions" bucket.
// Same report as the original app's workbookFor(): values only, project title, Total in crores,
// Delta vs R0 in column H (from R1 on) and a Revision History sheet.
import "server-only";
import JSZip from "jszip";
import workbookApi from "@/lib/engine/workbook";
import { engineFor, isNum, lineKey, marks, rowKind, type MasterRow } from "@/lib/budget";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadModel, loadTemplateXlsx, type ProjectRow, type VersionRow } from "./data";
import { fmtDateTime } from "@/lib/dates";

const verStatus = (v: Pick<VersionRow, "rev" | "dept">) => (v.rev === 0 ? "Base Line - frozen" : v.dept === "Management" ? "Approved" : "Frozen");
const fmtDate = fmtDateTime;

/** What goes into a workbook: a frozen revision, or the working draft (with a live row in the history). */
interface Source {
  rev: number; title: string; inputs: Record<string, unknown>; rates: Record<string, unknown>; master: MasterRow[]; template: string;
  live?: { label: string; status: string; reason: string; total: number | null; by: string };
}

async function render(project: Pick<ProjectRow, "id" | "name">, src: Source, allVersions: VersionRow[], names: Record<string, string>) {
  const [m, buf] = await Promise.all([loadModel(src.template), loadTemplateXlsx(src.template)]);
  const eng = engineFor(m, src.inputs, src.rates);
  const overrides: Record<string, Record<string, unknown>> = {}, asmInputs: Record<string, unknown> = {};
  const put = (ref: string, v: unknown) => { const i = ref.lastIndexOf("!"); (overrides[ref.slice(0, i)] ||= {})[ref.slice(i + 1)] = v; };
  for (const [ref, v] of Object.entries(src.inputs)) if (ref.includes("!")) put(ref, v); else asmInputs[ref] = v;
  for (const [ref, v] of Object.entries(src.rates || {})) put(ref, v);

  put("Master Budget!B1", `${project.name.toUpperCase()} - MASTER BUDGET - ${src.title.toUpperCase()}`);
  put("Preliminaries!A1", `PROJECT : ${project.name}`);

  // the Total column in crores (the COC block already is)
  const master = src.master;
  const mk = marks(master), crCells: string[] = [];
  put("Master Budget!G4", "Total (₹ Cr)");
  for (const r of master) {
    if (rowKind(r) === "skip" || !isNum(r.c[5])) continue;
    if (!mk.crore.has(r.row)) put("Master Budget!G" + r.row, r.c[5] / 1e7);
    crCells.push("G" + r.row);
  }
  // Delta is always against R0, and not shown at R0
  const baseline = src.rev === 0 ? null : (allVersions.find((v) => v.rev === 0)?.master as MasterRow[] | undefined) ?? null;
  if (baseline) {
    const bKey = lineKey(baseline), mKey = lineKey(master);
    const bRows = Object.fromEntries(baseline.map((r) => [bKey[r.row], r]));
    put("Master Budget!H4", "Delta vs R0 (₹ Cr)");
    for (const r of master) {
      if (rowKind(r) === "skip") continue;
      const a = r.c[5], o = bRows[mKey[r.row]]?.c?.[5], d = (isNum(a) ? a : 0) - (isNum(o) ? o : 0);
      if (isNum(a) || isNum(o)) { put("Master Budget!H" + r.row, mk.crore.has(r.row) ? d : d / 1e7); crCells.push("H" + r.row); }
    }
  }
  const history: { label: string; at: string; by: string; status: string; reason: string; total: number | string }[] = allVersions.filter((v) => v.rev <= src.rev).sort((a, b) => a.rev - b.rev).map((v) => ({
    label: `R${v.rev}`, at: fmtDate(v.frozen_at), by: (v.frozen_by && names[v.frozen_by]) || "", status: verStatus(v), reason: v.reason || "", total: v.grand_total ?? "",
  }));
  if (src.live) history.push({ label: src.live.label, at: fmtDate(new Date().toISOString()), by: src.live.by, status: src.live.status, reason: src.live.reason, total: src.live.total ?? "" });
  const hideRows = master.filter((r) => rowKind(r) === "item" && /^\d+(\.\d+)?\s*m Road$/i.test(String(r.c[1] ?? "").trim()) && !(isNum(r.c[5]) && r.c[5] !== 0)).map((r) => r.row);

  return (await workbookApi.buildWorkbook(JSZip, buf, eng, asmInputs, {
    projectName: project.name, history, overrides, clean: true, trim: { "Master Budget": "H" },
    unhide: baseline ? { "Master Budget": ["H"] } : {},
    restyle: { "Master Budget": { cells: crCells, format: '#,##0.00" Cr"', align: "right" } },
    hideRows: { "Master Budget": hideRows }, outputType: "uint8array",
  })) as Uint8Array;
}

export async function buildFrozenWorkbook(project: Pick<ProjectRow, "id" | "name">, version: VersionRow, allVersions: VersionRow[], names: Record<string, string>) {
  const out = await render(project, {
    rev: version.rev, title: `R${version.rev} (${verStatus(version)})`, inputs: version.inputs, rates: version.rates, master: version.master as MasterRow[], template: version.template!,
  }, allVersions, names);
  const path = `${project.id}/R${version.rev}/Master Budget R${version.rev}.xlsx`;
  const db = createAdminClient();
  const { error } = await db.storage.from("versions").upload(path, out, { upsert: true, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  if (error) throw new Error("Couldn't store the frozen workbook: " + error.message);
  await db.from("versions").update({ xlsx_path: path }).eq("project_id", project.id).eq("rev", version.rev);
  return path;
}

/** The working draft as it is saved now, as an Excel file (not stored). */
export async function buildDraftWorkbook(project: Pick<ProjectRow, "id" | "name">, src: Omit<Source, "title"> & { live: NonNullable<Source["live"]> }, allVersions: VersionRow[], names: Record<string, string>) {
  return render(project, { ...src, title: `${src.live.label} (${src.live.status})` }, allVersions, names);
}
