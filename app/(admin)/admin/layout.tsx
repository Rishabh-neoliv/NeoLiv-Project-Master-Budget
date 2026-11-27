// The admin panel: its own look and navigation, separate from the team members' app. Admins and sub-admins come
// in; the menu shows each only their pages (components/admin-nav.tsx).
import { Suspense } from "react";
import Link from "next/link";
import { AdminNav } from "@/components/admin-nav";
import { Initials } from "@/components/initials";
import { SignOutButton } from "@/components/sign-out-button";
import { TopTools } from "@/components/top-tools";
import { ROLE_NAME } from "@/lib/roles";
import { staffOrRedirect } from "@/lib/server/admin-guard";
import { APP_VERSION } from "@/lib/version";

async function Nav() {
  const me = await staffOrRedirect();
  return <AdminNav role={me.role} />;
}

async function Who() {
  const me = await staffOrRedirect();
  return (
    // narrow screens: one line (initials, name, sign out); md+: the full card with email and role
    <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-3 md:grid md:pt-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <Initials name={me.name || me.email} />
        <Link href="/profile" title="My profile" className="min-w-0 text-sm hover:underline"><div className="truncate font-medium text-white">{me.name}</div><div className="hidden truncate text-white/60 md:block">{me.email}</div><div className="hidden text-xs text-[#7fd9c6] md:block">{ROLE_NAME[me.role]}</div></Link>
      </div>
      <div className="[&_button]:text-white/80 [&_button:hover]:bg-white/10 [&_button:hover]:text-white"><SignOutButton /></div>
    </div>
  );
}

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      {/* narrow screens: a compact header (title, menu in one row, small links); md+: the sidebar */}
      <aside className="flex shrink-0 flex-col gap-3 bg-[#10302a] px-4 py-3 text-white md:sticky md:top-0 md:h-screen md:w-64 md:gap-6 md:py-5">
        {/* the version is for whoever supports the app: on hover, not printed under the title */}
        <div title={APP_VERSION}>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7fd9c6]">Admin panel</div>
          <div className="text-base font-semibold md:mt-1 md:text-lg">NeoLiv Master Budget</div>
        </div>
        <Suspense><Nav /></Suspense>
        <Link href="/overview" className="w-fit rounded-lg text-xs text-white/85 hover:underline md:w-auto md:border md:border-white/15 md:px-3 md:py-2 md:text-sm md:hover:bg-white/10 md:hover:no-underline">Open the app as a team member →</Link>
        <div className="mt-auto"><Suspense><Who /></Suspense></div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-4 md:px-8 md:py-6">
        {/* search and the bell, as in the app's top bar */}
        <div className="mb-4 flex justify-end md:mb-6"><TopTools /></div>
        <Suspense fallback={<p className="text-soft">Loading…</p>}>{children}</Suspense>
      </main>
    </div>
  );
}
