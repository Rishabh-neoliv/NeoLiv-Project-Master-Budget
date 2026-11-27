"use client";
// A small ⓘ that shows how a figure is worked out: on hover, or on click/tap (phones). It's a button, so a click on
// it inside a ClickableRow doesn't open the row.
import { Popover } from "@base-ui/react/popover";
import { Info } from "lucide-react";

export function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Popover.Root>
      <Popover.Trigger openOnHover delay={100} aria-label={label}
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-full align-middle text-soft hover:text-brand focus-visible:outline-2 focus-visible:outline-brand">
        <Info className="size-4" aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} className="z-50">
          <Popover.Popup className="max-w-xs rounded-lg border border-line bg-sheet p-3 text-left text-sm font-normal normal-case tracking-normal text-ink shadow-lg">
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** The lines of a sum, e.g. Total COC + contingencies = Grand total; the last line is the result. */
export function SumLines({ lines }: { lines: [string, string][] }) {
  return (
    <dl className="grid gap-1">
      {lines.map(([k, v], i) => (
        <div key={k} className={`flex justify-between gap-4 tabular-nums ${i === lines.length - 1 ? "border-t border-line pt-1 font-semibold" : ""}`}>
          <dt>{k}</dt><dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
