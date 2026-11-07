// Home: the admin lands on the Admin panel, everyone else on their projects.
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function Route() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub as string | undefined;
  if (!uid) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("is_admin").eq("id", uid).single();
  redirect(me?.is_admin ? "/admin" : "/projects");
  return null;
}

export default function Home() {
  return <Suspense><Route /></Suspense>;
}
