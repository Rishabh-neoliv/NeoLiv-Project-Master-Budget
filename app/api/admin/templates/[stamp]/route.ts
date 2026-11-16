// Admins: one master template.
// POST /api/admin/templates/:stamp  { action: "make_current" }   new projects (and "Move to the new template") use it
// GET  /api/admin/templates/:stamp                               a 60-second download link to its workbook
import { z } from "zod";
import { requireAdmin } from "@/lib/server/admin";
import { errorResponse, HttpError } from "@/lib/server/data";
import { makeCurrent } from "@/lib/server/templates";

const Body = z.object({ action: z.literal("make_current") });

export async function POST(req: Request, ctx: RouteContext<"/api/admin/templates/[stamp]">) {
  try {
    const { stamp } = await ctx.params;
    const { db } = await requireAdmin();
    Body.parse(await req.json());
    await makeCurrent(db, stamp);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: "Invalid request" }, { status: 400 });
    return errorResponse(err);
  }
}

export async function GET(_req: Request, ctx: RouteContext<"/api/admin/templates/[stamp]">) {
  try {
    const { stamp } = await ctx.params;
    const { db } = await requireAdmin();
    const { data: t } = await db.from("templates").select("xlsx_path, modified").eq("stamp", stamp).maybeSingle();
    if (!t) throw new HttpError(404, "Template not found.");
    const { data, error } = await db.storage.from("templates").createSignedUrl(t.xlsx_path as string, 60, { download: `NeoLiv Master Budget template ${stamp}.xlsx` });
    if (error || !data) throw new HttpError(500, error?.message ?? "Couldn't create the download link.");
    return Response.redirect(data.signedUrl, 302);
  } catch (err) {
    return errorResponse(err);
  }
}
