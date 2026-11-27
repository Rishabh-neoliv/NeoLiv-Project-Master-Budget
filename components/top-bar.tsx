"use client";
// The slim bar across the top of every page (user, 2026-11-27): the page's name on the left ("Administration /" in
// front on the admin pages), search and the bell on the right (components/top-tools.tsx). It stays at the top while
// the page scrolls. The page's own heading, description and buttons stay below it.
import { usePathname } from "next/navigation";
import { TopTools } from "@/components/top-tools";

// page names by address; a project or member page shows the kind of page (its own heading names it)
const TITLES: [RegExp, string][] = [
  [/^\/overview$/, "My overview"],
  [/^\/projects$/, "Projects"],
  [/^\/projects\/[^/]+$/, "Project"],
  [/^\/profile$/, "My profile"],
  [/^\/admin$/, "Admin dashboard"],
  [/^\/admin\/members$/, "Team members"],
  [/^\/admin\/members\/[^/]+$/, "Member"],
  [/^\/admin\/live$/, "Live projects"],
  [/^\/admin\/live\/new$/, "New Live project"],
  [/^\/admin\/test$/, "Test projects"],
  [/^\/admin\/test\/new$/, "New Test project"],
  [/^\/admin\/templates$/, "Master templates"],
  [/^\/admin\/reports$/, "Reports"],
  [/^\/admin\/access$/, "Roles & access"],
  [/^\/admin\/access\/activity$/, "Role activity"],
  [/^\/admin\/settings$/, "Settings"],
];

export function TopBar() {
  const path = usePathname();
  const title = TITLES.find(([re]) => re.test(path))?.[1] ?? "";
  const admin = path === "/admin" || path.startsWith("/admin/");
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-sheet/95 backdrop-blur supports-[backdrop-filter]:bg-sheet/85">
      <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center justify-between gap-4 px-4 md:px-8">
        <p className="min-w-0 truncate text-sm">
          {admin && <span className="text-soft">Administration <span aria-hidden>/</span> </span>}
          <span className="font-semibold">{title}</span>
        </p>
        <TopTools />
      </div>
    </header>
  );
}
