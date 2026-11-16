// My profile: your name (editable), your username (email), how you sign in, your password, and the projects
// you're on with your role in each.
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dn, revLabel, STATUS, type Status } from "@/lib/workflow";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ data: me }, { data: mine }] = await Promise.all([
    // "*": the department column exists only after migration 0005
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("project_members").select("dept, projects(id, name, status, last_rev, location)").eq("user_id", user.id),
  ]);
  const microsoft = (user.identities ?? []).some((i) => i.provider === "azure");

  // one line per project, with every department this person has on it
  const byProject = new Map<string, { id: string; name: string; status: Status; last_rev: number | null; location: string | null; depts: string[] }>();
  for (const m of mine ?? []) {
    const p = (Array.isArray(m.projects) ? m.projects[0] : m.projects) as { id: string; name: string; status: Status; last_rev: number | null; location: string | null } | null;
    if (!p) continue;
    const row = byProject.get(p.id) ?? { ...p, depts: [] };
    row.depts.push(dn(m.dept as string));
    byProject.set(p.id, row);
  }
  const projects = [...byProject.values()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="grid max-w-3xl gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">My profile</h1>
        <p className="text-soft">Your details in NeoLiv Master Budget.{me?.is_admin ? " You are an admin." : ""}</p>
      </div>
      <ProfileForm name={me?.name ?? ""} department={(me?.department as string | undefined) ?? ""} email={me?.email ?? user.email ?? ""} microsoft={microsoft} />
      <section className="grid gap-3 rounded-xl border border-line bg-sheet p-5">
        <h2 className="text-lg font-semibold">My projects</h2>
        {projects.length ? (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-sm">
              <thead className="bg-well text-left text-xs uppercase tracking-wide text-soft"><tr><th className="px-3 py-2">Project</th><th className="px-3 py-2">My role</th><th className="px-3 py-2">Where it stands</th></tr></thead>
              <tbody>{projects.map((p) => (
                <tr key={p.id} className="border-t border-line">
                  <td className="px-3 py-2"><Link href={`/projects/${p.id}`} className="font-medium text-brand hover:underline">{p.name}</Link><div className="text-xs text-soft">{p.location} rates</div></td>
                  <td className="px-3 py-2">{p.depts.join(" + ")}</td>
                  <td className="px-3 py-2 text-soft">{revLabel(p.status, p.last_rev)} · {STATUS[p.status][0]}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="text-soft">You aren&apos;t on any project&apos;s team yet. You can still view every project.</p>}
      </section>
    </div>
  );
}
