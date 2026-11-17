// A "next" destination from a query string, made safe against open redirects. A value must be a path on THIS
// site: it has to start with a single "/" and not "//" or "/\" (which browsers read as another site, e.g.
// "//evil.com" → https://evil.com). Anything else falls back to `fallback`.
export function safeNext(next: string | null | undefined, fallback: string) {
  if (!next || next[0] !== "/" || next[1] === "/" || next[1] === "\\") return fallback;
  return next;
}
