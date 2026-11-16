// A person's initials in a small circle (as in the original app). With a colour, the circle is in that person's
// colour (who-changed-what, lib/changes.ts).
export function Initials({ name, colour }: { name: string; colour?: string }) {
  // first letter of the first two words that start with a letter ("Admin (dummy)" → "A", "Parth Shah" → "PS")
  const letters = name.trim().split(/\s+/).filter((w) => /^\p{L}/u.test(w)).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
  return (
    <span aria-hidden className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${colour ? "" : "bg-amber-soft text-amber"}`}
      style={colour ? { background: `color-mix(in srgb, ${colour} 22%, transparent)`, color: colour, boxShadow: `inset 0 0 0 1.5px ${colour}` } : undefined}>
      {letters}
    </span>
  );
}
