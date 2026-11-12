// Admin only, for one member.
// POST /api/admin/users/:id  { action: "link" }     a fresh link to set their password (lost or expired invite)
// POST /api/admin/users/:id  { action: "remove" }   they can no longer sign in (their history stays)
// POST /api/admin/users/:id  { action: "restore" }  they can sign in again
// POST /api/admin/users/:id  { action: "make_admin" } hands the admin role over: they become the admin, you a
//                                                     normal member (the app has one admin)
import { z } from "zod";
import { requireAdmin } from "@/lib/server/admin";
import { errorResponse, HttpError } from "@/lib/server/data";
import { sendInvite } from "@/lib/server/email";
import { mailProvider } from "@/lib/server/mailer";
import { appUrlFor, linkFor } from "@/lib/server/links";

const Body = z.object({ action: z.enum(["link", "remove", "restore", "make_admin"]) });

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
      return Response.json({ link, emailed, via: mailProvider() });
    }
    if (action === "make_admin") {
      // only to someone who can actually get in: not removed, and signed in at least once
      const { data: { user } } = await db.auth.admin.getUserById(id);
      if (!user) throw new HttpError(404, "Member not found.");
      if (user.banned_until && new Date(user.banned_until) > new Date()) throw new HttpError(400, `${person.name} is removed. Restore them first.`);
      if (!user.last_sign_in_at) throw new HttpError(400, `${person.name} hasn't signed in yet. Hand over admin once they have, so the app is never left without an admin who can get in.`);
      // the new admin first, then step down: there is never a moment without one
      const { error: upErr } = await db.from("profiles").update({ is_admin: true }).eq("id", id);
      if (upErr) throw new HttpError(400, upErr.message);
      const { error: downErr } = await db.from("profiles").update({ is_admin: false }).eq("id", me.id);
      if (downErr) throw new HttpError(400, downErr.message);
      return Response.json({ ok: true });
    }
    const { error } = await db.auth.admin.updateUserById(id, { ban_duration: action === "remove" ? "876000h" : "none" });
    if (error) throw new HttpError(400, error.message);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: "Invalid request" }, { status: 400 });
    return errorResponse(err);
  }
}
