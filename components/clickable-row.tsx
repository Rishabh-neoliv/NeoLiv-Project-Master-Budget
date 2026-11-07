"use client";
// A table row that opens a page when clicked anywhere on it (or with Enter). Links inside still work on their own.
import { useRouter } from "next/navigation";

export function ClickableRow({ href, label, className = "", children }: { href: string; label: string; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <tr tabIndex={0} title={label} aria-label={label} onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button")) router.push(href); }}
      onKeyDown={(e) => { if (e.key === "Enter") router.push(href); }}
      onMouseEnter={() => router.prefetch(href)}
      className={`cursor-pointer hover:bg-tint focus-visible:bg-tint focus-visible:outline-none ${className}`}>
      {children}
    </tr>
  );
}
