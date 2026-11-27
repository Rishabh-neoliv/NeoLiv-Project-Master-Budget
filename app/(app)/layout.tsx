// Signed-in pages: the shared sidebar (components/side-bar.tsx: My work, and Administration for admins and sub-admins)
// and the page, under the slim top bar (page name, search, bell). The admin pages use the same frame (app/(admin)/admin/layout.tsx).
import { Suspense } from "react";
import { SideBar } from "@/components/side-bar";
import { TopBar } from "@/components/top-bar";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <SideBar />
      <main className="min-w-0 flex-1">
        {/* the slim bar: page name, search and the bell (components/top-bar.tsx) */}
        <Suspense fallback={<div className="sticky top-0 z-30 h-14 border-b border-line bg-sheet" />}><TopBar /></Suspense>
        <div className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8">
          <Suspense fallback={<p className="text-soft">Loading…</p>}>{children}</Suspense>
        </div>
      </main>
    </div>
  );
}
