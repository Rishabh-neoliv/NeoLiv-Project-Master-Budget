// Admin panel → Test projects → New (admins only).
import { adminOrRedirect } from "@/lib/server/admin-guard";
import { activeMembers } from "@/lib/server/people";
import { REGIONS } from "@/lib/roles";
import { NewProjectForm } from "../../new-project-form";
import { PageHeader } from "@/components/page-header";

export default async function NewTestProject() {
  await adminOrRedirect();
  return (
    <div className="grid gap-6">
      <PageHeader title="New Test project" description="For trying things out. Only the people you put on its team (and admins) will see it. It stays a Test project, and can be deleted later." />
      <div className="grid max-w-3xl gap-6"><NewProjectForm people={await activeMembers()} kind="test" regions={[...REGIONS]} /></div>
    </div>
  );
}
