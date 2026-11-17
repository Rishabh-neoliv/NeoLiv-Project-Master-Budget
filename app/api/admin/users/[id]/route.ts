// For one member.
// POST /api/admin/users/:id  { action: "link" }          a fresh link to set their password (lost or expired invite).
//                                                         Admins get the link back; any other member can only have it
//                                                         emailed to someone who hasn't signed in yet.
// Admins only:
// POST /api/admin/users/:id  { action: "remove" }        they can no longer sign in (their history stays)
// POST /api/admin/users/:id  { action: "restore" }       they can sign in again
// POST /api/admin/users/:id  { action: "make_admin" }    they become an admin too (there can be several)
// POST /api/admin/users/:id  { action: "remove_admin" }  they stay a member, without the Admin panel (also on
//                                                         yourself); there is always at least one admin left
import { z } from "zod";
import { errorResponse, HttpError, readJson, requireUser } from "@/lib/server/data";
import { sendInvite } from "@/lib/server/email";
import { mailProvider } from "@/lib/server/mailer";
import { appUrlFor, linkFor } from "@/lib/server/links";

const Body = z.object({ action: z.enum(["link", "remove", "restore", "make_admin", "remove_admin"]) });

export async function POST(req: Request, ctx: RouteContext<"/api/admin/users/[id]">) {
  try {
    const { id } = await ctx.params;
    const { db, me } = await requireUser();
    const { action } = Body.parse(await readJson(req));
    if (action !== "link" && !me.is_admin) throw new HttpError(403, "Only an admin can do this.");
    if (id === me.id && action !== "remove_admin") throw new HttpError(400, "That's your own account.");
    const { data: person } = await db.from("profiles").select("id, name, email, is_admin").eq("id", id).single();
    if (!person) throw new HttpError(404, "Member not found.");
    const { data: { user } } = await db.auth.admin.getUserById(id);
    if (!user) throw new HttpError(404, "Member not found.");
    const removed = !!user.banned_until && new Date(user.banned_until) > new Date();

    if (action === "link") {
      if (removed) throw new HttpError(400, `${person.name} is removed. An admin can restore them.`);
      // a link signs whoever opens it in as that person, so other members can only have it emailed to the person
      // themselves, and only before they've signed in (an invite that was lost or expired)
      if (!me.is_admin) {
        if (user.last_sign_in_at) throw new HttpError(403, `${person.name} has already signed in. If they've forgotten their password, they can use “Forgot password?” on the sign-in page.`);
        if (!mailProvider()) throw new HttpError(400, "Email isn't set up, so an admin has to send the link.");
      }
      // "recovery" works whether or not they used their first invite: it signs them in to set a password
      const { data, error } = await db.auth.admin.generateLink({ type: "recovery", email: person.email });
      if (error) throw new HttpError(400, error.message);
      const link = linkFor(appUrlFor(req), data.properties.hashed_token, "recovery");
      const emailed = await sendInvite({ to: person.email, name: person.name, from: me.name, link, again: true });
      if (!me.is_admin && !emailed) throw new HttpError(500, "The email couldn't be sent. Ask an admin to send the link.");
      return Response.json({ link: me.is_admin ? link : undefined, emailed, via: mailProvider() });
    }
    if (action === "make_admin") {
      if (removed) throw new HttpError(400, `${person.name} is removed. Restore them first.`);
      const { error } = await db.from("profiles").update({ is_admin: true }).eq("id", id);
      if (error) throw new HttpError(400, error.message);
      return Response.json({ ok: true });
    }
    if (action === "remove_admin") {
      if (!person.is_admin) throw new HttpError(400, `${person.name} isn't an admin.`);
      const { count } = await db.from("profiles").select("id", { count: "exact", head: true }).eq("is_admin", true).neq("id", id);
      if (!count) throw new HttpError(400, "There has to be at least one admin. Make someone else admin first.");
      const { error } = await db.from("profiles").update({ is_admin: false }).eq("id", id);
      if (error) throw new HttpError(400, error.message);
      return Response.json({ ok: true });
    }
    if (action === "remove" && person.is_admin) throw new HttpError(400, `${person.name} is an admin. Remove their admin role first.`);
    const { error } = await db.auth.admin.updateUserById(id, { ban_duration: action === "remove" ? "876000h" : "none" });
    if (error) throw new HttpError(400, error.message);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: "Invalid request" }, { status: 400 });
    return errorResponse(err);
  }
}
