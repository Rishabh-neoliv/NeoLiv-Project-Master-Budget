// Checks the access rules against Supabase (migration 0006, lib/roles.ts):
//   * a Live project is seen by its team, admins and the sub-admins of its region (migration 0007); a Test project
//     only by its team and admins;
//     members never see projects they're not on; signed-out visitors see nothing
//   * nobody can write from the browser (every change goes through the app's API), nor make themselves admin or
//     sub-admin
//   * the master templates (real rates) can't be read from the browser, and new sign-ups are off
//   node --env-file=.env.local scripts/check-access.mjs
// Creates throwaway accounts (Rishabh's address with a +tag, random password; no email is sent), one Live and one
// Test project, and deletes them all again.
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, pub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const pw = randomBytes(18).toString("base64url") + "Aa1";
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const signIn = async (email) => {
  const c = createClient(url, pub, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: pw });
  if (error) throw new Error(`${email}: ${error.message}`);
  return c;
};
let failed = 0, total = 0;
const check = (label, ok) => { total++; console.log(`${ok ? "ok  " : "FAIL"} ${label}`); if (!ok) failed++; };
const sees = async (c, table, col, id) => ((await c.from(table).select(col).eq(col, id)).data ?? []).length > 0;

const stamp = Date.now().toString(36);
const made = [], projects = [];
const person = async (tag, flags = {}) => {
  const email = `rishabh.soni.ext+access-${tag}-${stamp}@neoliv.in`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { name: `Access check ${tag}` } });
  if (error) throw error;
  made.push(data.user.id);
  if (Object.keys(flags).length) await admin.from("profiles").update(flags).eq("id", data.user.id);
  return { id: data.user.id, email };
};
const project = async (kind, teamId, region = "NCR") => {
  const { data: tpl } = await admin.from("templates").select("stamp").eq("is_current", true).single();
  const { data: p, error } = await admin.from("projects").insert({ name: `Access check ${kind} ${region} ${stamp}`, region, template: tpl.stamp, kind }).select("id").single();
  if (error) throw new Error(`${error.message} (has migration 0006 been run?)`);
  projects.push(p.id);
  await admin.from("project_members").insert({ project_id: p.id, user_id: teamId, dept: "BD" });
  await admin.from("activity").insert({ project_id: p.id, by: teamId, dept: "BD", action: "access check" });
  return p.id;
};
try {
  const onTeam = await person("team"), outsider = await person("outsider");
  const sub = await person("subadmin", { is_subadmin: true, regions: ["NCR"] }), boss = await person("admin", { is_admin: true });
  const live = await project("live", onTeam.id), test = await project("test", onTeam.id), mmr = await project("live", onTeam.id, "MMR");
  const t = await signIn(onTeam.email), o = await signIn(outsider.email), s = await signIn(sub.email), a = await signIn(boss.email);

  check("Live: its team member sees it", await sees(t, "projects", "id", live));
  check("Live: a member not on the team can't see it", !(await sees(o, "projects", "id", live)));
  check("Live: ...nor its team list", !(await sees(o, "project_members", "project_id", live)));
  check("Live: ...nor its history", !(await sees(o, "activity", "project_id", live)));
  check("Live: a sub-admin of its region (not on the team) sees it", await sees(s, "projects", "id", live));
  check("Live: ...and its team list", await sees(s, "project_members", "project_id", live));
  check("Live: an admin sees it", await sees(a, "projects", "id", live));
  check("Live MMR: a sub-admin for NCR only can't see it", !(await sees(s, "projects", "id", mmr)));
  check("Live MMR: …nor its history", !(await sees(s, "activity", "project_id", mmr)));
  check("Test: its team member sees it", await sees(t, "projects", "id", test));
  check("Test: a sub-admin not on the team can't see it", !(await sees(s, "projects", "id", test)));
  check("Test: ...nor its history", !(await sees(s, "activity", "project_id", test)));
  check("Test: a member not on the team can't see it", !(await sees(o, "projects", "id", test)));
  check("Test: an admin sees it", await sees(a, "projects", "id", test));
  const signedOut = createClient(url, pub, { auth: { persistSession: false } });
  check("signed out sees no projects", ((await signedOut.from("projects").select("id")).data ?? []).length === 0);

  await t.from("projects").update({ status: "APPROVED" }).eq("id", live);
  check("team member can't change status directly", (await admin.from("projects").select("status").eq("id", live).single()).data.status === "DRAFT");
  check("team member can't write a frozen version directly", !!(await t.from("versions").insert({ project_id: live, rev: 0, inputs: {}, master: [], calc: {}, dept: "BD" })).error);
  await t.from("project_members").insert({ project_id: live, user_id: outsider.id, dept: "Design" });
  check("team member can't change the team directly", ((await admin.from("project_members").select("user_id").eq("project_id", live)).data ?? []).length === 1);
  await t.from("projects").update({ kind: "test" }).eq("id", live);
  check("nobody can turn a Live project into Test directly", (await admin.from("projects").select("kind").eq("id", live).single()).data.kind === "live");
  await s.from("projects").delete().eq("id", live);
  check("a sub-admin can't delete a project directly", await sees(admin, "projects", "id", live));
  await o.from("profiles").update({ is_admin: true, is_subadmin: true }).eq("id", outsider.id);
  const self = (await admin.from("profiles").select("is_admin, is_subadmin").eq("id", outsider.id).single()).data;
  check("nobody can make themselves admin", self.is_admin === false);
  check("nobody can make themselves sub-admin", self.is_subadmin === false);
  await s.from("profiles").update({ is_admin: true }).eq("id", sub.id);
  await s.from("profiles").update({ regions: ["NCR", "MMR", "Alibaug", "Nagpur"] }).eq("id", sub.id);
  check("a sub-admin can't give themselves more regions", JSON.stringify((await admin.from("profiles").select("regions").eq("id", sub.id).single()).data.regions) === '["NCR"]');
  check("a sub-admin can't make themselves admin", (await admin.from("profiles").select("is_admin").eq("id", sub.id).single()).data.is_admin === false);
  check("templates bucket isn't readable from the browser", ((await s.storage.from("templates").list()).data ?? []).length === 0);
  // the publishable key is public, so open sign-up would let anyone make an account (and see master rates
  // through a project of their own): Supabase → Authentication → Sign In / Providers → "Allow new users to sign up" off
  const settings = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: pub } }).then((r) => r.json());
  check("new sign-ups are switched off in Supabase", settings.disable_signup === true);
} finally {
  for (const id of projects) await admin.from("projects").delete().eq("id", id);
  for (const id of made) await admin.auth.admin.deleteUser(id);
}
console.log(failed ? `${failed} of ${total} check(s) failed` : `all ${total} access checks passed`);
process.exit(failed ? 1 : 0);
