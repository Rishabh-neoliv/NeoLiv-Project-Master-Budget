// GET /api/projects/:id/versions/:rev/download: the frozen revision's Excel file, through the app, dated now
// (lib/server/download.ts); the freeze date stays in its Revision History sheet.
import { errorResponse, HttpError, requireViewer } from "@/lib/server/data";
import { storageDownload } from "@/lib/server/download";

export async function GET(_req: Request, ctx: RouteContext<"/api/projects/[id]/versions/[rev]/download">) {
  try {
    const { id, rev } = await ctx.params;
    const { db, project } = await requireViewer(id);
    const { data: v } = await db.from("versions").select("xlsx_path").eq("project_id", id).eq("rev", Number(rev)).single();
    if (!v?.xlsx_path) throw new HttpError(404, `R${rev} has no Excel file yet.`);
    return await storageDownload(db, "versions", v.xlsx_path, `${project.name} - Master Budget R${rev}.xlsx`);
  } catch (err) {
    return errorResponse(err);
  }
}
