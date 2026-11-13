// Members: everyone in the app, and a form any member can use to add someone (they get an email with a link to
// set their password). Removing people and making admins stay in the Admin panel.
import { redirect } from "next/navigation";
import { UsersAdmin } from "@/app/(admin)/admin/members/users-admin";
import { listMembers } from "@/lib/server/members";
import { authSettings, microsoftReady } from "@/lib/server/setup-status";
import { createClient } from "@/lib/supabase/server";

export default async function MembersPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub as string | undefined;
  if (!uid) redirect("/login");
  const [{ data: me }, members, settings] = await Promise.all([
    supabase.from("profiles").select("is_admin").eq("id", uid).single(),
    listMembers(),
    authSettings(),
  ]);

  return (
    <div className="grid max-w-5xl gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Members</h1>
        <p className="text-soft">Everyone who can sign in to the app. Add a colleague here: they get an email with a link to set their password. Who works on which project is set on each project&apos;s Team tab.</p>
      </div>
      <UsersAdmin members={members} microsoft={microsoftReady(settings)} meId={uid} isAdmin={!!me?.is_admin} />
    </div>
  );
}
