// Admins: one master template.
// POST /api/admin/templates/:stamp  { action: "make_current" }   new projects (and "Move to the new template") use it
// GET  /api/admin/templates/:stamp                               its workbook, through the app, dated now (lib/server/download.ts)
import { z } from "zod";
import { requireAdmin } from "@/lib/server/admin";
import { errorResponse, HttpError, readJson } from "@/lib/server/data";
import { storageDownload } from "@/lib/server/download";
import { makeCurrent } from "@/lib/server/templates";

const Body = z.object({ action: z.literal("make_current") });

export async function POST(req: Request, ctx: RouteContext<"/api/admin/templates/[stamp]">) {
  try {
    const { stamp } = await ctx.params;
    const { db } = await requireAdmin();
    Body.parse(await readJson(req));
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
    return await storageDownload(db, "templates", t.xlsx_path as string, `NeoLiv Master Budget template ${stamp}.xlsx`, "This template's workbook is no longer available.");
  } catch (err) {
    return errorResponse(err);
  }
}
