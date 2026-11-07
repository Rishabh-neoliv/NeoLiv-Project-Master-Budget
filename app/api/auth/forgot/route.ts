// POST /api/auth/forgot { email }   "Forgot password": emails a one-time link to set a new password.
// Sent by the app (Microsoft 365 or Resend), so Supabase needs no email setup. The answer is the same whether or
// not the email belongs to a member, so it can't be used to find out who has an account.
import { z } from "zod";
import { mailProvider } from "@/lib/server/mailer";
import { sendPasswordReset } from "@/lib/server/email";
import { appUrlFor, linkFor } from "@/lib/server/links";
import { createAdminClient } from "@/lib/supabase/admin";

const recent = new Map<string, number>(); // one link a minute per address (per server instance)

export async function POST(req: Request) {
  const parsed = z.object({ email: z.email() }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  if (!mailProvider()) return Response.json({ emailed: false, message: "Email isn't set up yet. Ask the admin for a new sign-in link (Team members → New link)." });
  const email = parsed.data.email.trim().toLowerCase();
  const generic = { emailed: true, message: "If that email has an account, a link to set a new password is on its way. It expires after an hour." };

  const last = recent.get(email) ?? 0;
  if (Date.now() - last < 60_000) return Response.json(generic);
  recent.set(email, Date.now());

  const db = createAdminClient();
  const { data: person } = await db.from("profiles").select("id, name, email").eq("email", email).maybeSingle();
  if (!person) return Response.json(generic);
  const { data: u } = await db.auth.admin.getUserById(person.id);
  if (u?.user?.banned_until && new Date(u.user.banned_until) > new Date()) return Response.json(generic); // removed members get nothing
  const { data, error } = await db.auth.admin.generateLink({ type: "recovery", email });
  if (error || !data) return Response.json(generic);
  const r = await sendPasswordReset({ to: email, name: person.name, link: linkFor(appUrlFor(req), data.properties.hashed_token, "recovery") });
  if (!r.ok) console.error("password email to", email, "failed:", r.error);
  return Response.json(generic);
}
