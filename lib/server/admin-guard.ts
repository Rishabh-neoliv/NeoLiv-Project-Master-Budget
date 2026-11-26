// For Admin panel pages: who may open them (lib/roles.ts). Anyone else goes back to their overview.
//   staffOrRedirect  admins and sub-admins (Overview, Team members, Live projects)
//   adminOrRedirect  admins only (Test projects, Master templates)
import "server-only";
import { redirect } from "next/navigation";
import { isStaff, regionsOf, roleOf, type Role } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export interface PanelUser { id: string; name: string; email: string; role: Role; regions: string[] }

async function me(): Promise<PanelUser> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub as string | undefined;
  if (!uid) redirect("/login");
  // "*": is_subadmin exists only after migration 0006
  const { data: p } = await supabase.from("profiles").select("*").eq("id", uid).single();
  return { id: uid, name: p?.name ?? "", email: p?.email ?? "", role: roleOf(p), regions: regionsOf(p) };
}

export async function staffOrRedirect() {
  const m = await me();
  if (!isStaff(m.role)) redirect("/overview");
  return m;
}

export async function adminOrRedirect() {
  const m = await me();
  if (m.role !== "admin") redirect(m.role === "subadmin" ? "/admin" : "/overview");
  return m;
}
