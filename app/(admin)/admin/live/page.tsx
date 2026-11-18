// Admin panel → Live projects (admins and sub-admins). Live projects are never deleted.
import { staffOrRedirect } from "@/lib/server/admin-guard";
import { ProjectsList } from "../projects-list";

export default async function LiveProjects() {
  const me = await staffOrRedirect();
  return <ProjectsList kind="live" title="Live projects" canDelete={false}
    intro={`The real projects. Click a row to open one; as ${me.role === "admin" ? "admin" : "sub-admin"} you can edit it, take any step and change its team. Each project is seen only by its team, admins and sub-admins. Live projects can't be deleted.`} />;
}
