// The Security and setup checks (lib/server/setup-status.ts) as a list: one line each, green when fine. Shown on
// Admin panel → Settings.
import type { Check, Level } from "@/lib/server/setup-status";

const LEVEL: Record<Level, [string, string]> = {
  good: ["✓", "bg-good-soft text-good"], bad: ["!", "bg-bad-soft text-bad"], warn: ["!", "bg-amber-soft text-amber"], info: ["i", "bg-info-soft text-info"],
};

export function SetupChecks({ checks }: { checks: Check[] }) {
  return (
    <ul className="grid gap-px overflow-hidden rounded-xl border border-line bg-line">
      {checks.map((c) => (
        <li key={c.label} className="flex gap-3 bg-sheet px-4 py-3">
          <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${LEVEL[c.level][1]}`} aria-hidden>{LEVEL[c.level][0]}</span>
          <div className="min-w-0">
            <div className="font-medium">{c.label}</div>
            <div className="text-sm text-soft">{c.detail}</div>
            {c.fix && c.level !== "good" && <div className="mt-0.5 text-sm">{c.level === "info" ? "To turn on: " : "Fix: "}{c.fix}</div>}
            {c.fix && c.level === "good" && <div className="mt-0.5 text-sm text-soft">{c.fix}</div>}
          </div>
        </li>
      ))}
    </ul>
  );
}
