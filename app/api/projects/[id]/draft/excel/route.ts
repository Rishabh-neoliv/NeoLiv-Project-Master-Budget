// GET /api/projects/:id/draft/excel   the working draft, as last saved, as an Excel file (same layout as the
// frozen revisions, with a "draft" row in its Revision History).
import { snapshot } from "@/lib/budget";
import { errorResponse, HttpError, loadModel, requireMember, type VersionRow } from "@/lib/server/data";
import { buildDraftWorkbook } from "@/lib/server/workbook";
import { hasDraft, nextRev, STATUS } from "@/lib/workflow";

export async function GET(_req: Request, ctx: RouteContext<"/api/projects/[id]/draft/excel">) {
  try {
    const { id } = await ctx.params;
    const { db, me, project: p } = await requireMember(id);
    if (!hasDraft(p.status)) throw new HttpError(400, "There's no working draft: the latest revision is approved. Download it from the Revisions tab.");
    const m = await loadModel(p.template);
    const inputs = { ...m.defaults, ...p.inputs }, rates = p.rates || {};
    const snap = snapshot(m, inputs, rates);
    const { data: versions } = await db.from("versions").select("*").eq("project_id", id);
    const ids = [...new Set((versions ?? []).map((v) => v.frozen_by).filter(Boolean))];
    const { data: ppl } = ids.length ? await db.from("profiles").select("id, name").in("id", ids) : { data: [] };
    const rev = nextRev(p.last_rev);
    const bytes = await buildDraftWorkbook(p, {
      rev, inputs, rates, master: snap.master, template: m.stamp,
      live: { label: `R${rev} draft`, status: `Draft - ${STATUS[p.status][0]}`, reason: p.revision_reason, total: snap.grandTotal, by: me.name },
    }, (versions ?? []) as VersionRow[], Object.fromEntries((ppl ?? []).map((x) => [x.id, x.name])));
    const file = `${p.name} - Master Budget R${rev} draft.xlsx`;
    return new Response(bytes as BodyInit, {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${file.replace(/[^\w .()-]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(file)}`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
