// The project list: what's waiting for you first, then the Live projects by place, then Test projects. Who sees
// what is set by the database (migration 0006, lib/roles.ts): members see the projects they're on the team of,
// sub-admins every Live project plus Test ones they're on, admins everything. New projects are made in the Admin
// panel. Click anywhere on a row to open the project. The tables and search box are components/project-groups.tsx.
import Link from "next/link";
import { ProjectGroups, type ProjectGroup, type ProjectRow } from "@/components/project-groups";
import { buttonVariants } from "@/components/ui/button";
import { actsForAll, isStaff, kindOf, REGIONS, regionsOf, ROLE_NAME, roleOf, type Kind, type Role } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { dn, revLabel, STATUS, type Status } from "@/lib/workflow";
import { PageHeader } from "@/components/page-header";

interface Row { id: string; name: string; region: string; status: Status; last_rev: number | null; grand_total: number | null; location: string | null; acre: number | null; updated_at: string; created_at: string; created_by: string | null; kind: Kind }
const placeOf = (p: Row) => (p.location || p.region).trim();

const INTRO: Record<Role, string> = {
  admin: "Every project, Live and Test. As admin you can open any of them and take any step. Click a row to open it.",
  subadmin: "The Live projects of your region, plus any project you're on the team of. You can act for any department on a Live project of your region. Click a row to open it.",
  member: "The projects you're on the team of. Click a row to open it.",
};

export default async function ProjectsPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub as string;
  const [{ data: projects }, { data: mine }, { data: me }] = await Promise.all([
    // newest first by when the project was created (user, 2026-11-27)
    supabase.from("projects").select("id, name, region, status, last_rev, grand_total, location, acre, updated_at, created_at, created_by, kind").order("created_at", { ascending: false }),
    supabase.from("project_members").select("*").eq("user_id", uid),
    supabase.from("profiles").select("*").eq("id", uid).single(),
  ]);
  const role = roleOf(me);
  const deptsOf = new Map<string, string[]>();
  for (const m of mine ?? []) deptsOf.set(m.project_id, [...(deptsOf.get(m.project_id) ?? []), m.dept]);
  // "your turn" only where you can act: View-only rows (migration 0008) aren't counted
  const actsIn = new Map<string, string[]>();
  for (const m of mine ?? []) if ((m as { access?: string }).access !== "view") actsIn.set(m.project_id, [...(actsIn.get(m.project_id) ?? []), m.dept]);
  const rows = (projects ?? []).map((p) => ({ ...p, kind: kindOf(p) })) as Row[];
  const waiting = rows.filter((p) => { const d = STATUS[p.status][1]; return d && actsIn.get(p.id)?.includes(d); });
  const live = rows.filter((p) => !waiting.includes(p) && p.kind === "live");
  const test = rows.filter((p) => !waiting.includes(p) && p.kind === "test");
  const roleIn = (p: Row) => (deptsOf.get(p.id) ?? []).map(dn).join(" + ") || (actsForAll(role, p.kind, p.region, regionsOf(me)) ? ROLE_NAME[role] : "View only");
  // who created each project, for the "Created … by …" line (everyone signed in can read names)
  const creators = [...new Set(rows.map((p) => p.created_by).filter(Boolean))] as string[];
  const { data: ppl } = creators.length ? await supabase.from("profiles").select("id, name").in("id", creators) : { data: [] };
  const nameOf = new Map((ppl ?? []).map((x) => [x.id as string, x.name as string]));
  const view = (p: Row): ProjectRow => ({ id: p.id, name: p.name, status: p.status, rev: revLabel(p.status, p.last_rev), grand_total: p.grand_total, location: p.location, acre: p.acre, kind: p.kind, role: roleIn(p),
    createdAt: p.created_at, createdBy: p.created_by ? nameOf.get(p.created_by) || "a former member" : null });
  // NCR, MMR, Alibaug, Nagpur first, then any other place
  const placesOf = (list: Row[]) => [...new Set([...REGIONS, ...list.map(placeOf).sort()])].filter((pl) => list.some((p) => placeOf(p) === pl));

  const groups: ProjectGroup[] = [
    ...(waiting.length ? [{ title: "Waiting for you", rows: waiting.map(view), highlight: true }] : []),
    // grouped by the rates location (the Location input), not the region picked when the project was set up
    ...placesOf(live).map((place) => ({ title: place, rows: live.filter((p) => placeOf(p) === place).map(view) })),
    // Test projects split by region too, so NCR and MMR aren't mixed (user, 2026-11-27)
    ...placesOf(test).map((place) => ({ title: `Test projects · ${place}`, rows: test.filter((p) => placeOf(p) === place).map(view), test: true })),
  ];

  return (
    <div className="grid gap-8">
      <PageHeader title="Projects" description={INTRO[role]}
        actions={isStaff(role) ? <Link href="/admin/live" className={buttonVariants({ variant: "outline" })}>Manage Live projects</Link> : undefined} />
      {!rows.length && <p className="rounded-xl border border-line bg-sheet p-5 text-soft">{isStaff(role) ? "No projects yet. New projects are made in Administration → Live projects." : "You're not on any project's team yet. When someone adds you to one, it shows here."}</p>}
      <ProjectGroups groups={groups} />
    </div>
  );
}
