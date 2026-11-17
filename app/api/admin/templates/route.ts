// Admins: adding a new master template (the master Excel with the rates).
// POST /api/admin/templates  { action: "start", name, size }        a one-time upload address in the private bucket
// POST /api/admin/templates  { action: "check", path, name }        reads and checks the uploaded workbook (saves nothing)
// POST /api/admin/templates  { action: "add", path, name, current } checks again, then adds it (and makes it current)
import { z } from "zod";
import { requireAdmin } from "@/lib/server/admin";
import { errorResponse, HttpError, readJson } from "@/lib/server/data";
import { checkTemplate, INCOMING, makeCurrent } from "@/lib/server/templates";

const MAX_MB = 20;
const Start = z.object({ action: z.literal("start"), name: z.string().min(1).max(200), size: z.number().int().positive() });
const Check = z.object({ action: z.literal("check"), path: z.string().startsWith(INCOMING), name: z.string().min(1).max(200) });
const Add = z.object({ action: z.literal("add"), path: z.string().startsWith(INCOMING), name: z.string().min(1).max(200), current: z.boolean() });

export async function POST(req: Request) {
  try {
    const { db, me } = await requireAdmin();
    const body = z.discriminatedUnion("action", [Start, Check, Add]).parse(await readJson(req));

    if (body.action === "start") {
      if (!/\.xlsx$/i.test(body.name)) throw new HttpError(400, "Upload the master workbook as an .xlsx file.");
      if (body.size > MAX_MB * 1024 * 1024) throw new HttpError(400, `The workbook can be up to ${MAX_MB} MB.`);
      // tidy up uploads that were checked but never added
      const { data: old } = await db.storage.from("templates").list(INCOMING.slice(0, -1), { limit: 100 });
      const stale = (old ?? []).filter((o) => o.created_at && Date.now() - Date.parse(o.created_at) > 86_400_000).map((o) => INCOMING + o.name);
      if (stale.length) await db.storage.from("templates").remove(stale);
      const { data, error } = await db.storage.from("templates").createSignedUploadUrl(`${INCOMING}${crypto.randomUUID()}.xlsx`);
      if (error || !data) throw new HttpError(500, "Couldn't prepare the upload: " + (error?.message ?? "unknown error"));
      return Response.json({ path: data.path, token: data.token });
    }

    const { data: blob, error: dlErr } = await db.storage.from("templates").download(body.path);
    if (dlErr || !blob) throw new HttpError(400, "The upload didn't arrive. Upload the workbook again.");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const { report, model } = await checkTemplate(db, bytes, body.name);
    if (body.action === "check") return Response.json({ report });

    if (report.errors.length) return Response.json({ error: "This workbook can't be added: " + report.errors[0], report }, { status: 400 });
    const xlsxPath = `${model.stamp}.xlsx`;
    const { error: upErr } = await db.storage.from("templates").upload(xlsxPath, bytes, { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    if (upErr) throw new HttpError(400, "Couldn't store the workbook: " + upErr.message);
    const { error } = await db.from("templates").insert({
      stamp: model.stamp, modified: String(model.templateModified), xlsx_path: xlsxPath, is_current: false,
      model: { ...model, addedBy: me.name || me.email, addedAt: new Date().toISOString() },
    });
    if (error) { await db.storage.from("templates").remove([xlsxPath]); throw new HttpError(400, error.message); }
    if (body.current) await makeCurrent(db, model.stamp);
    await db.storage.from("templates").remove([body.path]);
    return Response.json({ ok: true, stamp: model.stamp, label: model.templateModified });
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: err.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    return errorResponse(err);
  }
}
