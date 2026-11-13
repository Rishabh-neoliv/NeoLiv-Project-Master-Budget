"use client";

// Where sign-up and password links land (first time and "Forgot password?"). The link has already signed the
// person in, so their email is known: it's shown as their username, the way they sign in from now on.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export default function SetPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return setError("Use at least 8 characters.");
    if (pw !== again) return setError("The two passwords don't match.");
    setBusy(true); setError("");
    const { error } = await createClient().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setError(error.message);
    if (email) toast.success(`Password saved. From now on sign in with ${email} and this password.`, { duration: 8000 });
    router.replace("/projects");
    router.refresh();
  }

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Set your password</CardTitle>
          <CardDescription>Your username is your email. You&apos;ll sign in with it and this password. The password is only for this app.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="username">Username</Label>
              {/* read-only, and marked as the username so a browser saves it together with the new password */}
              <Input id="username" type="email" autoComplete="username" readOnly value={email ?? ""} placeholder={email === null ? "Loading…" : ""}
                className="bg-well font-medium" />
              {email === "" && <p className="text-sm text-bad">This link has expired or was already used. Ask for a new one, or use “Forgot password?” on the sign-in page.</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pw">New password</Label>
              <Input id="pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="again">Type it again</Label>
              <Input id="again" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
            </div>
            {error && <p className="text-sm text-bad">{error}</p>}
            <Button type="submit" disabled={busy || email === ""}>{busy ? "Saving…" : "Save password"}</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
