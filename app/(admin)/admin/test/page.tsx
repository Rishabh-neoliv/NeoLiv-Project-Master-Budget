// Admin panel → Test projects (admins only). Test projects can be deleted; they stay Test for good.
import { adminOrRedirect } from "@/lib/server/admin-guard";
import { ProjectsList } from "../projects-list";

export default async function TestProjects() {
  await adminOrRedirect();
  return <ProjectsList kind="test" title="Test projects" canDelete
    intro="Projects for trying things out. Only the people on a test project's team (and admins) can see it; its emails go to that team as usual. A Test project stays a Test project, and can be deleted with everything in it." />;
}
