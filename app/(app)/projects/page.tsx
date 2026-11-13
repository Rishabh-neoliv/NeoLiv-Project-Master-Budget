// The project list: what's waiting for you first, then every other project, by region. Every member sees every
// project; "Your role" shows where they're on the team (anything else is view only).
// Click anywhere on a row to open the project.
import Link from "next/link";
import { ClickableRow } from "@/components/clickable-row";
import { RevTag, StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { crore, numCell } from "@/lib/budget";
import { createClient } from "@/lib/supabase/server";
import { dn, revLabel, STATUS, type Status } from "@/lib/workflow";

interface Row { id: string; name: string; region: string; status: Status; last_rev: number | null; grand_total: number | null; location: string | null; acre: number | null; updated_at: string }

export default async function ProjectsPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub as string;
  const [{ data: projects }, { data: mine }, { data: me }] = await Promise.all([
    supabase.from("projects").select("id, name, region, status, last_rev, grand_total, location, acre, updated_at").order("updated_at", { ascending: false }),
    supabase.from("project_members").select("project_id, dept").eq("user_id", uid),
    supabase.from("profiles").select("is_admin").eq("id", uid).single(),
  ]);
  const isAdmin = !!me?.is_admin;
  const deptsOf = new Map<string, string[]>();
  for (const m of mine ?? []) deptsOf.set(m.project_id, [...(deptsOf.get(m.project_id) ?? []), m.dept]);
  const rows = (projects ?? []) as Row[];
  const waiting = rows.filter((p) => { const d = STATUS[p.status][1]; return d && deptsOf.get(p.id)?.includes(d); });
  const rest = rows.filter((p) => !waiting.includes(p));

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Projects</h1>
          <p className="text-soft">{isAdmin ? "Every project. As admin you can open any of them and take any step. Click a row to open it." : "Every project. You can change the ones you're on the team of; the rest are view only. Click a row to open it."}</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && <Link href="/admin" className={buttonVariants({ variant: "outline" })}>Admin panel</Link>}
          <Link href="/projects/new" className={buttonVariants()}>New project</Link>
        </div>
      </div>
      {!rows.length && <p className="rounded-xl border border-line bg-sheet p-5 text-soft">{isAdmin ? "No projects yet. Press New project to set one up." : "No projects yet. Press New project to set one up."}</p>}
      {waiting.length > 0 && <Group title="Waiting for you" rows={waiting} deptsOf={deptsOf} isAdmin={isAdmin} highlight />}
      {(["NCR", "MMR"] as const).map((region) => {
        const list = rest.filter((p) => p.region === region);
        return list.length ? <Group key={region} title={region} rows={list} deptsOf={deptsOf} isAdmin={isAdmin} /> : null;
      })}
    </div>
  );
}

function Group({ title, rows, deptsOf, isAdmin, highlight = false }: { title: string; rows: Row[]; deptsOf: Map<string, string[]>; isAdmin: boolean; highlight?: boolean }) {
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
                <td className="px-4 py-3"><Link href={`/projects/${p.id}`} className="font-semibold text-brand hover:underline">{p.name}</Link><div className="text-sm text-soft">{p.location} rates</div></td>
                <td className="px-4 py-3"><RevTag>{revLabel(p.status, p.last_rev)}</RevTag></td>
                <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                <td className="px-4 py-3 text-soft">{(deptsOf.get(p.id) ?? []).map(dn).join(" + ") || (isAdmin ? "Admin" : <span className="text-xs uppercase tracking-wide">View only</span>)}</td>
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
