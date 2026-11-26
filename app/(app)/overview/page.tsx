// My overview: everyone's landing page. What's waiting for you, the projects you're on the team of, and the latest
// changes on them (each person in the colour the project screen gives them, lib/changes.ts). Reads with the
// signed-in person's own session, so row-level security decides what's visible (migration 0006). Base Line's work on
// R0 isn't listed or counted (lib/changes.ts afterBaseLine).
import Link from "next/link";
import { ClickableRow } from "@/components/clickable-row";
import { Initials } from "@/components/initials";
import { RevTag, StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { colours, withoutBaseLine } from "@/lib/changes";
import { fmtShortDateTime } from "@/lib/dates";
import { isStaff, kindOf, regionsOf, ROLE_NAME, roleOf } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { dn, nextRev, revLabel, STATUS, type Status } from "@/lib/workflow";

interface Project { id: string; name: string; status: Status; last_rev: number | null; location: string | null; region: string; updated_at: string; kind?: string }
interface Activity { id: string; at: string; by: string | null; dept: string | null; action: string; comment: string | null; project_id: string; rev: number | null; kind: string | null }

// what the department whose turn it is has to do next
const NEXT: Record<Status, (rev: number) => string> = {
  DRAFT: (r) => `Fill in the parameters and submit R${r} to Design`,
  RETURNED: () => "Make the changes asked for and submit again",
  SUBMITTED: () => "Start design work, or send it back to Base Line",
  DESIGN_IN_PROGRESS: () => "Finish the design changes and submit to Operations",
  DESIGN_DONE: () => "Start operations",
  OPS_IN_PROGRESS: () => "Finish and submit to Management",
  WITH_MGMT: (r) => `Approve R${r}, or send it back to Operations`,
  APPROVED: () => "",
  COMPLETED: () => "",
};

const weekAgo = () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

export default async function MyOverview() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub as string;
  const [{ data: me }, { data: mine }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", uid).single(),
    supabase.from("project_members").select("project_id, dept").eq("user_id", uid),
  ]);
  const role = roleOf(me);
  const deptsOf = new Map<string, string[]>();
  for (const m of mine ?? []) deptsOf.set(m.project_id, [...(deptsOf.get(m.project_id) ?? []), m.dept]);
  const ids = [...deptsOf.keys()];

  const [{ data: projects }, { data: teams }, { data: recent }, { data: week }, { data: r0 }] = ids.length
    ? await Promise.all([
      supabase.from("projects").select("id, name, region, status, last_rev, location, updated_at, kind").in("id", ids).order("updated_at", { ascending: false }),
      supabase.from("project_members").select("project_id, user_id").in("project_id", ids),
      supabase.from("activity").select("id, at, by, dept, action, comment, project_id, rev, kind:details->>kind").in("project_id", ids).order("at", { ascending: false }).limit(150),
      supabase.from("activity").select("at, project_id, rev, kind:details->>kind").in("project_id", ids).neq("by", uid).gte("at", weekAgo()).limit(2000),
      supabase.from("versions").select("project_id, frozen_at").in("project_id", ids).eq("rev", 0),
    ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const weekCount = withoutBaseLine((week ?? []) as { at: string; project_id: string; rev: number | null; kind: string | null }[], r0 ?? []).length;

  const rows = (projects ?? []) as Project[];
  const activity = withoutBaseLine((recent ?? []) as Activity[], r0 ?? []).slice(0, 40);
  const waiting = rows.filter((p) => { const d = STATUS[p.status][1]; return d && deptsOf.get(p.id)?.includes(d); });
  const approved = rows.filter((p) => !STATUS[p.status][1]).length;
  const tests = rows.filter((p) => kindOf(p) === "test").length;
  const lastStep = new Map<string, Activity>();
  for (const a of activity) if (!lastStep.has(a.project_id)) lastStep.set(a.project_id, a);

  // names, and each person's colour per project (team order first, as on the project screen)
  const personIds = [...new Set([...(teams ?? []).map((t) => t.user_id), ...activity.map((a) => a.by)].filter(Boolean))] as string[];
  const { data: ppl } = personIds.length ? await supabase.from("profiles").select("id, name").in("id", personIds) : { data: [] };
  const names = Object.fromEntries((ppl ?? []).map((p) => [p.id, p.name as string]));
  const colourOf = new Map(ids.map((pid) => {
    const team = [...new Set((teams ?? []).filter((t) => t.project_id === pid).map((t) => t.user_id))];
    const others = [...activity].reverse().filter((a) => a.project_id === pid && a.by).map((a) => a.by!);
    return [pid, colours(team, others, names)];
  }));
  const projectName = new Map(rows.map((p) => [p.id, p.name]));
  const first = (me?.name || "").trim().split(/\s+/)[0];

  const card = "rounded-xl border border-line bg-sheet p-5";
  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{first ? `Hello, ${first}` : "My overview"}</h1>
          <p className="text-soft">What&apos;s waiting for you, the projects you&apos;re on, and what changed on them.</p>
        </div>
        <div className="flex gap-2">
          {isStaff(role) && <Link href="/admin" className={buttonVariants({ variant: "outline" })}>Admin panel</Link>}
          <Link href="/projects" className={buttonVariants({ variant: isStaff(role) ? "default" : "outline" })}>{role === "member" ? "My projects" : "All projects"}</Link>
        </div>
      </div>
      {isStaff(role) && (
        <p className="rounded-xl border border-info/30 bg-info-soft px-4 py-3 text-sm text-info">
          <b>{ROLE_NAME[role]}.</b> {role === "admin"
            ? "Below are only the projects you're on the team of. You can open and act on every project, Live and Test: see Projects or the Admin panel."
            : `Below are only the projects you're on the team of. You can also open and act on the Live projects of your region (${regionsOf(me).join(", ") || "none yet: ask an admin"}): see Projects or the Admin panel.`}
        </p>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={`${card} ${waiting.length ? "border-brand/50" : ""}`}>
          <div className="text-sm text-soft">Waiting for you</div>
          <div className={`mt-1 text-3xl font-semibold ${waiting.length ? "text-brand" : ""}`}>{waiting.length}</div>
          <div className="mt-1 text-sm text-soft">{waiting.length ? "your department's turn" : "nothing to do right now"}</div>
        </div>
        <div className={card}>
          <div className="text-sm text-soft">My projects</div>
          <div className="mt-1 text-3xl font-semibold">{rows.length}</div>
          <div className="mt-1 text-sm text-soft">{rows.length - tests} Live{tests ? ` · ${tests} Test` : ""}</div>
        </div>
        <div className={card}>
          <div className="text-sm text-soft">In progress</div>
          <div className="mt-1 text-3xl font-semibold">{rows.length - approved}</div>
          <div className="mt-1 text-sm text-soft">{approved} approved</div>
        </div>
        <div className={card}>
          <div className="text-sm text-soft">Changes by others</div>
          <div className="mt-1 text-3xl font-semibold">{weekCount ?? 0}</div>
          <div className="mt-1 text-sm text-soft">on your projects, last 7 days</div>
        </div>
      </section>

      {!rows.length && <p className="rounded-xl border border-line bg-sheet p-5 text-soft">You&apos;re not on any project&apos;s team yet. When someone adds you to one, it shows here.</p>}

      {waiting.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-brand">Waiting for you <span className="font-normal">({waiting.length})</span></h2>
          <div className="overflow-x-auto rounded-xl border border-brand/50 bg-sheet">
            <table className="w-full">
              <thead className="bg-well text-left text-xs uppercase tracking-wide text-soft"><tr><th className="px-4 py-2.5">Project</th><th className="px-4 py-2.5">Revision</th><th className="px-4 py-2.5">To do</th><th className="px-4 py-2.5">Last step</th></tr></thead>
              <tbody>
                {waiting.map((p) => {
                  const a = lastStep.get(p.id);
                  return (
                    <ClickableRow key={p.id} href={`/projects/${p.id}`} label={`Open ${p.name}`} className="border-t border-line">
                      <td className="px-4 py-3"><Name p={p} /><div className="text-sm text-soft">as {dn(STATUS[p.status][1]!)}</div></td>
                      <td className="px-4 py-3"><RevTag>{revLabel(p.status, p.last_rev)}</RevTag></td>
                      <td className="px-4 py-3 font-medium">{NEXT[p.status](nextRev(p.last_rev))}</td>
                      <td className="px-4 py-3 text-sm text-soft">{a ? <>{(a.by && names[a.by]) || "Someone"}: {a.action} · {fmtShortDateTime(a.at)}{a.comment && <div className="text-ink">“{a.comment}”</div>}</> : fmtShortDateTime(p.updated_at)}</td>
                    </ClickableRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {rows.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-soft">My projects <span className="font-normal">({rows.length})</span></h2>
          <div className="overflow-x-auto rounded-xl border border-line bg-sheet">
            <table className="w-full">
              <thead className="bg-well text-left text-xs uppercase tracking-wide text-soft"><tr><th className="px-4 py-2.5">Project</th><th className="px-4 py-2.5">My role</th><th className="px-4 py-2.5">Revision</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Waiting for</th><th className="px-4 py-2.5 text-right">Last change</th></tr></thead>
              <tbody>
                {rows.map((p) => {
                  const a = lastStep.get(p.id);
                  return (
                    <ClickableRow key={p.id} href={`/projects/${p.id}`} label={`Open ${p.name}`} className="border-t border-line">
                      <td className="px-4 py-3"><Name p={p} /><div className="text-sm text-soft">{p.location || p.region} rates</div></td>
                      <td className="px-4 py-3 text-soft">{(deptsOf.get(p.id) ?? []).map(dn).join(" + ")}</td>
                      <td className="px-4 py-3"><RevTag>{revLabel(p.status, p.last_rev)}</RevTag></td>
                      <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                      <td className="px-4 py-3 text-soft">{STATUS[p.status][1] ? dn(STATUS[p.status][1]!) : "–"}</td>
                      <td className="px-4 py-3 text-right text-sm text-soft">{fmtShortDateTime(a?.at ?? p.updated_at)}{a?.by && <div>{names[a.by] || "Someone"}</div>}</td>
                    </ClickableRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activity.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-soft">Recent changes on my projects</h2>
          <ol className="grid gap-2">
            {activity.slice(0, 15).map((a) => {
              const person = a.by ? colourOf.get(a.project_id)?.get(a.by) : undefined;
              const name = (a.by && names[a.by]) || "Someone";
              return (
                <li key={a.id} className="rounded-lg border border-line bg-sheet px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <Initials name={name} colour={person?.colour} />
                      <span><b style={person ? { color: person.colour } : undefined}>{a.by === uid ? "You" : name}</b>{a.dept ? <span className="text-soft"> ({a.dept})</span> : ""}: {a.action} · <Link href={`/projects/${a.project_id}`} className="font-medium text-brand hover:underline">{projectName.get(a.project_id) ?? "project"}</Link></span>
                    </span>
                    <span className="text-sm text-soft">{fmtShortDateTime(a.at)}</span>
                  </div>
                  {a.comment && <p className="mt-1 pl-9 text-soft">{a.comment}</p>}
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}

function Name({ p }: { p: Project }) {
  return (
    <>
      <Link href={`/projects/${p.id}`} className="font-semibold text-brand hover:underline">{p.name}</Link>
      {kindOf(p) === "test" && <span className="ml-2 rounded bg-amber-soft px-1.5 py-0.5 text-xs font-medium text-amber">Test</span>}
    </>
  );
}
