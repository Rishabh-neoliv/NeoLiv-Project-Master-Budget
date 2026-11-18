// DELETE /api/admin/projects/:id   admins delete a TEST project, with its team, revisions, history, files and the
// stored Excel workbooks. Live projects can never be deleted (lib/roles.ts).
import { requireAdmin } from "@/lib/server/admin";
import { errorResponse, HttpError } from "@/lib/server/data";
import { canDeleteProject, kindOf } from "@/lib/roles";

export async function DELETE(_req: Request, ctx: RouteContext<"/api/admin/projects/[id]">) {
  try {
    const { id } = await ctx.params;
    const { db, me } = await requireAdmin();
    const { data: p } = await db.from("projects").select("id, name, kind").eq("id", id).maybeSingle();
    if (!p) throw new HttpError(404, "Project not found.");
    if (!canDeleteProject(me.role, kindOf(p))) throw new HttpError(403, "Live projects can't be deleted. Only Test projects can.");

    // stored files first (the rows go with the project): revision workbooks and uploaded documents
    const { data: versions } = await db.from("versions").select("xlsx_path").eq("project_id", id);
    const { data: files } = await db.from("files").select("path").eq("project_id", id);
    const workbooks = (versions ?? []).map((v) => v.xlsx_path).filter(Boolean) as string[];
    const docs = (files ?? []).map((f) => f.path).filter(Boolean) as string[];
    if (workbooks.length) await db.storage.from("versions").remove(workbooks);
    if (docs.length) await db.storage.from("files").remove(docs);

    const { error } = await db.from("projects").delete().eq("id", id).eq("kind", "test");
    if (error) throw new HttpError(400, error.message);
    return Response.json({ ok: true, name: p.name, workbooks: workbooks.length, files: docs.length });
  } catch (err) {
    return errorResponse(err);
  }
}
