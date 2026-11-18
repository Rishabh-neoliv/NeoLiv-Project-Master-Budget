// Admin panel → Live projects → New (admins and sub-admins).
import { staffOrRedirect } from "@/lib/server/admin-guard";
import { activeMembers } from "@/lib/server/people";
import { NewProjectForm } from "../../new-project-form";

export default async function NewLiveProject() {
  await staffOrRedirect();
  return (
    <div className="grid max-w-3xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New Live project</h1>
        <p className="text-soft">A real project. Pick who works on it in each department; only that team, admins and sub-admins will see it. It stays a Live project and can&apos;t be deleted.</p>
      </div>
      <NewProjectForm people={await activeMembers()} kind="live" />
    </div>
  );
}
