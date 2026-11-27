// /members: the people list now lives in Administration → Team members, for admins and sub-admins only (user,
// 2026-11-27: ordinary members no longer see the list or invite people). Old links and bookmarks land in the right
// place: admins and sub-admins on Team members, everyone else on My overview.
import { redirect } from "next/navigation";
import { isStaff, roleOf } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export default async function MembersPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub as string | undefined;
  if (!uid) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("*").eq("id", uid).single();
  redirect(isStaff(roleOf(me)) ? "/admin/members" : "/overview");
}
