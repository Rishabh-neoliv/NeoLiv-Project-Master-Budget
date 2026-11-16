"use client";

// Your name and department, and your password (after confirming the current one, so nobody at an unattended screen can change it).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEPARTMENTS } from "@/lib/departments";
import { createClient } from "@/lib/supabase/client";

export function ProfileForm({ name: initial, department: initialDept, email, microsoft }: { name: string; department: string; email: string; microsoft: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(initial);
  const [dept, setDept] = useState(initialDept);
  const unchanged = name.trim() === initial.trim() && dept === initialDept;
  const [busy, setBusy] = useState<"name" | "pw" | null>(null);
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [pwError, setPwError] = useState("");

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setBusy("name");
    try {
      const res = await fetch("/api/profile", { method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...(name.trim() !== initial.trim() ? { name } : {}), ...(dept !== initialDept ? { department: dept } : {}) }) });
      const out = await res.json();
      if (!res.ok) return void toast.error(out.error);
      toast.success("Details saved.");
      router.refresh();
    } finally { setBusy(null); }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return setPwError("Use at least 8 characters.");
    if (pw !== again) return setPwError("The two new passwords don't match.");
    if (pw === current) return setPwError("The new password is the same as the current one.");
    setBusy("pw"); setPwError("");
    try {
      const supabase = createClient();
      // confirm it's really you: the current password must be right
      const { error: wrong } = await supabase.auth.signInWithPassword({ email, password: current });
      if (wrong) return setPwError("Your current password isn't right. Forgot it? Sign out and use “Forgot password?” on the sign-in page.");
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) return setPwError(error.message);
      setCurrent(""); setPw(""); setAgain("");
      toast.success("Password changed. Use it the next time you sign in.");
    } finally { setBusy(null); }
  }

  return (
    <>
      <form onSubmit={saveName} className="grid gap-4 rounded-xl border border-line bg-sheet p-5">
        <h2 className="text-lg font-semibold">My details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
            <small className="text-soft">Shown on projects, in the history and in emails.</small>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="email">Username (email)</Label>
            <Input id="email" readOnly value={email} className="bg-well" autoComplete="username" />
            <small className="text-soft">{microsoft ? "You can also sign in with Microsoft. " : ""}The username can&apos;t be changed here; ask an admin.</small>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="dept">Department</Label>
            <select id="dept" className="h-9 rounded-lg border border-input bg-sheet px-2.5" value={dept} onChange={(e) => setDept(e.target.value)}>
              <option value="">Choose your department…</option>
              {/* a department saved earlier that is no longer in the list still shows */}
              {dept && !(DEPARTMENTS as readonly string[]).includes(dept) && <option value={dept}>{dept}</option>}
              {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
            </select>
            <small className="text-soft">Your department in NeoLiv. Your role on each project is set on that project&apos;s Team tab.</small>
          </div>
        </div>
        <Button type="submit" className="w-fit" disabled={busy !== null || unchanged || name.trim().length < 2}>{busy === "name" ? "Saving…" : "Save details"}</Button>
      </form>

      <form onSubmit={savePassword} className="grid gap-4 rounded-xl border border-line bg-sheet p-5">
        <div>
          <h2 className="text-lg font-semibold">Change password</h2>
          <p className="text-sm text-soft">The password is only for this web application; it doesn&apos;t change any other account.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-1.5"><Label htmlFor="cur">Current password</Label><Input id="cur" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label htmlFor="pw">New password</Label><Input id="pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label htmlFor="again">New password again</Label><Input id="again" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} /></div>
        </div>
        {pwError && <p className="text-sm text-bad">{pwError}</p>}
        <Button type="submit" className="w-fit" disabled={busy !== null || !current || !pw || !again}>{busy === "pw" ? "Changing…" : "Change password"}</Button>
      </form>
    </>
  );
}
