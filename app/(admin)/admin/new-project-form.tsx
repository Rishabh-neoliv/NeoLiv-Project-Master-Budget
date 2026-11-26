"use client";

// New project (Admin panel → Live projects / Test projects → New). The type comes from the tab and never changes.
// The person creating it (an admin or sub-admin) doesn't have to be on the team: they can act on it anyway.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TeamEditor, emptyTeam, teamToRows, type Person, type Team } from "@/components/team-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Kind } from "@/lib/roles";

/** regions: the ones this person may create in (all for an admin, their own for a sub-admin) */
export function NewProjectForm({ people, kind, regions }: { people: Person[]; kind: Kind; regions: string[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [region, setRegion] = useState(regions[0]);
  const [team, setTeam] = useState<Team>(() => emptyTeam());
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, region, kind, team: teamToRows(team) }) });
    const out = await res.json();
    setBusy(false);
    if (!res.ok) return void toast.error(out.error);
    toast.success(`${kind === "test" ? "Test" : "Live"} project created. Base Line fills in the parameters, then saves the draft.`);
    router.push(`/projects/${out.id}`);
  }

  return (
    <form onSubmit={create} className="grid gap-6 rounded-xl border border-line bg-sheet p-5">
      <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
        <div className="grid gap-1.5"><Label htmlFor="name">Project name</Label><Input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "test" ? "e.g. Test – road shortcut" : "e.g. Sonipat Phase III"} /></div>
        <div className="grid gap-1.5"><Label htmlFor="region">Region</Label>
          <select id="region" className="h-9 rounded-lg border border-input bg-sheet px-2.5 text-sm" value={region} onChange={(e) => setRegion(e.target.value)}>{regions.map((r) => <option key={r}>{r}</option>)}</select></div>
      </div>
      <div className="grid gap-3">
        <div><h2 className="text-lg font-semibold">Team</h2><p className="text-sm text-soft">At least one person for each step. Only the team sees the project{kind === "live" ? " (plus admins and sub-admins)" : " (plus admins)"}.</p></div>
        <TeamEditor team={team} people={people} onChange={setTeam} />
      </div>
      <div className="flex gap-2"><Button type="submit" disabled={busy}>{busy ? "Creating…" : `Create ${kind === "test" ? "Test" : "Live"} project`}</Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button></div>
    </form>
  );
}
