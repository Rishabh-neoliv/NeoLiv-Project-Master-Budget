// Everyone onboarded into the app, with their sign-in status. Shown on Admin panel → Team members, and on the
// Members page that every member can open (to add people). Sign-in status lives in Supabase Auth, readable only
// with the secret key, so this runs on the server.
import "server-only";
import type { InviteProject } from "@/app/(admin)/admin/members/users-admin";
import type { Member } from "@/lib/members";
import { actsForAll, isStaff, kindOf, type Role } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/admin";

const latest = (...ts: (string | null | undefined)[]) => ts.filter((t): t is string => !!t).sort().at(-1) ?? null;

export async function listMembers(): Promise<Member[]> {
  const db = createAdminClient();
  const [{ data: people }, { data: auth }, { data: teams }] = await Promise.all([
    db.from("profiles").select("*").order("name"), // "*": department exists only after migration 0005
    db.auth.admin.listUsers({ perPage: 1000 }),
    db.from("project_members").select("user_id, project_id"),
  ]);
  const authById = new Map((auth?.users ?? []).map((u) => [u.id, u]));
  const projects = new Map<string, Set<string>>();
  for (const t of teams ?? []) projects.set(t.user_id, (projects.get(t.user_id) ?? new Set()).add(t.project_id));

  return (people ?? []).map((p) => {
    const a = authById.get(p.id);
    const removed = !!a?.banned_until && new Date(a.banned_until) > new Date();
    return {
      id: p.id, name: p.name, email: p.email, isAdmin: !!p.is_admin, isSubadmin: !p.is_admin && !!p.is_subadmin, regions: Array.isArray(p.regions) ? (p.regions as string[]) : [], department: (p.department as string | undefined) ?? "",
      status: removed ? "removed" : a?.last_sign_in_at ? "active" : "invited",
      lastSignIn: a?.last_sign_in_at ?? null,
      // the latest sign-up link sent to them (first invite or "New link"); links work once and expire after an hour
      linkSentAt: latest(a?.invited_at, a?.recovery_sent_at, a?.confirmation_sent_at),
      createdAt: a?.created_at ?? null,
      projects: projects.get(p.id)?.size ?? 0,
      // how they have signed in so far: "azure" once they've used their Microsoft account; "email" = password / links
      microsoft: ((a?.app_metadata?.providers as string[] | undefined) ?? []).includes("azure") || (a?.identities ?? []).some((i) => i.provider === "azure"),
    };
  });
}

/** The projects someone may put a new member on from the invite form: the ones they act for every department on
 *  (admins every project, sub-admins the Live projects of their region: lib/roles.ts actsForAll). */
export async function inviteProjects(me: { role: Role; regions: string[] }): Promise<InviteProject[]> {
  if (!isStaff(me.role)) return [];
  const { data } = await createAdminClient().from("projects").select("id, name, kind, region").order("name");
  return (data ?? []).map((p) => ({ id: p.id as string, name: p.name as string, kind: kindOf(p), region: p.region as string }))
    .filter((p) => actsForAll(me.role, p.kind, p.region, me.regions));
}
