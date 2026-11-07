"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

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
      <CardContent>
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
