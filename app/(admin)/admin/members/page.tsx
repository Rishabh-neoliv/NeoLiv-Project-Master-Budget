// Admin panel → Team members: onboard people, send sign-up links, remove or restore access, make or remove admins
// and sub-admins. Sub-admins come here too, with the buttons for ordinary members only (lib/roles.ts).
import { staffOrRedirect } from "@/lib/server/admin-guard";
import { inviteProjects, listMembers } from "@/lib/server/members";
import { authSettings, microsoftReady } from "@/lib/server/setup-status";
import { UsersAdmin } from "./users-admin";

export default async function MembersPage() {
  const me = await staffOrRedirect();
  const [members, settings, projects] = await Promise.all([listMembers(), authSettings(), inviteProjects(me)]);

  return (
    <div className="grid max-w-[1400px] gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Team members</h1>
        <p className="text-soft">Onboard people here: only admins and sub-admins invite people. Who works on which project, and in which department, is set on each project&apos;s Team tab.{me.role === "admin" ? " There can be several admins and sub-admins." : " As sub-admin you can send sign-up links to, remove and restore ordinary members; admins and sub-admins are managed by an admin."}</p>
      </div>
      <UsersAdmin members={members} microsoft={microsoftReady(settings)} meId={me.id} role={me.role} projects={projects} />
    </div>
  );
}
