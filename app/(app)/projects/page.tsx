// The project list: what's waiting for you first, then the Live projects by place, then Test projects. Who sees
// what is set by the database (migration 0006, lib/roles.ts): members see the projects they're on the team of,
// sub-admins every Live project plus Test ones they're on, admins everything. New projects are made in the Admin
// panel. Click anywhere on a row to open the project.
import Link from "next/link";
import { ClickableRow } from "@/components/clickable-row";
import { RevTag, StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { crore, numCell } from "@/lib/budget";
import { actsForAll, isStaff, kindOf, ROLE_NAME, roleOf, type Kind, type Role } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { dn, revLabel, STATUS, type Status } from "@/lib/workflow";

interface Row { id: string; name: string; region: string; status: Status; last_rev: number | null; grand_total: number | null; location: string | null; acre: number | null; updated_at: string; kind: Kind }
const placeOf = (p: Row) => (p.location || p.region).trim();

const INTRO: Record<Role, string> = {
  admin: "Every project, Live and Test. As admin you can open any of them and take any step. Click a row to open it.",
  subadmin: "Every Live project, plus the Test projects you're on the team of. You can act for any department on a Live project. Click a row to open it.",
  member: "The projects you're on the team of. Click a row to open it.",
};

export default async function ProjectsPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub as string;
  const [{ data: projects }, { data: mine }, { data: me }] = await Promise.all([
    supabase.from("projects").select("id, name, region, status, last_rev, grand_total, location, acre, updated_at, kind").order("updated_at", { ascending: false }),
    supabase.from("project_members").select("project_id, dept").eq("user_id", uid),
    supabase.from("profiles").select("*").eq("id", uid).single(),
  ]);
  const role = roleOf(me);
  const deptsOf = new Map<string, string[]>();
  for (const m of mine ?? []) deptsOf.set(m.project_id, [...(deptsOf.get(m.project_id) ?? []), m.dept]);
  const rows = (projects ?? []).map((p) => ({ ...p, kind: kindOf(p) })) as Row[];
  const waiting = rows.filter((p) => { const d = STATUS[p.status][1]; return d && deptsOf.get(p.id)?.includes(d); });
  const live = rows.filter((p) => !waiting.includes(p) && p.kind === "live");
  const test = rows.filter((p) => !waiting.includes(p) && p.kind === "test");
  const roleIn = (p: Row) => (deptsOf.get(p.id) ?? []).map(dn).join(" + ") || (actsForAll(role, p.kind) ? ROLE_NAME[role] : "View only");

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Projects</h1>
          <p className="text-soft">{INTRO[role]}</p>
        </div>
        {isStaff(role) && <Link href="/admin/live" className={buttonVariants({ variant: "outline" })}>Admin panel</Link>}
      </div>
      {!rows.length && <p className="rounded-xl border border-line bg-sheet p-5 text-soft">{isStaff(role) ? "No projects yet. New projects are made in the Admin panel → Live projects." : "You're not on any project's team yet. When someone adds you to one, it shows here."}</p>}
      {waiting.length > 0 && <Group title="Waiting for you" rows={waiting} roleIn={roleIn} highlight />}
      {/* grouped by the rates location (the Location input), not the region picked when the project was set up */}
      {[...new Set(["NCR", "MMR", ...live.map(placeOf).sort()])].map((place) => {
        const list = live.filter((p) => placeOf(p) === place);
        return list.length ? <Group key={place} title={place} rows={list} roleIn={roleIn} /> : null;
      })}
      {test.length > 0 && <Group title="Test projects" rows={test} roleIn={roleIn} />}
    </div>
  );
}

function Group({ title, rows, roleIn, highlight = false }: { title: string; rows: Row[]; roleIn: (p: Row) => string; highlight?: boolean }) {
  return (
    <section className="grid gap-2">
      <h2 className={`text-sm font-semibold uppercase tracking-wider ${highlight ? "text-brand" : "text-soft"}`}>{title} <span className="font-normal">({rows.length})</span></h2>
      <div className={`overflow-x-auto rounded-xl border bg-sheet ${highlight ? "border-brand/50" : "border-line"}`}>
        <table className="w-full">
          <thead className="bg-well text-left text-xs uppercase tracking-wide text-soft">
            <tr><th className="px-4 py-2.5">Project</th><th className="px-4 py-2.5">Revision</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Your role</th><th className="px-4 py-2.5 text-right">Area (acre)</th><th className="px-4 py-2.5 text-right">Grand total</th></tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <ClickableRow key={p.id} href={`/projects/${p.id}`} label={`Open ${p.name}`} className="border-t border-line">
                <td className="px-4 py-3">
                  <Link href={`/projects/${p.id}`} className="font-semibold text-brand hover:underline">{p.name}</Link>
                  {p.kind === "test" && <span className="ml-2 rounded bg-amber-soft px-1.5 py-0.5 text-xs font-medium text-amber">Test</span>}
                  <div className="text-sm text-soft">{p.location} rates</div>
                </td>
                <td className="px-4 py-3"><RevTag>{revLabel(p.status, p.last_rev)}</RevTag></td>
                <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                <td className="px-4 py-3 text-soft">{roleIn(p)}</td>
                <td className="px-4 py-3 text-right">{numCell(p.acre)}</td>
                <td className="px-4 py-3 text-right font-semibold">{crore(p.grand_total)}</td>
              </ClickableRow>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
