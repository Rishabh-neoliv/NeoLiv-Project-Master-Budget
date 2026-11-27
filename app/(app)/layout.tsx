// Signed-in pages: the shared sidebar (components/side-bar.tsx: My work, and Administration for admins and sub-admins)
// and the page, with search and the bell at its top. The admin pages use the same frame (app/(admin)/admin/layout.tsx).
import { Suspense } from "react";
import { SideBar } from "@/components/side-bar";
import { TopTools } from "@/components/top-tools";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <SideBar />
      <main className="min-w-0 flex-1 px-4 py-4 md:px-8 md:py-6">
        <div className="mx-auto w-full max-w-[1400px]">
          {/* search and the bell */}
          <div className="mb-4 flex justify-end md:mb-6"><TopTools /></div>
          <Suspense fallback={<p className="text-soft">Loading…</p>}>{children}</Suspense>
        </div>
      </main>
    </div>
  );
}
