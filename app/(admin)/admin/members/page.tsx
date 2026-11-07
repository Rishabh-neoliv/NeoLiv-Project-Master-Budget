// Admin panel → Team members: onboard people, send sign-up links, remove or restore access.
import { adminOrRedirect } from "@/lib/server/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { UsersAdmin, type Member } from "./users-admin";

export default async function MembersPage() {
  await adminOrRedirect();
  // sign-in status lives in Supabase Auth, readable only with the secret key (this page is admin-only)
  const db = createAdminClient();
  const [{ data: people }, { data: auth }, { data: teams }] = await Promise.all([
    db.from("profiles").select("id, name, email, is_admin").order("name"),
    db.auth.admin.listUsers({ perPage: 1000 }),
    db.from("project_members").select("user_id, project_id"),
  ]);
  const authById = new Map((auth?.users ?? []).map((u) => [u.id, u]));
  const projects = new Map<string, Set<string>>();
  for (const t of teams ?? []) projects.set(t.user_id, (projects.get(t.user_id) ?? new Set()).add(t.project_id));

  const members: Member[] = (people ?? []).map((p) => {
    const a = authById.get(p.id);
    const removed = !!a?.banned_until && new Date(a.banned_until) > new Date();
    return {
      id: p.id, name: p.name, email: p.email, isAdmin: p.is_admin,
      status: removed ? "removed" : a?.last_sign_in_at ? "active" : "invited",
      lastSignIn: a?.last_sign_in_at ?? null,
      projects: projects.get(p.id)?.size ?? 0,
    };
  });

  return (
    <div className="grid max-w-5xl gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Team members</h1>
        <p className="text-soft">Onboard people here. Who works on which project, and in which department, is set on each project&apos;s Team tab.</p>
      </div>
      <UsersAdmin members={members} />
    </div>
  );
}
