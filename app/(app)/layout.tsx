// Signed-in pages: the top bar (template in use, Overview, Projects, Members, Admin panel for admins and
// sub-admins, who you are → My profile, Sign out). Everything that reads the session sits inside <Suspense>, so the
// page shell shows at once.
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Initials } from "@/components/initials";
import { SignOutButton } from "@/components/sign-out-button";
import { isStaff, ROLE_NAME, roleOf } from "@/lib/roles";
import { APP_VERSION } from "@/lib/version";
import { createClient } from "@/lib/supabase/server";

async function UserBar() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub as string | undefined;
  if (!uid) redirect("/login");
  const [{ data: me }, { data: tpl }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", uid).single(),
    supabase.from("templates").select("modified, stamp").eq("is_current", true).maybeSingle(),
  ]);
  const role = roleOf(me);
  return (
    <>
      <span className="hidden text-sm text-soft md:inline">Rates: template of {tpl?.modified || tpl?.stamp || "–"} · {APP_VERSION}</span>
      <nav className="flex gap-4 text-sm">
        <Link href="/overview" className="text-soft hover:text-ink">Overview</Link>
        <Link href="/projects" className="text-soft hover:text-ink">Projects</Link>
        <Link href="/members" className="text-soft hover:text-ink">Members</Link>
        {isStaff(role) && <Link href="/admin" className="font-medium text-brand hover:underline">Admin panel</Link>}
      </nav>
      <div className="ml-auto flex items-center gap-2.5 text-sm">
        <Link href="/profile" title="My profile" className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 hover:bg-well">
          <Initials name={me?.name || me?.email || "?"} />
          <span className="hidden sm:inline"><b className="font-medium">{me?.name}</b> <span className="text-soft">{me?.email}</span>{isStaff(role) && <span className="ml-1.5 rounded bg-info-soft px-1.5 py-0.5 text-xs text-info">{ROLE_NAME[role]}</span>}</span>
        </Link>
        <SignOutButton />
      </div>
    </>
  );
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="border-b border-line bg-sheet">
        <div className="mx-auto flex min-h-14 max-w-[1280px] flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2">
          <Link href="/overview" className="text-lg font-semibold tracking-tight">NeoLiv Master Budget</Link>
          <Suspense><UserBar /></Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6">
        <Suspense fallback={<p className="text-soft">Loading…</p>}>{children}</Suspense>
      </main>
    </>
  );
}
