"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TeamEditor, emptyTeam, teamToRows, type Person, type Team } from "@/components/team-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function NewProjectForm({ people, meId, isAdmin = false }: { people: Person[]; meId: string; isAdmin?: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [region, setRegion] = useState<"NCR" | "MMR">("NCR");
  // the creator starts on Base Line
  const [team, setTeam] = useState<Team>(() => (isAdmin ? emptyTeam() : { ...emptyTeam(), BD: [meId] }));
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, region, team: teamToRows(team) }) });
    const out = await res.json();
    setBusy(false);
    if (!res.ok) return void toast.error(out.error);
    toast.success("Project created. Fill in the Base Line parameters, then save the draft.");
    router.push(`/projects/${out.id}`);
  }

  return (
    <form onSubmit={create} className="grid gap-6 rounded-xl border border-line bg-sheet p-5">
      <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
        <div className="grid gap-1.5"><Label htmlFor="name">Project name</Label><Input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sonipat Phase III" /></div>
        <div className="grid gap-1.5"><Label htmlFor="region">Region</Label>
          <select id="region" className="h-9 rounded-lg border border-input bg-sheet px-2.5 text-sm" value={region} onChange={(e) => setRegion(e.target.value as "NCR" | "MMR")}><option>NCR</option><option>MMR</option></select></div>
      </div>
      <div className="grid gap-3">
        <div><h2 className="text-lg font-semibold">Team</h2><p className="text-sm text-soft">At least one person for each step. Everyone can view the project; only its team can change it.</p></div>
        <TeamEditor team={team} people={people} onChange={setTeam} lockedId={isAdmin ? undefined : meId} />
      </div>
      <div className="flex gap-2"><Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create project"}</Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button></div>
    </form>
  );
}
