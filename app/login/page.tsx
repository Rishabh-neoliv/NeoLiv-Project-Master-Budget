"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

const MICROSOFT = process.env.NEXT_PUBLIC_MICROSOFT_SIGNIN === "on";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(params.get("error") || "");
  const [info, setInfo] = useState("");

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(""); setInfo("");
    const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) return setError(error.message === "Invalid login credentials" ? "Wrong email or password." : error.message);
    const next = params.get("next");
    router.replace(next?.startsWith("/") && next !== "/projects" ? next : "/");
    router.refresh();
  }

  // NeoLiv accounts through Microsoft Entra ID (turned on with NEXT_PUBLIC_MICROSOFT_SIGNIN=on once the
  // Azure provider is set up in Supabase: docs/Microsoft sign-in.md)
  async function microsoft() {
    setBusy(true); setError(""); setInfo("");
    const next = params.get("next");
    const back = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next?.startsWith("/") && next !== "/projects" ? next : "/")}`;
    const { error } = await createClient().auth.signInWithOAuth({ provider: "azure", options: { scopes: "email", redirectTo: back } });
    if (error) { setBusy(false); setError("Microsoft sign-in isn't available: " + error.message); }
  }

  async function reset() {
    if (!email.trim()) return setError("Type your email first, then press Forgot password.");
    setBusy(true); setError(""); setInfo("");
    // sent by the app (Microsoft 365), not by Supabase
    const res = await fetch("/api/auth/forgot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: email.trim() }) });
    const out = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setError(out.error ?? "Something went wrong. Try again."); else if (out.emailed) setInfo(out.message); else setError(out.message);
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">NeoLiv Master Budget</CardTitle>
        <CardDescription>Sign in with the account your admin set up for you.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {MICROSOFT && <>
          <Button type="button" variant="outline" className="h-10 gap-2.5" disabled={busy} onClick={microsoft}>
            <svg aria-hidden viewBox="0 0 21 21" className="size-4"><path fill="#f25022" d="M1 1h9v9H1z" /><path fill="#7fba00" d="M11 1h9v9h-9z" /><path fill="#00a4ef" d="M1 11h9v9H1z" /><path fill="#ffb900" d="M11 11h9v9h-9z" /></svg>
            Sign in with Microsoft (NeoLiv account)
          </Button>
          <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-soft"><span className="h-px flex-1 bg-line" />or with a password<span className="h-px flex-1 bg-line" /></div>
        </>}
        <form onSubmit={signIn} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="text-sm text-bad">{error}</p>}
          {info && <p className="text-sm text-good">{info}</p>}
          <Button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
          <button type="button" onClick={reset} className="text-sm text-soft underline-offset-4 hover:underline" disabled={busy}>Forgot password?</button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Suspense><LoginForm /></Suspense>
    </main>
  );
}
