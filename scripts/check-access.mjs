// Checks the access rules against Supabase:
//   * a project is visible to its team (and the admin), and to nobody else
//   * nobody can write from the browser: every change goes through the app's API
//   * the master templates (real rates) can't be read from the browser
//   node --env-file=.env.local scripts/check-access.mjs
// Creates two temporary members and one project, and deletes them again.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, pub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, pw = process.env.SEED_PASSWORD;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const signIn = async (email) => {
  const c = createClient(url, pub, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: pw });
  if (error) throw new Error(`${email}: ${error.message}`);
  return c;
};
let failed = 0;
const check = (label, ok) => { console.log(`${ok ? "ok  " : "FAIL"} ${label}`); if (!ok) failed++; };

const stamp = Date.now();
const made = [];
const member = async (tag) => {
  const email = `access-check-${tag}-${stamp}@neoliv.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { name: `Access check ${tag}` } });
  if (error) throw error;
  made.push(data.user.id);
  return { id: data.user.id, email };
};
let projectId = null;
try {
  const onTeam = await member("team"), outsider = await member("outsider");
  const { data: tpl } = await admin.from("templates").select("stamp").eq("is_current", true).single();
  const { data: p } = await admin.from("projects").insert({ name: "Access check " + stamp, region: "NCR", template: tpl.stamp }).select("id").single();
  projectId = p.id;
  await admin.from("project_members").insert({ project_id: p.id, user_id: onTeam.id, dept: "BD" });

  const t = await signIn(onTeam.email), o = await signIn(outsider.email), a = await signIn("admin@neoliv.test");
  check("team member sees the project", ((await t.from("projects").select("id").eq("id", p.id)).data ?? []).length === 1);
  check("someone not on the team does not", ((await o.from("projects").select("id").eq("id", p.id)).data ?? []).length === 0);
  check("not on the team: no team list either", ((await o.from("project_members").select("user_id").eq("project_id", p.id)).data ?? []).length === 0);
  check("the admin sees it (for reference)", ((await a.from("projects").select("id").eq("id", p.id)).data ?? []).length === 1);
  const signedOut = createClient(url, pub, { auth: { persistSession: false } });
  check("signed out sees no projects", ((await signedOut.from("projects").select("id")).data ?? []).length === 0);
  await t.from("projects").update({ status: "APPROVED" }).eq("id", p.id);
  check("team member can't change status directly", (await admin.from("projects").select("status").eq("id", p.id).single()).data.status === "DRAFT");
  check("team member can't write a frozen version directly", !!(await t.from("versions").insert({ project_id: p.id, rev: 0, inputs: {}, master: [], calc: {}, dept: "BD" })).error);
  await t.from("project_members").insert({ project_id: p.id, user_id: outsider.id, dept: "Design" });
  check("team member can't change the team directly", ((await admin.from("project_members").select("user_id").eq("project_id", p.id)).data ?? []).length === 1);
  await o.from("profiles").update({ is_admin: true }).eq("id", outsider.id);
  check("nobody can make themselves admin", (await admin.from("profiles").select("is_admin").eq("id", outsider.id).single()).data.is_admin === false);
  check("templates bucket isn't readable from the browser", ((await t.storage.from("templates").list()).data ?? []).length === 0);
} finally {
  if (projectId) await admin.from("projects").delete().eq("id", projectId);
  for (const id of made) await admin.auth.admin.deleteUser(id);
}
console.log(failed ? `${failed} check(s) failed` : "all access checks passed");
process.exit(failed ? 1 : 0);
