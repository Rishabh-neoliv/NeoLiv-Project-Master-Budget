// The Administration pages (Admin dashboard, Team members, projects, templates, reports, roles, settings): the same
// frame as every other page (components/side-bar.tsx), so admins and sub-admins don't switch between two areas
// (user, 2026-11-27). Each page checks who may open it (staffOrRedirect / adminOrRedirect, lib/server/admin-guard.ts).
import { Suspense } from "react";
import { SideBar } from "@/components/side-bar";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <SideBar />
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8">
          <Suspense fallback={<p className="text-soft">Loading…</p>}>{children}</Suspense>
        </div>
      </main>
    </div>
  );
}
