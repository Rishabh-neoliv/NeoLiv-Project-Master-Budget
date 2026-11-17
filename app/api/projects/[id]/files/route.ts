// Files on a project. The browser uploads straight to private storage with a one-time link (so large files
// don't pass through the app's server, which Vercel limits to 4.5 MB), then tells the API the upload is done.
//
// POST /api/projects/:id/files { action: "start", name, size, type }   -> { path, token }  (one-time upload link)
// POST /api/projects/:id/files { action: "done", path, name, size, type } -> the file row; a Master Budget
//      workbook is read exactly at this point (no AI)
import { z } from "zod";
import { errorResponse, HttpError, readJson, loadModel, requireMember } from "@/lib/server/data";
import { exactIfBudgetWorkbook } from "@/lib/server/extract";

const MAX_FILE_MB = 50;
const Start = z.object({ action: z.literal("start"), name: z.string().trim().min(1).max(200), size: z.number().int().positive(), type: z.string().max(200) });
const Done = z.object({ action: z.literal("done"), path: z.string().min(1), name: z.string().trim().min(1).max(200), size: z.number().int().nonnegative(), type: z.string().max(200) });

const safeName = (n: string) => n.replace(/[^\w.\-() ]+/g, "_").replace(/\s+/g, " ").slice(-120);

export async function POST(req: Request, ctx: RouteContext<"/api/projects/[id]/files">) {
  try {
    const { id } = await ctx.params;
    const { db, me, project, deptLabel } = await requireMember(id);
    const body = z.discriminatedUnion("action", [Start, Done]).parse(await readJson(req));

    if (body.action === "start") {
      if (body.size > MAX_FILE_MB * 1024 * 1024) throw new HttpError(400, `Files can be up to ${MAX_FILE_MB} MB.`);
      const path = `${id}/${crypto.randomUUID()}/${safeName(body.name)}`;
      const { data, error } = await db.storage.from("files").createSignedUploadUrl(path);
      if (error || !data) throw new HttpError(500, "Couldn't prepare the upload: " + (error?.message ?? "unknown error"));
      return Response.json({ path: data.path, token: data.token });
    }

    if (!body.path.startsWith(`${id}/`)) throw new HttpError(400, "That upload belongs to another project.");
    const { data: blob, error: dlErr } = await db.storage.from("files").download(body.path);
    if (dlErr || !blob) throw new HttpError(400, "The upload didn't arrive. Try again.");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const m = await loadModel(project.template);
    const exact = await exactIfBudgetWorkbook(m, bytes, body.name);

    const { data: file, error } = await db.from("files").insert({
      project_id: id, rev: null, name: body.name, path: body.path, size: bytes.byteLength, content_type: body.type,
      kind: exact ? "budget_excel" : "document", uploaded_by: me.id,
      extraction_status: exact ? "done" : "none", extraction: exact, extracted_at: exact ? new Date().toISOString() : null,
    }).select("*").single();
    if (error) throw new HttpError(400, error.message);
    await db.from("activity").insert({ project_id: id, by: me.id, dept: deptLabel, action: `Uploaded ${body.name}`, rev: project.last_rev === null ? 0 : null });
    return Response.json({ file });
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: err.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    return errorResponse(err);
  }
}
