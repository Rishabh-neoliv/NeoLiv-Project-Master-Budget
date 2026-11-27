// Admin panel → Live projects → New (admins and sub-admins).
import { staffOrRedirect } from "@/lib/server/admin-guard";
import { activeMembers } from "@/lib/server/people";
import { REGIONS } from "@/lib/roles";
import { NewProjectForm } from "../../new-project-form";

export default async function NewLiveProject() {
  const me = await staffOrRedirect();
  // a sub-admin creates projects in their own regions only
  const regions = me.role === "admin" ? [...REGIONS] : REGIONS.filter((r) => me.regions.includes(r));
  return (
    <div className="grid max-w-3xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New Live project</h1>
        <p className="text-soft">A real project. Pick who works on it in each department; only that team, admins and the sub-admins of its region will see it. The region is fixed once it&apos;s created. It stays a Live project and can&apos;t be deleted.</p>
      </div>
      {regions.length ? <NewProjectForm people={await activeMembers()} kind="live" regions={regions} />
        : <p className="rounded-xl border border-line bg-sheet p-5 text-soft">You don&apos;t have a region yet, so you can&apos;t create projects. Ask an admin to give you one (Administration → Team members).</p>}
    </div>
  );
}
