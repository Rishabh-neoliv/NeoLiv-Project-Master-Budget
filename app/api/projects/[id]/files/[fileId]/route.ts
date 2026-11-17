// GET    /api/projects/:id/files/:fileId   a 60-second download link
// DELETE /api/projects/:id/files/:fileId   remove a working-draft file (files of a frozen revision stay)
import { createAdminClient } from "@/lib/supabase/admin";
import { errorResponse, HttpError, requireMember, requireViewer, storageError } from "@/lib/server/data";

async function findFile(db: ReturnType<typeof createAdminClient>, id: string, fileId: string) {
  const { data: file } = await db.from("files").select("*").eq("id", fileId).eq("project_id", id).maybeSingle();
  if (!file) throw new HttpError(404, "File not found.");
  return file;
}
// removing needs the team; downloading only needs a signed-in member (everyone can view every project)
async function fileOf(id: string, fileId: string) {
  const ctx = await requireMember(id);
  return { ...ctx, file: await findFile(ctx.db, id, fileId) };
}

export async function GET(_req: Request, ctx: RouteContext<"/api/projects/[id]/files/[fileId]">) {
  try {
    const { id, fileId } = await ctx.params;
    const { db } = await requireViewer(id);
    const file = await findFile(db, id, fileId);
    const { data, error } = await db.storage.from("files").createSignedUrl(file.path, 60, { download: file.name });
    if (error || !data) throw storageError(error);
    return Response.redirect(data.signedUrl, 302);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/projects/[id]/files/[fileId]">) {
  try {
    const { id, fileId } = await ctx.params;
    const { db, me, file, myDepts, deptLabel } = await fileOf(id, fileId);
    if (file.rev !== null) throw new HttpError(403, `This file belongs to frozen revision R${file.rev}, so it stays.`);
    if (file.uploaded_by !== me.id && !myDepts.includes("BD")) throw new HttpError(403, "Only the person who uploaded it, Base Line or the admin can remove this file.");
    await db.storage.from("files").remove([file.path]);
    const { error } = await db.from("files").delete().eq("id", fileId);
    if (error) throw new HttpError(400, error.message);
    await db.from("activity").insert({ project_id: id, by: me.id, dept: deptLabel, action: `Removed file ${file.name}` });
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
