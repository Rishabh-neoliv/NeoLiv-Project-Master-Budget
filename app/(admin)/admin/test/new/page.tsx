// Admin panel → Test projects → New (admins only).
import { adminOrRedirect } from "@/lib/server/admin-guard";
import { activeMembers } from "@/lib/server/people";
import { NewProjectForm } from "../../new-project-form";

export default async function NewTestProject() {
  await adminOrRedirect();
  return (
    <div className="grid max-w-3xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New Test project</h1>
        <p className="text-soft">For trying things out. Only the people you put on its team (and admins) will see it. It stays a Test project, and can be deleted later.</p>
      </div>
      <NewProjectForm people={await activeMembers()} kind="test" />
    </div>
  );
}
