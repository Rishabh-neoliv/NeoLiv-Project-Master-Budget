import { activeMembers } from "@/lib/server/people";
import { createClient } from "@/lib/supabase/server";
import { NewProjectForm } from "./new-project-form";

export default async function NewProjectPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub as string;
  const { data: me } = await supabase.from("profiles").select("is_admin").eq("id", uid).single();
  return (
    <div className="grid max-w-3xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New project</h1>
        <p className="text-soft">{me?.is_admin ? "Pick who works on it in each department. As admin you can leave yourself off the team and still act on it." : "You start on Base Line. Pick who works on it in each department; only the team can see the project."}</p>
      </div>
      <NewProjectForm people={await activeMembers()} meId={uid} isAdmin={!!me?.is_admin} />
    </div>
  );
}
