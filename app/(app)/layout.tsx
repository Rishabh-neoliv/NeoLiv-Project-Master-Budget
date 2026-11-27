// Signed-in pages: a sidebar like the Admin panel's (user, 2026-11-27): the app's name, the menu with icons (Admin
// panel for admins and sub-admins), the template in use, and who you are → My profile, Sign out. Search and the bell
// sit at the top of each page. On narrow screens the sidebar is a compact header. Everything that reads the session
// sits inside <Suspense>, so the page shell shows at once.
import { cache, Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/app-nav";
import { Initials } from "@/components/initials";
import { SignOutButton } from "@/components/sign-out-button";
import { TopTools } from "@/components/top-tools";
import { isStaff, ROLE_NAME, roleOf } from "@/lib/roles";
import { APP_VERSION } from "@/lib/version";
import { createClient } from "@/lib/supabase/server";

// read once per page load, though the menu and the user card both need it
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
  return <AppNav staff={isStaff(role)} />;
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

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col gap-3 bg-[#10302a] px-4 py-3 text-white md:sticky md:top-0 md:h-screen md:w-60 md:gap-6 md:py-5">
        <Link href="/overview" className="block">
          <span className="block text-xs font-semibold uppercase tracking-[0.2em] text-[#7fd9c6]">NeoLiv</span>
          <span className="block text-base font-semibold md:mt-1 md:text-lg">Master Budget</span>
        </Link>
        <Suspense><Nav /></Suspense>
        <div className="md:mt-auto"><Suspense><Who /></Suspense></div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-4 md:px-8 md:py-6">
        <div className="mx-auto w-full max-w-[1400px]">
          {/* search and the bell */}
          <div className="mb-4 flex justify-end md:mb-6"><TopTools /></div>
          <Suspense fallback={<p className="text-soft">Loading…</p>}>{children}</Suspense>
        </div>
      </main>
    </div>
  );
}
