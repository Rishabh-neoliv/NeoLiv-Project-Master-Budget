// A person's initials in a small circle (as in the original app).
export function Initials({ name }: { name: string }) {
  // first letter of the first two words that start with a letter ("Admin (dummy)" → "A", "Parth Shah" → "PS")
  const letters = name.trim().split(/\s+/).filter((w) => /^\p{L}/u.test(w)).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
  return (
    <span aria-hidden className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-soft text-[11px] font-semibold text-amber">
      {letters}
    </span>
  );
}
