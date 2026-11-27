"use client";
// The one menu, on every page (user, 2026-11-27: no separate "app" and "Admin panel"). Two sections:
//   My work         everyone: My overview, Projects, My profile
//   Administration  admins: Admin dashboard, Team members, Live and Test projects, Master templates, Reports,
//                   Roles & access, Settings; sub-admins: Admin dashboard, Team members, Live projects, Reports,
//                   Roles & access. Ordinary members don't see it (people are invited by admins and sub-admins only).
// Who may open each page is still checked on the server (lib/server/admin-guard.ts, lib/roles.ts).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, FlaskConical, FolderKanban, Layers, LayoutDashboard, LayoutGrid, Settings, ShieldCheck, UserRound, Users, type LucideIcon } from "lucide-react";
import type { Role } from "@/lib/roles";

type Item = [href: string, label: string, Icon: LucideIcon, who: "all" | "staff" | "admin"];
const MY_WORK: Item[] = [
  ["/overview", "My overview", LayoutGrid, "all"],
  ["/projects", "Projects", FolderKanban, "all"],
  ["/profile", "My profile", UserRound, "all"],
];
const ADMIN: Item[] = [
  ["/admin", "Admin dashboard", LayoutDashboard, "staff"],
  ["/admin/members", "Team members", Users, "staff"],
  ["/admin/live", "Live projects", FolderKanban, "staff"],
  ["/admin/test", "Test projects", FlaskConical, "admin"],
  ["/admin/templates", "Master templates", Layers, "admin"],
  ["/admin/reports", "Reports", BarChart3, "staff"],
  ["/admin/access", "Roles & access", ShieldCheck, "staff"],
  ["/admin/settings", "Settings", Settings, "admin"],
];

export function SideNav({ role }: { role: Role }) {
  const path = usePathname();
  const allowed = ([, , , who]: Item) => who === "all" || (who === "staff" && role !== "member") || (who === "admin" && role === "admin");
  const on = (href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(href + "/"));
  const link = ([href, label, Icon]: Item) => (
    <Link key={href} href={href} aria-current={on(href) ? "page" : undefined}
      className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm ${on(href) ? "bg-white/15 font-semibold text-white" : "text-white/75 hover:bg-white/10 hover:text-white"}`}>
      <Icon className="size-4 shrink-0" aria-hidden />{label}
    </Link>
  );
  const admin = ADMIN.filter(allowed);
  const heading = "hidden px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7fd9c6] md:block";
  return (
    // narrow screens: one row that scrolls sideways (the sections divided by a thin line); md+: a column
    <nav aria-label="Menu" className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 md:mx-0 md:grid md:items-stretch md:gap-5 md:overflow-visible md:px-0">
      <div className="flex gap-1 md:grid">
        <p className={heading}>My work</p>
        {MY_WORK.filter(allowed).map(link)}
      </div>
      {admin.length > 0 && <>
        <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-white/20 md:hidden" />
        <div className="flex gap-1 md:grid">
          <p className={heading}>Administration</p>
          {admin.map(link)}
        </div>
      </>}
    </nav>
  );
}
