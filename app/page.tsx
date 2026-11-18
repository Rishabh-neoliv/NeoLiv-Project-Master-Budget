// Home: everyone lands on My overview (what's waiting for them, their projects, recent changes). Admins and
// sub-admins reach the Admin panel from the top bar.
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function Route() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");
  redirect("/overview");
  return null;
}

export default function Home() {
  return <Suspense><Route /></Suspense>;
}
