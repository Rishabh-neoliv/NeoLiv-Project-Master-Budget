"use client";

// The Admin panel's menu, with an icon per page. Admins see every page; sub-admins see Overview, Team members,
// Live projects, Reports (their projects only) and Roles & access (lib/roles.ts).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, FlaskConical, FolderKanban, Layers, LayoutDashboard, Settings, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import type { Role } from "@/lib/roles";

const LINKS: [href: string, label: string, Icon: LucideIcon, adminOnly: boolean][] = [
  ["/admin", "Overview", LayoutDashboard, false],
  ["/admin/members", "Team members", Users, false],
  ["/admin/live", "Live projects", FolderKanban, false],
  ["/admin/test", "Test projects", FlaskConical, true],
  ["/admin/templates", "Master templates", Layers, true],
  ["/admin/reports", "Reports", BarChart3, false],
  ["/admin/access", "Roles & access", ShieldCheck, false],
  ["/admin/settings", "Settings", Settings, true],
];

export function AdminNav({ role }: { role: Role }) {
  const path = usePathname();
  return (
    // narrow screens: one row that scrolls sideways, so the menu doesn't fill the first screen; md+: a column
    <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 md:mx-0 md:flex-col md:overflow-visible md:px-0 [&>a]:shrink-0 [&>a]:whitespace-nowrap">
      {LINKS.filter(([, , , adminOnly]) => role === "admin" || !adminOnly).map(([href, label, Icon]) => {
        const on = href === "/admin" ? path === "/admin" : path.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={on ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${on ? "bg-white/15 font-semibold text-white" : "text-white/75 hover:bg-white/10 hover:text-white"}`}>
            <Icon className="size-4 shrink-0" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
