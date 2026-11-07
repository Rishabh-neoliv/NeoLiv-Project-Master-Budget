// The people who can be put on a project team: onboarded members who haven't been removed.
// The admin can be on teams too.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { HttpError } from "./data";

type Db = ReturnType<typeof createAdminClient>;

export async function activeMembers(db: Db = createAdminClient()) {
  const [{ data: people }, { data: auth }] = await Promise.all([
    db.from("profiles").select("id, name, email").order("name"),
    db.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const removed = new Set((auth?.users ?? []).filter((u) => u.banned_until && new Date(u.banned_until) > new Date()).map((u) => u.id));
  return (people ?? []).filter((p) => !removed.has(p.id)) as { id: string; name: string; email: string }[];
}

export async function assertActiveMembers(db: Db, ids: string[]) {
  const ok = new Set((await activeMembers(db)).map((p) => p.id));
  const bad = [...new Set(ids)].filter((id) => !ok.has(id));
  if (bad.length) throw new HttpError(400, "Only onboarded team members can be on a project team. Ask the admin to add them first.");
}
