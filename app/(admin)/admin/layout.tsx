// The admin panel: its own look and navigation, separate from the team members' app.
import { Suspense } from "react";
import Link from "next/link";
import { AdminNav } from "@/components/admin-nav";
import { Initials } from "@/components/initials";
import { SignOutButton } from "@/components/sign-out-button";
import { adminOrRedirect } from "@/lib/server/admin-guard";
import { APP_VERSION } from "@/lib/version";

async function Who() {
  const me = await adminOrRedirect();
  return (
    <div className="grid gap-3 border-t border-white/10 pt-4">
      <div className="flex items-center gap-2.5">
        <Initials name={me.name || me.email} />
        <Link href="/profile" title="My profile" className="min-w-0 text-sm hover:underline"><div className="truncate font-medium text-white">{me.name}</div><div className="truncate text-white/60">{me.email}</div></Link>
      </div>
      <div className="[&_button]:text-white/80 [&_button:hover]:bg-white/10 [&_button:hover]:text-white"><SignOutButton /></div>
    </div>
  );
}

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col gap-6 bg-[#10302a] px-4 py-5 text-white md:sticky md:top-0 md:h-screen md:w-64">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7fd9c6]">Admin panel</div>
          <div className="mt-1 text-lg font-semibold">NeoLiv Master Budget</div>
          <div className="text-xs text-white/50">{APP_VERSION}</div>
        </div>
        <AdminNav />
        <Link href="/projects" className="rounded-lg border border-white/15 px-3 py-2 text-sm text-white/85 hover:bg-white/10">Open the app as a team member →</Link>
        <div className="mt-auto"><Suspense><Who /></Suspense></div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        <Suspense fallback={<p className="text-soft">Loading…</p>}>{children}</Suspense>
      </main>
    </div>
  );
}
