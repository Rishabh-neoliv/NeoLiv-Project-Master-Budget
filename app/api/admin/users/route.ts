// Admin only: onboarding people into the app. Which projects they work on, and in which department,
// is set on each project by its Base Line team, not here.
//
// POST  /api/admin/users  { name, email }   adds a member and returns their sign-up link
//                                            (also emailed to them when email is set up)
// PATCH /api/admin/users  { id, name }      renames a member
import { z } from "zod";
import { requireAdmin } from "@/lib/server/admin";
import { errorResponse, HttpError } from "@/lib/server/data";
import { sendInvite } from "@/lib/server/email";
import { appUrlFor, linkFor } from "@/lib/server/links";
import { mailProvider } from "@/lib/server/mailer";
import { authSettings, microsoftReady } from "@/lib/server/setup-status";

const Invite = z.object({
  name: z.string().trim().min(1, "Enter their name.").max(80),
  email: z.email("Enter a valid email address.").transform((s) => s.trim().toLowerCase()),
});

export async function POST(req: Request) {
  try {
    const { db, me } = await requireAdmin();
    const body = Invite.parse(await req.json());
    const { data: existing } = await db.from("profiles").select("id").eq("email", body.email).maybeSingle();
    if (existing) throw new HttpError(409, `${body.email} is already a member. Use “New link” on their row to send another sign-up link.`);

    // With Microsoft sign-in on, the account is created with its (company) email already confirmed, so their
    // NeoLiv Microsoft account joins it on first sign-in; the link is only a fallback to set a password.
    // Otherwise it's a normal invite: they confirm by opening the link and setting a password.
    const microsoft = microsoftReady(await authSettings());
    let userId: string, link: string;
    if (microsoft) {
      const { data: made, error } = await db.auth.admin.createUser({ email: body.email, email_confirm: true, user_metadata: { name: body.name } });
      if (error) throw new HttpError(400, error.message);
      userId = made.user.id;
      const { data, error: linkErr } = await db.auth.admin.generateLink({ type: "recovery", email: body.email });
      if (linkErr) throw new HttpError(400, linkErr.message);
      link = linkFor(appUrlFor(req), data.properties.hashed_token, "recovery");
    } else {
      const { data, error } = await db.auth.admin.generateLink({ type: "invite", email: body.email, options: { data: { name: body.name } } });
      if (error) throw new HttpError(400, error.message);
      userId = data.user.id;
      link = linkFor(appUrlFor(req), data.properties.hashed_token, "invite");
    }
    await db.from("profiles").upsert({ id: userId, name: body.name, email: body.email, is_admin: false });

    const emailed = await sendInvite({ to: body.email, name: body.name, from: me.name, link, microsoft, appUrl: appUrlFor(req) });
    return Response.json({ id: userId, link, emailed, via: mailProvider(), microsoft });
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: err.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    return errorResponse(err);
  }
}

const Rename = z.object({ id: z.uuid(), name: z.string().trim().min(1).max(80) });

export async function PATCH(req: Request) {
  try {
    const { db } = await requireAdmin();
    const { id, name } = Rename.parse(await req.json());
    const { error } = await db.from("profiles").update({ name }).eq("id", id);
    if (error) throw new HttpError(400, error.message);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: err.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    return errorResponse(err);
  }
}
