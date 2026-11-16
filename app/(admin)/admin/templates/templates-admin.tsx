"use client";

// Upload a new master workbook → the app checks it → the admin sees what changes → add it (and make it current).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { crore, inr } from "@/lib/budget";
import type { TemplateReport } from "@/lib/server/templates";
import { createClient } from "@/lib/supabase/client";

export interface TemplateRow { stamp: string; label: string; current: boolean; addedBy: string | null; source: string | null; drafts: number; revisions: number }

const rate = (v: number | null) => (v === null ? "–" : inr(v, Number.isInteger(v) ? 0 : 2));

export function TemplatesAdmin({ rows }: { rows: TemplateRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [upload, setUpload] = useState<{ path: string; name: string; report: TemplateReport } | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  async function post(url: string, body: unknown) {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const out = await res.json();
    if (!res.ok && !out.report) throw new Error(out.error);
    return out;
  }

  async function choose(f: File) {
    setUpload(null);
    try {
      setBusy(`Uploading ${f.name}…`);
      const { path, token } = await post("/api/admin/templates", { action: "start", name: f.name, size: f.size });
      const { error } = await createClient().storage.from("templates").uploadToSignedUrl(path, token, f, { contentType: f.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      if (error) throw new Error(error.message);
      setBusy("Reading the workbook and recalculating every formula…");
      const { report } = await post("/api/admin/templates", { action: "check", path, name: f.name });
      setUpload({ path, name: f.name, report });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  }

  async function add(current: boolean) {
    if (!upload) return;
    try {
      setBusy(current ? "Adding it and making it current…" : "Adding it…");
      const out = await post("/api/admin/templates", { action: "add", path: upload.path, name: upload.name, current });
      if (out.error) throw new Error(out.error);
      toast.success(current ? `The template of ${out.label} is now current. New projects use it; open drafts can move to it.` : `The template of ${out.label} is added (not current).`);
      setUpload(null);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  }

  async function makeCurrent(t: TemplateRow) {
    if (armed !== t.stamp) { setArmed(t.stamp); return; }
    setArmed(null);
    try {
      setBusy("Switching…");
      await post(`/api/admin/templates/${t.stamp}`, { action: "make_current" });
      toast.success(`The template of ${t.label} is now current.`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  }

  const r = upload?.report;
  const changed = r?.rates.changed ?? [];
  const shown = showAll ? changed : changed.slice(0, 15);
  const delta = r && r.sample.current !== null && r.sample.next !== null ? r.sample.next - r.sample.current : null;

  return (
    <div className="grid gap-6">
      <section className="grid gap-3 rounded-xl border border-line bg-sheet p-5">
        <h2 className="text-lg font-semibold">Upload a new master workbook</h2>
        <label className="grid cursor-pointer place-items-center gap-1 rounded-xl border-2 border-dashed border-line px-6 py-7 text-center hover:border-brand">
          <input type="file" accept=".xlsx" className="sr-only" disabled={!!busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) choose(f); e.target.value = ""; }} />
          <span className="font-semibold">Choose the master budget .xlsx</span>
          <span className="text-sm text-soft">Same layout as the current master (same sheets and input rows), with new rates or formulas. Nothing changes until you press Add.</span>
        </label>
        {busy && <div className="rounded-lg bg-info-soft px-4 py-3 text-info">{busy}</div>}
      </section>

      {r && (
        <section className="grid gap-4 rounded-xl border border-brand bg-sheet p-5">
          <div>
            <h2 className="text-lg font-semibold">{upload.name}</h2>
            <p className="text-soft">Saved in Excel on <b className="text-ink">{r.label}</b> · compared with the current template of {r.sample.currentLabel}</p>
          </div>

          {r.errors.length > 0 ? (
            <div className="grid gap-1 rounded-lg bg-bad-soft px-4 py-3 text-bad">
              <b>This workbook can&apos;t be added:</b>
              <ul className="list-disc pl-5">{r.errors.map((e) => <li key={e}>{e}</li>)}</ul>
              {r.recalcDiffs.length > 0 && <ul className="mt-1 list-disc pl-5 text-sm">{r.recalcDiffs.slice(0, 8).map((d) => <li key={d.cell}>{d.cell}: Excel {JSON.stringify(d.excel)}, app {JSON.stringify(d.app)}</li>)}</ul>}
            </div>
          ) : (
            <div className="rounded-lg bg-good-soft px-4 py-3 text-good">
              <b>All {inr(r.formulas)} formulas recalculate exactly like Excel.</b> The app will cost projects the same way this workbook does.
            </div>
          )}
          {r.warnings.length > 0 && (
            <div className="rounded-lg bg-amber-soft px-4 py-3 text-amber"><ul className="list-disc pl-5">{r.warnings.map((w) => <li key={w}>{w}</li>)}</ul></div>
          )}

          {r.errors.length === 0 && <>
            <div className="grid gap-1">
              <h3 className="font-semibold">Effect on a sample project</h3>
              <p className="text-soft">The workbook&apos;s own sample inputs, costed on both templates: <b className="text-ink">{crore(r.sample.current)}</b> now → <b className="text-ink">{crore(r.sample.next)}</b> with this one
                {delta !== null && <> (<span className={delta > 0 ? "text-bad" : delta < 0 ? "text-good" : ""}>{crore(delta, true)}</span>)</>}.</p>
            </div>

            <div className="grid gap-2">
              <h3 className="font-semibold">Rates: {changed.length ? `${changed.length} changed` : "no changes"} <span className="font-normal text-soft">(of {r.rates.total} items)</span></h3>
              {changed.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-line">
                  <table className="w-full text-sm">
                    <thead className="bg-well text-left text-xs uppercase tracking-wide text-soft"><tr><th className="px-3 py-2">Item</th><th className="px-3 py-2">Location</th><th className="px-3 py-2 text-right">Now</th><th className="px-3 py-2 text-right">New</th></tr></thead>
                    <tbody>{shown.map((c) => (
                      <tr key={`${c.sheet}|${c.item}|${c.loc}`} className="border-t border-line">
                        <td className="px-3 py-1.5">{c.sheet} – {c.item}</td><td className="px-3 py-1.5">{c.loc}</td>
                        <td className="px-3 py-1.5 text-right text-soft">{rate(c.from)}</td><td className="px-3 py-1.5 text-right font-medium">{rate(c.to)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
              {changed.length > 15 && <Button variant="ghost" className="w-fit" onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer" : `Show all ${changed.length}`}</Button>}
              {r.rates.added.length > 0 && <p className="text-sm"><b>New items:</b> {r.rates.added.join(", ")}</p>}
              {r.rates.removed.length > 0 && <p className="text-sm text-amber"><b>Items no longer in the workbook:</b> {r.rates.removed.join(", ")}. Project rates set on them won&apos;t carry over.</p>}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
              <Button disabled={!!busy} onClick={() => add(true)}>Add and make current</Button>
              <Button variant="outline" disabled={!!busy} onClick={() => add(false)}>Add, but keep the current one</Button>
              <Button variant="ghost" disabled={!!busy} onClick={() => setUpload(null)}>Cancel</Button>
            </div>
            <p className="text-sm text-soft">Once it is current, new projects use it, and every open draft shows “A newer master template is available” with a button to move to it. Frozen revisions keep the template they were frozen on (Base Line can recalculate one on the new template, with a reason).</p>
          </>}
          {r.errors.length > 0 && <Button variant="ghost" className="w-fit" onClick={() => setUpload(null)}>Close</Button>}
        </section>
      )}

      <section className="grid gap-2">
        <h2 className="text-lg font-semibold">All templates</h2>
        <div className="overflow-x-auto rounded-xl border border-line bg-sheet">
          <table className="w-full text-sm">
            <thead className="bg-well text-left text-xs uppercase tracking-wide text-soft">
              <tr><th className="px-4 py-2.5">Saved in Excel</th><th className="px-4 py-2.5">Added by</th><th className="px-4 py-2.5 text-right">Open drafts</th><th className="px-4 py-2.5 text-right">Frozen revisions</th><th className="px-4 py-2.5" /></tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.stamp} className="border-t border-line">
                  <td className="px-4 py-3">
                    <div className="font-medium">{t.label}{t.current && <span className="ml-2 rounded bg-good-soft px-1.5 py-0.5 text-xs text-good">Current</span>}</div>
                    <div className="text-xs text-soft">{t.source ?? t.stamp}</div>
                  </td>
                  <td className="px-4 py-3 text-soft">{t.addedBy ?? "Set-up"}</td>
                  <td className="px-4 py-3 text-right">{t.drafts}</td>
                  <td className="px-4 py-3 text-right">{t.revisions}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <a href={`/api/admin/templates/${t.stamp}`} className="rounded-md px-2.5 py-1.5 text-sm text-brand hover:bg-well">Download</a>
                      {!t.current && <Button size="sm" variant={armed === t.stamp ? "default" : "ghost"} disabled={!!busy} onClick={() => makeCurrent(t)}
                        title="New projects use it; open drafts can move to it">{armed === t.stamp ? "Confirm: make current" : "Make current"}</Button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
