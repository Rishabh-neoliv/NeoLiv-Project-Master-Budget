// The sidebar on every signed-in page, app and admin alike (user, 2026-11-27): the app's name, the menu (My work, and
// Administration for admins and sub-admins: components/side-nav.tsx), the master template in use, and who you are →
// My profile, Sign out. On narrow screens it's a compact header. The session is read inside <Suspense>, once per page.
import { cache, Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Initials } from "@/components/initials";
import { SideNav } from "@/components/side-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { isStaff, ROLE_NAME, roleOf } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { APP_VERSION } from "@/lib/version";

const me = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub as string | undefined;
  if (!uid) redirect("/login");
  const [{ data: profile }, { data: tpl }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", uid).single(),
    supabase.from("templates").select("modified, stamp").eq("is_current", true).maybeSingle(),
  ]);
  return { profile, role: roleOf(profile), tpl };
});

async function Nav() {
  const { role } = await me();
  return <SideNav role={role} />;
}

async function Who() {
  const { profile, role, tpl } = await me();
  return (
    <div className="grid gap-3">
      {/* the template in use; the app version is for whoever supports the app, on hover */}
      <p className="hidden text-xs text-white/55 md:block" title={APP_VERSION}>Rates: master template of {tpl?.modified || tpl?.stamp || "–"}</p>
      <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-3 md:grid md:pt-4">
        <Link href="/profile" title="My profile" className="flex min-w-0 items-center gap-2.5 text-sm hover:underline">
          <Initials name={profile?.name || profile?.email || "?"} />
          <span className="min-w-0"><span className="block truncate font-medium text-white">{profile?.name}</span><span className="hidden truncate text-white/60 md:block">{profile?.email}</span>{isStaff(role) && <span className="hidden text-xs text-[#7fd9c6] md:block">{ROLE_NAME[role]}</span>}</span>
        </Link>
        <div className="[&_button]:text-white/80 [&_button:hover]:bg-white/10 [&_button:hover]:text-white"><SignOutButton /></div>
      </div>
    </div>
  );
}

export function SideBar() {
  return (
    <aside className="flex shrink-0 flex-col gap-3 bg-[#10302a] px-4 py-3 text-white md:sticky md:top-0 md:h-screen md:w-60 md:gap-6 md:overflow-y-auto md:py-5">
      <Link href="/overview" className="block">
        <span className="block text-xs font-semibold uppercase tracking-[0.2em] text-[#7fd9c6]">NeoLiv</span>
        <span className="block text-base font-semibold md:mt-1 md:text-lg">Master Budget</span>
      </Link>
      <Suspense><Nav /></Suspense>
      <div className="md:mt-auto"><Suspense><Who /></Suspense></div>
    </aside>
  );
}
