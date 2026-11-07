// One-time setup for the dummy version. Run after the schema (supabase/migrations/0001_init.sql) is in place:
//
//   node --env-file=.env.local scripts/setup.mjs                          templates + dummy users
//   node --env-file=.env.local scripts/setup.mjs "<old app folder>"       ... and import its NCR / MMR test projects
//
// Steps (each is safe to run again):
//   1. templates: every master workbook version from _legacy/bundle (extracted from the old app) goes into the
//      "templates" table and its .xlsx into the private "templates" bucket; the newest becomes current.
//   2. the admin login (admin@neoliv.test, password SEED_PASSWORD). The admin onboards everyone else.
//   3. projects (optional): project.json, versions and activity from the old OneDrive folder, without a team.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local first.");
const db = createClient(url, key, { auth: { persistSession: false } });
const root = path.resolve(import.meta.dirname, "..");
const must = (res, what) => { if (res.error) throw new Error(`${what}: ${res.error.message}`); return res.data; };

// ------------------------------------------------------------------ 1. templates
const bundle = path.join(root, "_legacy", "bundle");
const index = JSON.parse(fs.readFileSync(path.join(bundle, "templates.json"), "utf8"));
for (const [stamp, t] of Object.entries(index.versions)) {
  const model = JSON.parse(fs.readFileSync(path.join(bundle, t.model), "utf8"));
  const xlsxPath = `${stamp}.xlsx`;
  const file = fs.readFileSync(path.join(bundle, t.xlsx.replace(/\.b64\.txt$/, "")));
  must(await db.storage.from("templates").upload(xlsxPath, file, { upsert: true, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `upload ${stamp}`);
  must(await db.from("templates").upsert({ stamp, modified: t.modified, model, xlsx_path: xlsxPath, is_current: false }), `template ${stamp}`);
  console.log("template", stamp);
}
must(await db.from("templates").update({ is_current: false }).neq("stamp", index.current), "reset current");
must(await db.from("templates").update({ is_current: true }).eq("stamp", index.current), "set current");
console.log("current template:", index.current);

// ------------------------------------------------------------------ 2. dummy users
const password = process.env.SEED_PASSWORD;
if (!password || password.length < 8) throw new Error("Set SEED_PASSWORD (8+ characters) in .env.local for the dummy users.");
// one admin, who onboards everyone else from the app's Team members page (no role logins)
const USERS = [
  { email: "admin@neoliv.test", name: "Admin (dummy)", dept: null, admin: true },
];
const existing = must(await db.auth.admin.listUsers({ perPage: 1000 }), "list users").users;
const byDept = {};
for (const u of USERS) {
  let user = existing.find((x) => x.email === u.email);
  if (!user) user = must(await db.auth.admin.createUser({ email: u.email, password, email_confirm: true, user_metadata: { name: u.name } }), `create ${u.email}`).user;
  must(await db.from("profiles").upsert({ id: user.id, name: u.name, email: u.email, is_admin: !!u.admin }), `profile ${u.email}`);
  if (u.dept) byDept[u.dept] = user.id;
  console.log("user", u.email);
}

// ------------------------------------------------------------------ 3. old test projects (optional)
const old = process.argv[2];
if (old) {
  const known = new Set(Object.keys(index.versions));
  for (const region of ["NCR", "MMR"]) {
    const dir = path.join(old, region);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const pdir = path.join(dir, name), pj = path.join(pdir, "project.json");
      if (!fs.existsSync(pj)) continue;
      const p = JSON.parse(fs.readFileSync(pj, "utf8"));
      if (!known.has(p.template)) { console.log("skip", name, "(template", p.template, "not in the bundle)"); continue; }
      const who = () => null; // the old app's people aren't members here

      const { data: dupe } = await db.from("projects").select("id").ilike("name", p.name).maybeSingle();
      if (dupe) { console.log("exists", p.name); continue; }
      const project = must(await db.from("projects").insert({
        region, name: p.name, status: p.status, template: p.template, inputs: p.inputs || {}, rates: p.rates || {}, rates_template: p.ratesTemplate || p.template,
        last_rev: p.lastRev ?? null, revision_reason: p.revisionReason || "", grand_total: p.grandTotal ?? null, base_total: p.baseTotal ?? null,
        location: p.location ?? null, acre: p.acre ?? null, created_by: null, created_at: p.createdAt, updated_by: null, updated_at: p.updatedAt || p.createdAt,
      }).select("id").single(), `project ${p.name}`);
      // no team: the old app's people aren't members here. A Base Line member can be given the project later.

      for (const vdir of fs.readdirSync(pdir).filter((d) => /^R\d+/.test(d))) {
        const vf = path.join(pdir, vdir, "version.json");
        if (!fs.existsSync(vf)) continue;
        const v = JSON.parse(fs.readFileSync(vf, "utf8"));
        must(await db.from("versions").insert({
          project_id: project.id, rev: v.rev, inputs: v.inputs, rates: v.rates || {}, master: v.master, calc: v.calc || {}, grand_total: v.grandTotal ?? null,
          reason: v.reason || "", dept: v.dept || "", template: known.has(v.template) ? v.template : p.template, frozen_by: who(v.by, v.dept), frozen_at: v.at,
        }), `version R${v.rev}`);
      }
      const adir = path.join(pdir, "activity");
      const acts = fs.existsSync(adir) ? fs.readdirSync(adir).map((f) => JSON.parse(fs.readFileSync(path.join(adir, f), "utf8"))) : [];
      if (acts.length) must(await db.from("activity").insert(acts.map((a) => ({ project_id: project.id, at: a.at, by: who(a.by, a.dept), dept: a.dept || null, action: a.action, comment: a.comment || "", rev: a.rev ?? null }))), "activity");
      console.log("project", region, p.name, `(${p.status})`);
    }
  }
  console.log("Frozen versions were imported without Excel files. Open a version in the app to see it; new freezes make their Excel.");
}
console.log("done");
