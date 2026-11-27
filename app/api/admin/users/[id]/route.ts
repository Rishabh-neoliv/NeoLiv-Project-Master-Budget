// For one member. Who may do what follows the role hierarchy (lib/roles.ts):
// POST /api/admin/users/:id  { action: "link" }             a fresh link to set their password (lost or expired invite).
//                                                            Admins get the link back for anyone; sub-admins for
//                                                            ordinary members. Otherwise it can only be emailed to
//                                                            someone who hasn't signed in yet (a link signs whoever
//                                                            opens it in as that person).
// Admins (anyone but themselves) and sub-admins (ordinary members only):
// POST /api/admin/users/:id  { action: "remove" }           they can no longer sign in (their history stays)
// POST /api/admin/users/:id  { action: "restore" }          they can sign in again
// Admins only:
// POST /api/admin/users/:id  { action: "make_admin" }       they become an admin too (there can be several)
// POST /api/admin/users/:id  { action: "remove_admin" }     they become an ordinary member (also on yourself); there
//                                                            is always at least one admin left
// POST /api/admin/users/:id  { action: "make_subadmin", region: "NCR" }  they become a sub-admin for that region (one
//                                                         region each, picked when made: user, 2026-11-26)
// POST /api/admin/users/:id  { action: "set_region", region: "MMR" }      move a sub-admin to another region
// POST /api/admin/users/:id  { action: "remove_subadmin" }  they become an ordinary member
import { z } from "zod";
import { errorResponse, HttpError, readJson, requireUser } from "@/lib/server/data";
import { sendInvite } from "@/lib/server/email";
import { mailProvider } from "@/lib/server/mailer";
import { appUrlFor, linkFor } from "@/lib/server/links";
import { REGIONS, roleOf } from "@/lib/roles";

const Body = z.object({ action: z.enum(["link", "remove", "restore", "make_admin", "remove_admin", "make_subadmin", "remove_subadmin", "set_region"]), region: z.enum(REGIONS).optional() });

export async function POST(req: Request, ctx: RouteContext<"/api/admin/users/[id]">) {
  try {
    const { id } = await ctx.params;
    const { db, me } = await requireUser();
    const { action, region } = Body.parse(await readJson(req));
    if (id === me.id && action !== "remove_admin") throw new HttpError(400, "That's your own account.");
    const { data: person } = await db.from("profiles").select("*").eq("id", id).single();
    if (!person) throw new HttpError(404, "Member not found.");
    const theirs = roleOf(person);
    // a sub-admin manages ordinary members only; everything about admins and sub-admins stays with admins
    const manages = me.role === "admin" || (me.role === "subadmin" && theirs === "member");
    if (["remove", "restore"].includes(action) && !manages)
      throw new HttpError(403, me.role === "subadmin" ? `${person.name} is ${theirs === "admin" ? "an admin" : "a sub-admin"}. Only an admin can do this.` : "Only an admin or sub-admin can do this.");
    if (["make_admin", "remove_admin", "make_subadmin", "remove_subadmin", "set_region"].includes(action) && me.role !== "admin") throw new HttpError(403, "Only an admin can do this.");
    const { data: { user } } = await db.auth.admin.getUserById(id);
    if (!user) throw new HttpError(404, "Member not found.");
    const removed = !!user.banned_until && new Date(user.banned_until) > new Date();

    if (action === "link") {
      // links are sent by admins and sub-admins only (user, 2026-11-27: ordinary members no longer invite people)
      if (me.role === "member") throw new HttpError(403, "Only an admin or sub-admin can send sign-up links.");
      if (removed) throw new HttpError(400, `${person.name} is removed. An admin can restore them.`);
      // everyone else can only have it emailed to the person themselves, and only before they've signed in
      if (!manages) {
        if (user.last_sign_in_at) throw new HttpError(403, `${person.name} has already signed in. If they've forgotten their password, they can use “Forgot password?” on the sign-in page.`);
        if (!mailProvider()) throw new HttpError(400, "Email isn't set up, so an admin has to send the link.");
      }
      // "recovery" works whether or not they used their first invite: it signs them in to set a password
      const { data, error } = await db.auth.admin.generateLink({ type: "recovery", email: person.email });
      if (error) throw new HttpError(400, error.message);
      const link = linkFor(appUrlFor(req), data.properties.hashed_token, "recovery");
      const emailed = await sendInvite({ to: person.email, name: person.name, from: me.name, link, again: true });
      if (!manages && !emailed) throw new HttpError(500, "The email couldn't be sent. Ask an admin to send the link.");
      return Response.json({ link: manages ? link : undefined, emailed, via: mailProvider() });
    }
    if (action === "make_admin" || action === "make_subadmin") {
      if (removed) throw new HttpError(400, `${person.name} is removed. Restore them first.`);
      if (action === "make_subadmin" && theirs === "admin") throw new HttpError(400, `${person.name} is an admin. Remove their admin role first.`);
      // one role at a time: an admin isn't also flagged sub-admin
      if (action === "make_subadmin" && !region) throw new HttpError(400, "Pick the region they'll handle.");
      const { error } = await db.from("profiles").update(action === "make_admin" ? { is_admin: true, is_subadmin: false, regions: [] } : { is_subadmin: true, regions: [region] }).eq("id", id);
      if (error) throw new HttpError(400, error.message);
      return Response.json({ ok: true });
    }
    if (action === "set_region") {
      if (theirs !== "subadmin") throw new HttpError(400, `${person.name} isn't a sub-admin.`);
      if (!region) throw new HttpError(400, "Pick a region.");
      const { error } = await db.from("profiles").update({ regions: [region] }).eq("id", id);
      if (error) throw new HttpError(400, error.message.includes("regions") ? "Run supabase/migrations/0007_subadmin_regions.sql in Supabase first." : error.message);
      return Response.json({ ok: true });
    }
    if (action === "remove_subadmin") {
      if (theirs !== "subadmin") throw new HttpError(400, `${person.name} isn't a sub-admin.`);
      const { error } = await db.from("profiles").update({ is_subadmin: false }).eq("id", id);
      if (error) throw new HttpError(400, error.message);
      await db.from("profiles").update({ regions: [] }).eq("id", id); // a later sub-admin role starts with none
      return Response.json({ ok: true });
    }
    if (action === "remove_admin") {
      if (theirs !== "admin") throw new HttpError(400, `${person.name} isn't an admin.`);
      const { count } = await db.from("profiles").select("id", { count: "exact", head: true }).eq("is_admin", true).neq("id", id);
      if (!count) throw new HttpError(400, "There has to be at least one admin. Make someone else admin first.");
      const { error } = await db.from("profiles").update({ is_admin: false }).eq("id", id);
      if (error) throw new HttpError(400, error.message);
      return Response.json({ ok: true });
    }
    if (action === "remove" && theirs === "admin") throw new HttpError(400, `${person.name} is an admin. Remove their admin role first.`);
    const { error } = await db.auth.admin.updateUserById(id, { ban_duration: action === "remove" ? "876000h" : "none" });
    if (error) throw new HttpError(400, error.message);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: "Invalid request" }, { status: 400 });
    return errorResponse(err);
  }
}
