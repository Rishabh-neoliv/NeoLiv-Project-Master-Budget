// GET /api/projects/:id/versions/:rev/download: a 60-second link to the frozen revision's Excel file.
import { errorResponse, HttpError, requireMember } from "@/lib/server/data";

export async function GET(_req: Request, ctx: RouteContext<"/api/projects/[id]/versions/[rev]/download">) {
  try {
    const { id, rev } = await ctx.params;
    const { db, project } = await requireMember(id);
    const { data: v } = await db.from("versions").select("xlsx_path").eq("project_id", id).eq("rev", Number(rev)).single();
    if (!v?.xlsx_path) throw new HttpError(404, `R${rev} has no Excel file yet.`);
    const { data, error } = await db.storage.from("versions").createSignedUrl(v.xlsx_path, 60, { download: `${project.name} - Master Budget R${rev}.xlsx` });
    if (error || !data) throw new HttpError(500, error?.message ?? "Couldn't create the download link.");
    return Response.redirect(data.signedUrl, 302);
  } catch (err) {
    return errorResponse(err);
  }
}
