// For admin panel pages: the signed-in person must be the admin, otherwise back to the projects.
import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function adminOrRedirect() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub as string | undefined;
  if (!uid) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("id, name, email, is_admin").eq("id", uid).single();
  if (!me?.is_admin) redirect("/projects");
  return me as { id: string; name: string; email: string; is_admin: true };
}
