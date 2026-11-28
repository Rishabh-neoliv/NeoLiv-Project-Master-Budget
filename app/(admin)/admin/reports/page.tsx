// Admin panel → Reports: three read-only reports over the projects you can see (admins every project, sub-admins the
// Live projects of their region, as on the Overview), each shown as charts first (components/report-charts.tsx; user,
// 2026-11-28), with its table under "Show table" and a CSV download for Excel.
//   Budget summary  totals by region; grand total per project with R0; change vs R0; area vs grand total
//   Workflow        projects by stage; days each open project has waited; workflow steps per person (30 days)
//   Rates           each project rate's difference from the master rate; project rates per sheet
// Nothing here changes data. Amounts are from the projects as stored (grand totals in ₹ crore).
import Link from "next/link";
import { CsvDownload, type CsvCell } from "@/components/csv-download";
import { RevTag, StatusBadge } from "@/components/status-badge";
import { crore, isNum, LOC_KEY, masterRate, rateIndex, type Model } from "@/lib/budget";
import { fmtDay, fmtShortDateTime } from "@/lib/dates";
import { kindOf, REGIONS, type Kind } from "@/lib/roles";
import { staffOrRedirect } from "@/lib/server/admin-guard";
import { loadModel } from "@/lib/server/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEPTS, dn, revLabel, STATUS, type Status } from "@/lib/workflow";
import { PageHeader } from "@/components/page-header";
import { ChartCard, DivergingBars, DotChart, HBars, ShowTable, Stats, Swatch, type DBar, type Dot, type HBar } from "@/components/report-charts";

interface P { id: string; name: string; region: string; location: string | null; kind: Kind; status: Status; last_rev: number | null; grand_total: number | null; base_total: number | null; acre: number | null; template: string | null; rates: Record<string, unknown> | null; created_at: string; updated_at: string }

// the steps that move a project along (lib/workflow.ts): their time is when the current wait began
const STEP = /^(Created project|Submitted|Start design work|Start operations|Send back|Approve|Create new version|Created R\d)/;
const DAY = 86400000;
// the time of this request (a helper, as the Overview does it: pages are rendered per request)
const nowMs = () => Date.now();
const num = (v: number | null | undefined, d = 2) => (isNum(v) ? +v.toFixed(d) : null);
const money = (v: number | null | undefined) => (isNum(v) ? v.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "–");

export default async function ReportsPage() {
  const me = await staffOrRedirect();
  const isAdmin = me.role === "admin";
  const db = createAdminClient();
  const now = nowMs();
  const since = new Date(now - 30 * DAY).toISOString();
  const [{ data: rows }, { data: people }, { data: steps }] = await Promise.all([
    db.from("projects").select("id, name, region, location, kind, status, last_rev, grand_total, base_total, acre, template, rates, created_at, updated_at").order("name"),
    db.from("profiles").select("id, name"),
    db.from("activity").select("project_id, by, at, action, dept").order("at", { ascending: false }).limit(5000),
  ]);
  const projects = ((rows ?? []) as P[]).map((p) => ({ ...p, kind: kindOf(p) })).filter((p) => isAdmin || (p.kind === "live" && me.regions.includes(p.region)));
  const shown = new Set(projects.map((p) => p.id));
  const names = new Map((people ?? []).map((p) => [p.id as string, p.name as string]));

  // ---- budget summary
  const budget = projects.map((p) => {
    const change = isNum(p.grand_total) && isNum(p.base_total) ? p.grand_total - p.base_total : null;
    const perAcre = isNum(p.grand_total) && isNum(p.acre) && p.acre > 0 ? p.grand_total / p.acre : null;
    return { p, change, perAcre };
  });

  // ---- workflow
  const lastStep = new Map<string, string>();
  for (const a of steps ?? []) if (shown.has(a.project_id) && STEP.test(a.action) && !lastStep.has(a.project_id)) lastStep.set(a.project_id, a.at);
  const waiting = projects.filter((p) => STATUS[p.status]?.[1]).map((p) => {
    const at = lastStep.get(p.id) ?? p.created_at;
    return { p, dept: STATUS[p.status][1]!, at, days: Math.floor((now - new Date(at).getTime()) / DAY) };
  }).sort((a, b) => b.days - a.days);
  const perPerson = new Map<string, { steps: number; projects: Set<string> }>();
  for (const a of steps ?? []) {
    if (!a.by || !shown.has(a.project_id) || a.at < since || !STEP.test(a.action)) continue;
    const e = perPerson.get(a.by) ?? { steps: 0, projects: new Set<string>() };
    e.steps++; e.projects.add(a.project_id); perPerson.set(a.by, e);
  }
  const people30 = [...perPerson].map(([id, e]) => ({ name: names.get(id) || "Former member", steps: e.steps, projects: e.projects.size })).sort((a, b) => b.steps - a.steps);

  // ---- rates: each project's own rates against its template's master rate (templates loaded once each)
  const models = new Map<string, Model | null>();
  for (const stamp of new Set(projects.filter((p) => p.rates && Object.keys(p.rates).length).map((p) => p.template ?? ""))) {
    try { models.set(stamp, await loadModel(stamp || null)); } catch { models.set(stamp, null); }
  }
  const rateRows = projects.flatMap((p) => {
    const m = p.rates && Object.keys(p.rates).length ? models.get(p.template ?? "") : null;
    if (!m) return [];
    const where = new Map<string, { name: string; loc: string }>();
    for (const r of rateIndex(m)) for (const [loc, ref] of Object.entries(r.cells)) where.set(ref, { name: `${r.sheet} – ${r.item}`, loc });
    return Object.entries(p.rates!).filter(([, v]) => isNum(v)).map(([ref, v]) => {
      const master = masterRate(m, ref), own = v as number, w = where.get(ref);
      return { p, item: w?.name ?? ref, loc: w?.loc ?? LOC_KEY(p.location), master, own, diff: isNum(master) && master !== 0 ? (own - master) / master : null };
    });
  });

  // ---- chart data (components/report-charts.tsx; exact figures stay in the tables under "Show table")
  const liveOnly = projects.some((p) => p.kind === "live");
  // every region, even with no projects yet (user, 2026-11-28); sub-admins see only their own
  const regionStats = (isAdmin ? [...REGIONS] : REGIONS.filter((r) => me.regions.includes(r))).map((region) => {
    const list = budget.filter((b) => b.p.region === region && (!liveOnly || b.p.kind === "live") && isNum(b.p.grand_total));
    const total = list.reduce((s, b) => s + (b.p.grand_total as number), 0);
    const withArea = list.filter((b) => isNum(b.p.acre) && b.p.acre > 0);
    const acres = withArea.reduce((s, b) => s + (b.p.acre as number), 0), areaTotal = withArea.reduce((s, b) => s + (b.p.grand_total as number), 0);
    return { region, count: list.length, total, perAcre: acres > 0 ? areaTotal / acres : null };
  });
  const withTotal = budget.filter((b) => isNum(b.p.grand_total)).sort((a, b) => (b.p.grand_total as number) - (a.p.grand_total as number));
  const totalBars: HBar[] = withTotal.slice(0, 5).map(({ p, change }) => ({
    label: p.name, value: p.grand_total as number, display: crore(p.grand_total), href: `/projects/${p.id}`,
    marker: isNum(p.base_total) ? p.base_total : undefined,
    tip: [p.name, `Grand total ${crore(p.grand_total)}`, isNum(p.base_total) ? `R0 ${crore(p.base_total)} (${crore(change, true)})` : "No R0 yet", `${p.region} · ${revLabel(p.status, p.last_rev)}`],
  }));
  const unchanged = budget.filter((b) => isNum(b.change) && Math.abs(b.change) < 0.005).map((b) => b.p.name);
  const changeBars: DBar[] = budget.filter((b) => isNum(b.change) && Math.abs(b.change) >= 0.005).sort((a, b) => (b.change as number) - (a.change as number)).map(({ p, change }) => ({
    label: p.name, value: change as number, display: crore(change, true), href: `/projects/${p.id}`,
    tip: [p.name, `Change ${crore(change, true)}`, `R0 ${crore(p.base_total)} → now ${crore(p.grand_total)}`],
  }));
  const dotsIn = budget.filter((b) => isNum(b.p.grand_total) && isNum(b.p.acre) && b.p.acre > 0);
  const dots: Dot[] = dotsIn.map(({ p, perAcre }) => ({ label: p.name, x: p.acre as number, y: p.grand_total as number, href: `/projects/${p.id}`, tip: [p.name, `${p.acre} acres · ${crore(p.grand_total)}`, `${crore(perAcre)} per acre`] }));
  const sumX = dotsIn.reduce((s, b) => s + (b.p.acre as number), 0), sumY = dotsIn.reduce((s, b) => s + (b.p.grand_total as number), 0);
  const avgPerAcre = sumX > 0 ? sumY / sumX : undefined;

  const stageBars: HBar[] = [...DEPTS.map((d) => ({ key: d as string | null, label: `With ${dn(d)}` })), { key: null, label: "Approved / completed" }].map(({ key, label }) => {
    const n = projects.filter((p) => (STATUS[p.status]?.[1] ?? null) === key).length;
    return { label, value: n, display: `${n}`, tip: [label, `${n} project${n === 1 ? "" : "s"}`] };
  });
  const waitBars: HBar[] = waiting.slice(0, 10).map(({ p, dept, at, days }) => ({
    label: p.name, value: days, display: `${days} day${days === 1 ? "" : "s"}`, href: `/projects/${p.id}`,
    tone: days >= 7 ? "crit" : days >= 3 ? "warn" : undefined, tag: days >= 7 ? "7+ days" : days >= 3 ? "3+ days" : undefined,
    tip: [p.name, `Waiting for ${dn(dept)}`, `Since ${fmtShortDateTime(at)}`, STATUS[p.status]?.[0] ?? ""],
  }));
  const peopleBars: HBar[] = people30.map((x) => ({ label: x.name, value: x.steps, display: `${x.steps}`, tip: [x.name, `${x.steps} step${x.steps === 1 ? "" : "s"}`, `on ${x.projects} project${x.projects === 1 ? "" : "s"}`] }));

  const diffRows = rateRows.filter((r) => isNum(r.diff));
  const diffBars: DBar[] = [...diffRows].sort((a, b) => Math.abs(b.diff as number) - Math.abs(a.diff as number)).slice(0, 20).sort((a, b) => (b.diff as number) - (a.diff as number)).map((r) => {
    const pct = `${(r.diff as number) > 0 ? "+" : ""}${((r.diff as number) * 100).toFixed(1)}%`;
    return { label: r.item.split(" – ").pop() ?? r.item, sub: `${r.p.name} · ${r.loc}`, value: r.diff as number, display: pct, href: `/projects/${r.p.id}`, tip: [r.item, `${r.p.name} · ${r.loc}`, `Master ₹${money(r.master)} → project ₹${money(r.own)} (${pct})`] };
  });
  const bySheet = new Map<string, { n: number; projects: Set<string> }>();
  for (const r of rateRows) { const s = r.item.includes(" – ") ? r.item.split(" – ")[0] : "Other"; const e = bySheet.get(s) ?? { n: 0, projects: new Set<string>() }; e.n++; e.projects.add(r.p.id); bySheet.set(s, e); }
  const sheetBars: HBar[] = [...bySheet].sort((a, b) => b[1].n - a[1].n).map(([s, e]) => ({ label: s, value: e.n, display: `${e.n}`, tip: [s, `${e.n} project rate${e.n === 1 ? "" : "s"}`, `in ${e.projects.size} project${e.projects.size === 1 ? "" : "s"}`] }));

  const card = "grid gap-4 rounded-xl border border-line bg-sheet p-5";
  const th = "px-3 py-2", td = "px-3 py-2";
  const head = (cols: [string, boolean?][]) => <thead className="bg-well text-left text-xs uppercase tracking-wide text-soft"><tr>{cols.map(([c, right]) => <th key={c} className={`${th} ${right ? "text-right" : ""}`}>{c}</th>)}</tr></thead>;
  const link = (p: P) => <Link href={`/projects/${p.id}`} className="font-medium text-brand hover:underline">{p.name}</Link>;

  const budgetCsv: CsvCell[][] = budget.map(({ p, change, perAcre }) => [p.name, p.kind === "test" ? "Test" : "Live", p.region, p.location, STATUS[p.status]?.[0], revLabel(p.status, p.last_rev), num(p.acre), num(p.base_total, 4), num(p.grand_total, 4), num(change, 4), num(perAcre, 4), fmtDay(p.updated_at)]);
  const waitCsv: CsvCell[][] = waiting.map(({ p, dept, at, days }) => [p.name, p.kind === "test" ? "Test" : "Live", p.region, revLabel(p.status, p.last_rev), STATUS[p.status]?.[0], dn(dept), fmtShortDateTime(at), days]);
  const rateCsv: CsvCell[][] = rateRows.map((r) => [r.p.name, r.p.kind === "test" ? "Test" : "Live", r.item, r.loc, r.master, r.own, r.diff === null ? null : +(r.diff * 100).toFixed(2)]);

  return (
    <div className="grid gap-8">
      <div className="grid gap-3">
        <PageHeader title="Reports" description={<>{isAdmin ? "Every project, Live and Test." : `The Live projects of your region (${me.regions.join(", ") || "none yet"}).`} Read-only. Hover a bar or dot for its figures; each report&apos;s table opens under its charts and downloads as a CSV for Excel.</>} />
        <nav aria-label="Reports" className="flex flex-wrap gap-1.5">
          {[["#budget", "Budget summary"], ["#workflow", "Workflow"], ["#rates", "Rates"]].map(([h, l]) => <a key={h} href={h} className="rounded-full border border-line px-3 py-1 text-sm text-soft hover:border-brand hover:text-brand">{l}</a>)}
        </nav>
      </div>

      <section id="budget" className={`${card} scroll-mt-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Budget summary <span className="text-base font-normal text-soft">({projects.length} projects)</span></h2>
          <CsvDownload filename="budget-summary.csv" rows={budgetCsv} header={["Project", "Kind", "Region", "Rates location", "Status", "Revision", "Area (acre)", "R0 total (Rs Cr)", "Grand total (Rs Cr)", "Change vs R0 (Rs Cr)", "Cost per acre (Rs Cr)", "Last change"]} />
        </div>
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <ChartCard title="Totals by region" note={liveOnly ? "Grand totals of Live projects, added up per region." : "No Live projects yet: all projects, added up per region."}>
            <div className="grid gap-3">
              {regionStats.map((r) => <Stats key={r.region} items={[{ label: `${r.region} total`, value: crore(r.total) }, { label: "Projects", value: `${r.count}` }, { label: "Cost per acre", value: crore(r.perAcre) }]} />)}
            </div>
          </ChartCard>
          <ChartCard title="Grand total per project" note={withTotal.length > 5 ? `The 5 largest of ${withTotal.length}; all are in the table.` : "Largest first."}>
            <HBars data={totalBars} markerLabel="R0 total (frozen when Base Line submitted)" />
          </ChartCard>
          <ChartCard title="Change vs R0" note="Grand total now minus R0. Projects without a frozen R0 aren't shown.">
            <DivergingBars data={changeBars} over="Over R0" under="Under R0" empty={unchanged.length ? "No project has changed since its R0." : "No project has a frozen R0 yet."} />
            {unchanged.length > 0 && <p className="text-xs text-soft">{unchanged.length} project{unchanged.length === 1 ? "" : "s"} unchanged since R0: {unchanged.join(", ")}.</p>}
          </ChartCard>
          <ChartCard title="Area vs grand total" note="One dot per project with its area filled in. Click a dot to open the project.">
            <DotChart data={dots} xLabel="Area (acres)" yLabel="Grand total (₹ Cr)" ratio={avgPerAcre} ratioLabel={avgPerAcre ? `Average across these projects: ${crore(avgPerAcre)} per acre (dots above the line cost more per acre)` : undefined} empty="No project has both an area and a grand total yet." />
          </ChartCard>
        </div>
        <ShowTable>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              {head([["Project"], ["Region"], ["Status"], ["Revision"], ["Area (acre)", true], ["R0", true], ["Grand total", true], ["Change vs R0", true], ["Cost / acre", true]])}
              <tbody>
                {budget.map(({ p, change, perAcre }) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className={td}>{link(p)}{p.kind === "test" && <span className="ml-2 rounded bg-amber-soft px-1.5 py-0.5 text-xs text-amber">Test</span>}</td>
                    <td className={td}>{p.region}{p.location && p.location !== p.region ? <span className="text-soft"> · {p.location} rates</span> : ""}</td>
                    <td className={td}><StatusBadge status={p.status} /></td>
                    <td className={td}><RevTag>{revLabel(p.status, p.last_rev)}</RevTag></td>
                    <td className={`${td} text-right tabular-nums`}>{isNum(p.acre) ? p.acre : "–"}</td>
                    <td className={`${td} text-right tabular-nums`}>{crore(p.base_total)}</td>
                    <td className={`${td} text-right font-medium tabular-nums`}>{crore(p.grand_total)}</td>
                    <td className={`${td} text-right tabular-nums ${isNum(change) && change > 0.005 ? "text-bad" : isNum(change) && change < -0.005 ? "text-good" : "text-soft"}`}>{isNum(change) ? crore(change, true) : "–"}</td>
                    <td className={`${td} text-right tabular-nums`}>{crore(perAcre)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ShowTable>
      </section>

      <section id="workflow" className={`${card} scroll-mt-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Workflow <span className="text-base font-normal text-soft">({waiting.length} open)</span></h2>
          <CsvDownload filename="workflow.csv" rows={waitCsv} header={["Project", "Kind", "Region", "Revision", "Status", "Waiting for", "Since", "Days waiting"]} />
        </div>
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <div className="grid gap-4">
            <ChartCard title="Projects by stage" note="Which department each project is with now.">
              <HBars data={stageBars} empty="No projects yet." />
            </ChartCard>
            <ChartCard title="Workflow steps per person" note="Last 30 days. A step is a submit, a start of work, a send-back, an approval or a new version; saving a draft isn't counted.">
              <HBars data={peopleBars} empty="No workflow steps in the last 30 days." />
            </ChartCard>
          </div>
          <ChartCard title="Days waiting" note={waiting.length > 10 ? `The 10 longest waits of ${waiting.length} open projects, counted from the last workflow step; all are in the table.` : "Open projects, longest wait first, counted from the last workflow step."} legend={<><Swatch color="var(--chart-bar)" label="Under 3 days" /><Swatch color="var(--chart-warn)" label="3+ days" /><Swatch color="var(--chart-crit)" label="7+ days" /></>}>
            <HBars data={waitBars} empty="No open projects." />
          </ChartCard>
        </div>
        <ShowTable>
          <div className="grid gap-4">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                {head([["Project"], ["Revision"], ["Status"], ["Waiting for"], ["Since"], ["Days", true]])}
                <tbody>
                  {!waiting.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-soft">No open projects.</td></tr>}
                  {waiting.map(({ p, dept, at, days }) => (
                    <tr key={p.id} className="border-t border-line">
                      <td className={td}>{link(p)}</td>
                      <td className={td}><RevTag>{revLabel(p.status, p.last_rev)}</RevTag></td>
                      <td className={td}><StatusBadge status={p.status} /></td>
                      <td className={`${td} font-medium`}>{dn(dept)}</td>
                      <td className={`${td} text-soft`}>{fmtShortDateTime(at)}</td>
                      <td className={`${td} text-right tabular-nums ${days >= 7 ? "font-semibold text-bad" : days >= 3 ? "text-amber" : ""}`}>{days}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {people30.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full max-w-xl text-sm">
                  {head([["Person"], ["Steps (30 days)", true], ["Projects", true]])}
                  <tbody>{people30.map((x) => <tr key={x.name} className="border-t border-line"><td className={td}>{x.name}</td><td className={`${td} text-right tabular-nums`}>{x.steps}</td><td className={`${td} text-right tabular-nums`}>{x.projects}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </div>
        </ShowTable>
      </section>

      <section id="rates" className={`${card} scroll-mt-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Project rates <span className="text-base font-normal text-soft">({rateRows.length} across {new Set(rateRows.map((r) => r.p.id)).size} projects)</span></h2>
          <CsvDownload filename="project-rates.csv" rows={rateCsv} header={["Project", "Kind", "Item", "Location", "Master rate (Rs)", "Project rate (Rs)", "Difference (%)"]} />
        </div>
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <ChartCard title="Difference from the master rate" note={diffRows.length > 20 ? `The 20 biggest differences of ${diffRows.length}; all are in the table.` : "Each project rate against the master rate of its template."}>
            <DivergingBars data={diffBars} over="Above master" under="Below master" empty="No project has its own rates." />
          </ChartCard>
          <ChartCard title="Project rates per sheet" note="How many rates projects have set themselves, by the template sheet they're on.">
            <HBars data={sheetBars} empty="No project has its own rates." />
          </ChartCard>
        </div>
        <ShowTable>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              {head([["Project"], ["Item"], ["Location"], ["Master rate (₹)", true], ["Project rate (₹)", true], ["Difference", true]])}
              <tbody>
                {!rateRows.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-soft">No project has its own rates.</td></tr>}
                {rateRows.map((r, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className={td}>{link(r.p)}</td>
                    <td className={td}>{r.item}</td>
                    <td className={`${td} text-soft`}>{r.loc}</td>
                    <td className={`${td} text-right tabular-nums`}>{money(r.master)}</td>
                    <td className={`${td} text-right font-medium tabular-nums`}>{money(r.own)}</td>
                    <td className={`${td} text-right tabular-nums ${isNum(r.diff) && r.diff > 0 ? "text-bad" : isNum(r.diff) && r.diff < 0 ? "text-good" : "text-soft"}`}>{isNum(r.diff) ? `${r.diff > 0 ? "+" : ""}${(r.diff * 100).toFixed(1)}%` : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ShowTable>
      </section>
    </div>
  );
}
