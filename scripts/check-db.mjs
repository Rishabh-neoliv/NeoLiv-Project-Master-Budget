// Checks the Supabase connection and that the schema (supabase/migrations/0001_init.sql) has been run.
//   node --env-file=.env.local scripts/check-db.mjs
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
let ok = true;
for (const t of ["profiles", "templates", "projects", "project_members", "versions", "activity", "email_log"]) {
  const { count, error } = await db.from(t).select("*", { count: "exact", head: true });
  // a missing table can come back as no error and no count on a HEAD request
  const missing = error || count === null;
  console.log(missing ? `MISSING ${t}${error ? ": " + error.message : ""}` : `ok      ${t} (${count} rows)`);
  if (missing) ok = false;
}
const { data: buckets, error } = await db.storage.listBuckets();
const names = (buckets ?? []).map((b) => b.name);
for (const b of ["templates", "versions"]) {
  const has = names.includes(b);
  console.log(has ? `ok      bucket ${b}` : `MISSING bucket ${b}${error ? ": " + error.message : ""}`);
  if (!has) ok = false;
}
const pub = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const { data: rows, error: pe } = await pub.from("projects").select("id").limit(1);
console.log(pe ? `publishable key: ${pe.message}` : `ok      publishable key works; signed-out read of projects returns ${rows.length} rows (should be 0)`);
process.exit(ok ? 0 : 1);
