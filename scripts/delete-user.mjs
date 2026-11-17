// Deletes a person completely (login and profile). Use the admin page's "Remove" for real people instead:
// that keeps their name on the history. This is for test accounts.
//   node --env-file=.env.local scripts/delete-user.mjs someone@neoliv.test [other@neoliv.test ...]
// Their team places are dropped, and history they wrote (activity, frozen versions, created/updated by)
// is kept but no longer names them.
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const must = (res, what) => { if (res.error) throw new Error(`${what}: ${res.error.message}`); return res.data; };

const emails = process.argv.slice(2).map((e) => e.toLowerCase());
if (!emails.length) throw new Error("Give one or more emails.");
for (const email of emails) {
  const { data: p } = await db.from("profiles").select("id, is_admin").eq("email", email).maybeSingle();
  if (!p) { console.log("not found", email); continue; }
  if (p.is_admin) { console.log("skipped (the admin)", email); continue; }
  must(await db.from("activity").update({ by: null }).eq("by", p.id), "activity");
  must(await db.from("versions").update({ frozen_by: null }).eq("frozen_by", p.id), "versions");
  must(await db.from("projects").update({ created_by: null }).eq("created_by", p.id), "projects created_by");
  must(await db.from("projects").update({ updated_by: null }).eq("updated_by", p.id), "projects updated_by");
  must(await db.from("files").update({ uploaded_by: null }).eq("uploaded_by", p.id), "files uploaded_by");
  must(await db.from("project_members").delete().eq("user_id", p.id), "team places");
  must(await db.auth.admin.deleteUser(p.id), "login"); // the profile goes with it
  console.log("deleted", email);
}
