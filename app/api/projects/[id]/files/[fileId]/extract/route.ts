// POST /api/projects/:id/files/:fileId/extract   Claude reads the file and suggests values (stored on the file).
// Nothing in the budget changes here; the Files tab shows the suggestions for a person to apply.
import Anthropic from "@anthropic-ai/sdk";
import { errorResponse, HttpError, loadModel, requireMember } from "@/lib/server/data";
import { aiExtract } from "@/lib/server/extract";

export const maxDuration = 300; // reading a long PDF can take a minute or two

export async function POST(_req: Request, ctx: RouteContext<"/api/projects/[id]/files/[fileId]/extract">) {
  const { id, fileId } = await ctx.params;
  // set once this request has marked the file as being read, so only it records a failure
  let db: Awaited<ReturnType<typeof requireMember>>["db"] | null = null;
  try {
    const c = await requireMember(id);
    const { data: file } = await c.db.from("files").select("*").eq("id", fileId).eq("project_id", id).maybeSingle();
    if (!file) throw new HttpError(404, "File not found.");
    if (file.extraction_status === "pending") throw new HttpError(409, "This file is already being read.");
    await c.db.from("files").update({ extraction_status: "pending", extraction_error: null }).eq("id", fileId);
    db = c.db;

    const { data: blob, error } = await c.db.storage.from("files").download(file.path);
    if (error || !blob) throw new HttpError(500, "Couldn't open the file.");
    const m = await loadModel(c.project.template);
    const extraction = await aiExtract(m, { ...m.defaults, ...c.project.inputs }, { name: file.name, contentType: file.content_type, data: new Uint8Array(await blob.arrayBuffer()) }, c.project);

    await c.db.from("files").update({ extraction_status: "done", extraction, extracted_at: new Date().toISOString() }).eq("id", fileId);
    await c.db.from("activity").insert({ project_id: id, by: c.me.id, dept: c.deptLabel, action: `Read ${file.name} with AI: ${extraction.suggestions.length} suggestion(s)${extraction.decisions.length ? `, ${extraction.decisions.length} decision(s)` : ""}` });
    return Response.json({ extraction });
  } catch (err) {
    const message = err instanceof Anthropic.AuthenticationError ? "The Anthropic API key isn't valid. Check ANTHROPIC_API_KEY."
      : err instanceof Anthropic.RateLimitError ? "The AI is busy right now. Try again in a minute."
      : err instanceof Anthropic.APIError ? `The AI couldn't read the file (${err.status}): ${err.message}`
      : err instanceof Error ? err.message : String(err);
    if (db) await db.from("files").update({ extraction_status: "failed", extraction_error: message }).eq("id", fileId);
    return err instanceof HttpError ? errorResponse(err) : Response.json({ error: message }, { status: 502 });
  }
}
