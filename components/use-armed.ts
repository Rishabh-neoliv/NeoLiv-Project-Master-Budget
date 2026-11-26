"use client";
// Two-press buttons ("Make sub-admin" → "Confirm: make sub-admin"): the first press arms, the second acts. An armed
// button goes back to normal as soon as you click anywhere else, press Escape, or after a few seconds, so a
// half-finished confirmation never stays on screen (user, 2026-11-26). Mark every two-press button with
// `data-armable` so pressing one of them (to confirm, or to arm another) doesn't count as clicking elsewhere.
import { useEffect, useState } from "react";

export function useArmed<T>(off: T, ms = 6000) {
  const [armed, setArmed] = useState<T>(off);
  useEffect(() => {
    if (armed === off) return;
    const reset = () => setArmed(off);
    const away = (e: Event) => { if (!(e.target instanceof Element && e.target.closest("[data-armable]"))) reset(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") reset(); };
    const timer = setTimeout(reset, ms);
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", esc);
    return () => { clearTimeout(timer); document.removeEventListener("pointerdown", away, true); document.removeEventListener("keydown", esc); };
  }, [armed, off, ms]);
  return [armed, setArmed] as const;
}
