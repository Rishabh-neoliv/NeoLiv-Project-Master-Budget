"use client";

// The Admin panel's menu. Admins see every page; sub-admins see Overview, Team members and Live projects
// (lib/roles.ts).
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/roles";

const LINKS: [href: string, label: string, adminOnly: boolean][] = [
  ["/admin", "Overview", false],
  ["/admin/members", "Team members", false],
  ["/admin/live", "Live projects", false],
  ["/admin/test", "Test projects", true],
  ["/admin/templates", "Master templates", true],
];

export function AdminNav({ role }: { role: Role }) {
  const path = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 md:flex-col">
      {LINKS.filter(([, , adminOnly]) => role === "admin" || !adminOnly).map(([href, label]) => {
        const on = href === "/admin" ? path === "/admin" : path.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={on ? "page" : undefined}
            className={`rounded-lg px-3 py-2 text-sm ${on ? "bg-white/15 font-semibold text-white" : "text-white/75 hover:bg-white/10 hover:text-white"}`}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
