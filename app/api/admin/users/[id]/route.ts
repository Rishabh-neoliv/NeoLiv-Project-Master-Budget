// Admin only, for one member.
// POST /api/admin/users/:id  { action: "link" }     a fresh link to set their password (lost or expired invite)
// POST /api/admin/users/:id  { action: "remove" }   they can no longer sign in (their history stays)
// POST /api/admin/users/:id  { action: "restore" }  they can sign in again
import { z } from "zod";
import { requireAdmin } from "@/lib/server/admin";
import { errorResponse, HttpError } from "@/lib/server/data";
import { sendInvite } from "@/lib/server/email";
import { appUrlFor, linkFor } from "@/lib/server/links";

const Body = z.object({ action: z.enum(["link", "remove", "restore"]) });

export async function POST(req: Request, ctx: RouteContext<"/api/admin/users/[id]">) {
  try {
    const { id } = await ctx.params;
    const { db, me } = await requireAdmin();
    const { action } = Body.parse(await req.json());
    if (id === me.id) throw new HttpError(400, "That's your own admin account.");
    const { data: person } = await db.from("profiles").select("id, name, email").eq("id", id).single();
    if (!person) throw new HttpError(404, "Member not found.");

    if (action === "link") {
      // "recovery" works whether or not they used their first invite: it signs them in to set a password
      const { data, error } = await db.auth.admin.generateLink({ type: "recovery", email: person.email });
      if (error) throw new HttpError(400, error.message);
      const link = linkFor(appUrlFor(req), data.properties.hashed_token, "recovery");
      const emailed = await sendInvite({ to: person.email, name: person.name, from: me.name, link, again: true });
      return Response.json({ link, emailed });
    }
    const { error } = await db.auth.admin.updateUserById(id, { ban_duration: action === "remove" ? "876000h" : "none" });
    if (error) throw new HttpError(400, error.message);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: "Invalid request" }, { status: 400 });
    return errorResponse(err);
  }
}
