// Admin panel → Live projects (admins and sub-admins). Live projects are never deleted.
import { staffOrRedirect } from "@/lib/server/admin-guard";
import { ProjectsList } from "../projects-list";

export default async function LiveProjects() {
  const me = await staffOrRedirect();
  const mine = me.role === "admin" ? undefined : me.regions;
  return <ProjectsList kind="live" title="Live projects" canDelete={false} regions={mine}
    intro={mine
      ? `The real projects of your region (${mine.join(", ") || "none yet: ask an admin to give you a region"}). Click a row to open one; as sub-admin you can edit it, take any step and change its team. Live projects can't be deleted.`
      : "The real projects. Click a row to open one; as admin you can edit it, take any step and change its team. Each project is seen only by its team, admins and the sub-admins of its region. Live projects can't be deleted."} />;
}
