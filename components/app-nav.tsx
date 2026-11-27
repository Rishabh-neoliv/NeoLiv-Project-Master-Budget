"use client";
// The app's menu in the sidebar, with an icon per page (the Admin panel's look, components/admin-nav.tsx). Admins and
// sub-admins also get the Admin panel link.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderKanban, LayoutDashboard, ShieldCheck, UserRound, Users, type LucideIcon } from "lucide-react";

const LINKS: [href: string, label: string, Icon: LucideIcon][] = [
  ["/overview", "My overview", LayoutDashboard],
  ["/projects", "Projects", FolderKanban],
  ["/members", "Members", Users],
  ["/profile", "My profile", UserRound],
];

export function AppNav({ staff }: { staff: boolean }) {
  const path = usePathname();
  const item = (on: boolean) => `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${on ? "bg-white/15 font-semibold text-white" : "text-white/75 hover:bg-white/10 hover:text-white"}`;
  return (
    // narrow screens: one row that scrolls sideways; md+: a column
    <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 md:mx-0 md:flex-col md:overflow-visible md:px-0 [&>a]:shrink-0 [&>a]:whitespace-nowrap">
      {LINKS.map(([href, label, Icon]) => {
        const on = path === href || path.startsWith(href + "/");
        return <Link key={href} href={href} aria-current={on ? "page" : undefined} className={item(on)}><Icon className="size-4 shrink-0" aria-hidden />{label}</Link>;
      })}
      {staff && <Link href="/admin" className={`${item(false)} md:mt-2 md:border-t md:border-white/10 md:pt-3`}><ShieldCheck className="size-4 shrink-0 text-[#7fd9c6]" aria-hidden />Admin panel</Link>}
    </nav>
  );
}
