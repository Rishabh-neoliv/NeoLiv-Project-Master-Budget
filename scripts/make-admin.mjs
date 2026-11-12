// Makes an existing person the admin. Add them first (Admin panel → Team members → invite), then:
//   node --env-file=.env.local scripts/make-admin.mjs someone@neoliv.in            adds them as an admin
//   node --env-file=.env.local scripts/make-admin.mjs someone@neoliv.in --only     ...and removes admin from everyone else
// The app has one admin; --only keeps it that way when the admin changes (e.g. from the dummy admin@neoliv.test).
// Only the secret key can do this: nobody can make themselves admin from the app.
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const must = (res, what) => { if (res.error) throw new Error(`${what}: ${res.error.message}`); return res.data; };

const email = (process.argv[2] || "").trim().toLowerCase();
const only = process.argv.includes("--only");
if (!email.includes("@")) throw new Error("Give the person's email: node --env-file=.env.local scripts/make-admin.mjs someone@neoliv.in [--only]");

const p = must(await db.from("profiles").select("id, name, email, is_admin").ilike("email", email).maybeSingle(), "profile");
if (!p) throw new Error(`${email} isn't in the app yet. Invite them from the Admin panel first.`);
const { data: { user } } = await db.auth.admin.getUserById(p.id);
if (user?.banned_until && new Date(user.banned_until) > new Date()) throw new Error(`${email} is removed from the app. Restore them first.`);

must(await db.from("profiles").update({ is_admin: true }).eq("id", p.id), "make admin");
console.log("admin:", p.email, p.name ? `(${p.name})` : "");
if (only) {
  const others = must(await db.from("profiles").update({ is_admin: false }).eq("is_admin", true).neq("id", p.id).select("email"), "remove other admins");
  console.log(others.length ? "no longer admin: " + others.map((o) => o.email).join(", ") : "no other admins");
}
