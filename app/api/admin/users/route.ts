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

    const { data, error } = await db.auth.admin.generateLink({ type: "invite", email: body.email, options: { data: { name: body.name } } });
    if (error) throw new HttpError(400, error.message);
    await db.from("profiles").upsert({ id: data.user.id, name: body.name, email: body.email, is_admin: false });

    const link = linkFor(appUrlFor(req), data.properties.hashed_token, "invite");
    const emailed = await sendInvite({ to: body.email, name: body.name, from: me.name, link });
    return Response.json({ id: data.user.id, link, emailed });
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
