// Admin panel → Team members: onboard people, send sign-up links, remove or restore access, make or remove admins.
import { adminOrRedirect } from "@/lib/server/admin-guard";
import { listMembers } from "@/lib/server/members";
import { authSettings, microsoftReady } from "@/lib/server/setup-status";
import { UsersAdmin } from "./users-admin";

export default async function MembersPage() {
  const me = await adminOrRedirect();
  const [members, settings] = await Promise.all([listMembers(), authSettings()]);

  return (
    <div className="grid max-w-5xl gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Team members</h1>
        <p className="text-soft">Onboard people here (every member can also add people from the Members page). Who works on which project, and in which department, is set on each project&apos;s Team tab. There can be several admins.</p>
      </div>
      <UsersAdmin members={members} microsoft={microsoftReady(settings)} meId={me.id} isAdmin />
    </div>
  );
}
