"use client";
// The Files tab: documents kept with the project (working draft, then each frozen revision), and what the app
// read from them. A Master Budget workbook is read exactly; other documents are read by Claude on request.
// Values are only suggestions: tick the ones you want and apply them to the draft, then save it.
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fmtCalc, fmtInput, isNum, type CellValue, type Field, type Model } from "@/lib/budget";
import { DECISION_LABEL, type Extraction } from "@/lib/extraction";
import { createClient } from "@/lib/supabase/client";
import { fmtDateTime } from "@/lib/dates";

export interface ProjectFile {
  id: string; rev: number | null; name: string; size: number; content_type: string; kind: "budget_excel" | "document";
  uploaded_by: string | null; uploaded_at: string;
  extraction_status: "none" | "pending" | "done" | "failed"; extraction: Extraction | null; extraction_error: string | null;
}

const fmtSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const fmtDate = fmtDateTime;
const CONF: Record<string, string> = { exact: "bg-good-soft text-good", high: "bg-good-soft text-good", medium: "bg-amber-soft text-amber", low: "bg-bad-soft text-bad" };
const READABLE = /\.(pdf|png|jpe?g|gif|webp|xlsx|xlsm|docx|csv|txt|md)$/i;

interface Props {
  projectId: string;
  files: ProjectFile[];
  names: Record<string, string>;
  meId: string;
  canRemoveAny: boolean;   // Base Line or the admin
  canUpload: boolean;      // on the project's team (people who aren't only view and download)
  model: Model;
  current: Record<string, CellValue>;   // the working draft, to compare with what was found
  canApply: boolean;       // the draft is editable by this person now
  onApply: (values: Record<string, CellValue>, source: string) => void;
}

export function FilesTab({ projectId, files, names, meId, canRemoveAny, canUpload, model, current, canApply, onApply }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  async function upload(list: FileList | File[]) {
    const supabase = createClient();
    for (const f of Array.from(list)) {
      setBusy(`Uploading ${f.name}…`);
      try {
        const post = async (body: unknown) => {
          const res = await fetch(`/api/projects/${projectId}/files`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
          const out = await res.json(); if (!res.ok) throw new Error(out.error); return out;
        };
        const { path, token } = await post({ action: "start", name: f.name, size: f.size, type: f.type });
        const { error } = await supabase.storage.from("files").uploadToSignedUrl(path, token, f, { contentType: f.type || "application/octet-stream" });
        if (error) throw new Error(error.message);
        const { file } = await post({ action: "done", path, name: f.name, size: f.size, type: f.type });
        toast.success(file.kind === "budget_excel" ? `${f.name}: budget workbook, ${file.extraction?.suggestions?.length ?? 0} values read exactly.` : `${f.name} uploaded.`);
        if (file.kind === "budget_excel") setOpen(file.id);
      } catch (e) {
        toast.error(`${f.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setBusy(null);
    router.refresh();
  }

  async function readWithAi(f: ProjectFile) {
    setBusy(`Reading ${f.name} with AI… this can take a minute.`);
    try {
      const res = await fetch(`/api/projects/${projectId}/files/${f.id}/extract`, { method: "POST" });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error);
      toast.success(`${f.name}: ${out.extraction.suggestions.length} suggestion(s).`);
      setOpen(f.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
    setBusy(null);
    router.refresh();
  }

  async function remove(f: ProjectFile) {
    if (!window.confirm(`Remove ${f.name}?`)) return;
    const res = await fetch(`/api/projects/${projectId}/files/${f.id}`, { method: "DELETE" });
    const out = await res.json();
    if (!res.ok) return void toast.error(out.error);
    toast.success("Removed.");
    router.refresh();
  }

  const groups = useMemo(() => {
    const revs = [...new Set(files.map((f) => f.rev))].sort((a, b) => (a === null ? -1 : b === null ? 1 : b - a));
    return revs.map((r) => ({ rev: r, files: files.filter((f) => f.rev === r) }));
  }, [files]);

  return (
    <div className="grid gap-5">
      {canUpload && <label onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); }}
        className={`grid cursor-pointer place-items-center gap-1 rounded-xl border-2 border-dashed px-6 py-8 text-center ${drag ? "border-brand bg-brand-soft" : "border-line bg-sheet hover:border-brand"}`}>
        <input type="file" multiple className="sr-only" onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = ""; }} disabled={!!busy} />
        <span className="font-semibold">Drop files here, or click to choose</span>
        <span className="text-sm text-soft">Budget Excel, minutes of meeting, drawings, PDFs, Word files or photos, up to 50 MB each. They are kept with the working draft and move into the revision when it freezes.</span>
      </label>}
      {busy && <div className="rounded-lg bg-info-soft px-4 py-3 text-info">{busy}</div>}

      {!files.length && <p className="text-soft">No files yet.</p>}
      {groups.map((g) => (
        <section key={String(g.rev)} className="grid gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-soft">{g.rev === null ? "Working draft" : `R${g.rev} (frozen)`} <span className="font-normal">({g.files.length})</span></h3>
          <div className="grid gap-2">
            {g.files.map((f) => {
              const ex = f.extraction;
              const isOpen = open === f.id;
              return (
                <div key={f.id} className="rounded-xl border border-line bg-sheet">
                  <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <a href={`/api/projects/${projectId}/files/${f.id}`} className="font-semibold text-brand hover:underline">{f.name}</a>
                      <div className="text-sm text-soft">{fmtSize(f.size)} · {(f.uploaded_by && names[f.uploaded_by]) || "someone"} · {fmtDate(f.uploaded_at)}</div>
                    </div>
                    {f.kind === "budget_excel" && <span className="rounded bg-good-soft px-2 py-0.5 text-xs font-medium text-good">Budget workbook · read exactly</span>}
                    {ex && !ex.relevant && <span className="rounded bg-bad-soft px-2 py-0.5 text-xs font-medium text-bad">Doesn&apos;t look like a project document</span>}
                    {f.extraction_status === "failed" && <span className="rounded bg-bad-soft px-2 py-0.5 text-xs font-medium text-bad" title={f.extraction_error ?? ""}>Couldn&apos;t read</span>}
                    <div className="flex flex-wrap gap-1.5">
                      {ex && <Button size="sm" variant={isOpen ? "secondary" : "outline"} onClick={() => setOpen(isOpen ? null : f.id)}>{isOpen ? "Hide details" : `Details${ex.suggestions.length ? ` (${ex.suggestions.length})` : ""}`}</Button>}
                      {canUpload && f.kind === "document" && READABLE.test(f.name) && (
                        <Button size="sm" variant={ex ? "ghost" : "default"} disabled={!!busy || f.extraction_status === "pending"} onClick={() => readWithAi(f)}>
                          {f.extraction_status === "pending" ? "Reading…" : ex ? "Read again" : "Read with AI"}
                        </Button>
                      )}
                      {f.rev === null && (f.uploaded_by === meId || canRemoveAny) && <Button size="sm" variant="ghost" className="text-bad" onClick={() => remove(f)}>Remove</Button>}
                    </div>
                  </div>
                  {f.extraction_status === "failed" && f.extraction_error && <p className="border-t border-line px-4 py-2 text-sm text-bad">{f.extraction_error}</p>}
                  {ex && isOpen && <Review file={f} ex={ex} model={model} current={current} canApply={canApply && f.rev === null} onApply={onApply} />}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function Review({ file, ex, model, current, canApply, onApply }: { file: ProjectFile; ex: Extraction; model: Model; current: Record<string, CellValue>; canApply: boolean; onApply: Props["onApply"] }) {
  const fields = useMemo(() => new Map(model.sections.flatMap((s) => s.fields.map((f) => [f.cell, f] as const))), [model]);
  // only values that differ from the draft are worth applying; those are ticked to start with
  const rows = ex.suggestions.map((s) => ({ ...s, field: fields.get(s.cell), same: String(current[s.cell] ?? "") === String(s.value ?? "") }));
  const [picked, setPicked] = useState<Set<string>>(() => new Set(rows.filter((r) => !r.same && r.confidence !== "low").map((r) => r.cell)));
  const show = (f: Field | undefined, v: CellValue) => (f ? (f.kind === "percent" && isNum(v) ? fmtInput(f, v) + " %" : isNum(v) ? fmtCalc(f, v) : String(v ?? "–")) : String(v ?? "–"));
  const approved = ex.decisions.filter((d) => d.decision === "approved" && isNum(d.cost_cr)).reduce((a, d) => a + (d.cost_cr ?? 0), 0);
  const changed = rows.filter((r) => !r.same).length;

  return (
    <div className="grid gap-4 border-t border-line px-4 py-4">
      <div className="grid gap-1">
        <div className="text-sm text-soft">{ex.doc_type}{ex.method === "ai" ? ` · read by AI${ex.model ? ` (${ex.model})` : ""}` : " · read exactly"}{ex.truncated ? " · only the first part (very large file)" : ""}</div>
        <p>{ex.summary}</p>
        {!ex.relevant && <p className="rounded-lg bg-bad-soft px-3 py-2 text-bad"><b>This doesn&apos;t look like a document for this project.</b> {ex.relevance_note} Check it was uploaded to the right place.</p>}
      </div>

      {rows.length > 0 && (
        <div className="grid gap-2">
          <h4 className="font-semibold">Values found ({rows.length}; {changed} differ from the draft)</h4>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-well text-left text-xs uppercase tracking-wide text-soft"><tr><th className="w-10 px-3 py-2" /><th className="px-3 py-2">Input</th><th className="px-3 py-2 text-right">Draft now</th><th className="px-3 py-2 text-right">In the document</th><th className="px-3 py-2">Where</th><th className="px-3 py-2">Confidence</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.cell} className={`border-t border-line ${r.same ? "text-soft" : ""}`}>
                    <td className="px-3 py-2"><input type="checkbox" aria-label={`Apply ${r.label}`} disabled={r.same || !canApply} checked={picked.has(r.cell)}
                      onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(r.cell); else n.delete(r.cell); return n; })} /></td>
                    <td className="px-3 py-2"><span className="font-medium">{r.label}</span> <span className="font-mono text-xs text-soft">{r.cell.replace(/^Additional Inputs!/, "AI ")}</span></td>
                    <td className="px-3 py-2 text-right">{show(r.field, current[r.cell])}</td>
                    <td className={`px-3 py-2 text-right font-medium ${r.same ? "" : "text-brand"}`}>{show(r.field, r.value)}{r.same ? " (same)" : ""}</td>
                    <td className="px-3 py-2 text-soft">{r.source}</td>
                    <td className="px-3 py-2"><span className={`rounded px-1.5 py-0.5 text-xs font-medium ${CONF[r.confidence]}`}>{r.confidence}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={!canApply || !picked.size} onClick={() => {
              const vals = Object.fromEntries(rows.filter((r) => picked.has(r.cell)).map((r) => [r.cell, r.value]));
              onApply(vals, `${file.name}${ex.method === "ai" ? " (AI)" : ""}`);
            }}>Apply {picked.size} value(s) to the draft</Button>
            <span className="text-sm text-soft">{canApply ? "They go into the Project Inputs tab for you to check, then Save draft." : file.rev !== null ? "Values from a frozen revision's file can't be applied." : "Only the project's team can apply values to the draft."}</span>
          </div>
        </div>
      )}

      {ex.decisions.length > 0 && (
        <div className="grid gap-2">
          <h4 className="font-semibold">Decisions ({ex.decisions.length}){approved ? <span className="font-normal text-soft"> · approved cost impact ₹ {approved.toFixed(2)} Cr</span> : ""}</h4>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-well text-left text-xs uppercase tracking-wide text-soft"><tr><th className="px-3 py-2">Item</th><th className="px-3 py-2">Discussion</th><th className="px-3 py-2">Decision</th><th className="px-3 py-2 text-right">Cost (₹ Cr)</th></tr></thead>
              <tbody>
                {ex.decisions.map((d, i) => (
                  <tr key={i} className="border-t border-line align-top">
                    <td className="px-3 py-2 font-medium">{d.item}</td>
                    <td className="px-3 py-2 text-soft">{d.discussion}</td>
                    <td className="px-3 py-2"><span className={`rounded px-1.5 py-0.5 text-xs font-medium ${d.decision === "approved" ? "bg-good-soft text-good" : d.decision === "rejected" ? "bg-bad-soft text-bad" : "bg-amber-soft text-amber"}`}>{DECISION_LABEL[d.decision]}</span></td>
                    <td className="px-3 py-2 text-right">{isNum(d.cost_cr) ? d.cost_cr.toFixed(2) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-soft">Decisions don&apos;t change the budget by themselves. Use them as the reason for a new version, or as the basis for changes on the Project Inputs and Rates tabs.</p>
        </div>
      )}

      {ex.notes.length > 0 && (
        <div className="grid gap-1"><h4 className="font-semibold">Other points</h4><ul className="list-disc pl-5 text-soft">{ex.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></div>
      )}
      {!rows.length && !ex.decisions.length && !ex.notes.length && ex.relevant && <p className="text-soft">Nothing in this document maps to the budget inputs.</p>}
    </div>
  );
}
