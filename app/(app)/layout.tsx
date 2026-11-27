// Signed-in pages: the shared sidebar (components/side-bar.tsx: My work, and Administration for admins and sub-admins)
// and the page; search and the bell sit on each page's heading line (components/page-header.tsx). The admin pages use the same frame (app/(admin)/admin/layout.tsx).
import { Suspense } from "react";
import { SideBar } from "@/components/side-bar";

export default function AppLayout({ children }: LayoutProps<"/">) {
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
