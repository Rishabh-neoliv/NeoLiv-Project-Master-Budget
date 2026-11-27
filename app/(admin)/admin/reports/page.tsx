// Admin panel → Reports: three read-only reports over the projects you can see (admins every project, sub-admins the
// Live projects of their region, as on the Overview), each with a CSV download for Excel.
//   Budget summary  every project's grand total, R0 and change, cost per acre; totals by region
//   Workflow        who each open project waits for and since when; workflow steps per person in the last 30 days
//   Rates           project rates that differ from the master rate, with the difference
// Nothing here changes data. Amounts are from the projects as stored (grand totals in ₹ crore).
import Link from "next/link";
import { CsvDownload, type CsvCell } from "@/components/csv-download";
import { RevTag, StatusBadge } from "@/components/status-badge";
import { crore, isNum, LOC_KEY, masterRate, rateIndex, type Model } from "@/lib/budget";
import { fmtDay, fmtShortDateTime } from "@/lib/dates";
import { kindOf, type Kind } from "@/lib/roles";
import { staffOrRedirect } from "@/lib/server/admin-guard";
import { loadModel } from "@/lib/server/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { dn, revLabel, STATUS, type Status } from "@/lib/workflow";
import { PageHeader } from "@/components/page-header";

interface P { id: string; name: string; region: string; location: string | null; kind: Kind; status: Status; last_rev: number | null; grand_total: number | null; base_total: number | null; acre: number | null; template: string | null; rates: Record<string, unknown> | null; created_at: string; updated_at: string }

// the steps that move a project along (lib/workflow.ts): their time is when the current wait began
const STEP = /^(Created project|Submitted|Start design work|Start operations|Send back|Approve|Create new version|Created R\d)/;
const DAY = 86400000;
// the time of this request (a helper, as the Overview does it: pages are rendered per request)
const nowMs = () => Date.now();
const num = (v: number | null | undefined, d = 2) => (isNum(v) ? +v.toFixed(d) : null);

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
  const regions = [...new Set(projects.map((p) => p.region))].sort().map((region) => {
    const list = budget.filter((b) => b.p.region === region && b.p.kind === "live");
    const total = list.reduce((s, b) => s + (isNum(b.p.grand_total) ? b.p.grand_total : 0), 0);
    const acres = list.reduce((s, b) => s + (isNum(b.p.acre) && isNum(b.p.grand_total) ? b.p.acre : 0), 0);
    return { region, count: list.length, total, perAcre: acres > 0 ? total / acres : null };
  }).filter((r) => r.count);

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

  const card = "grid gap-3 rounded-xl border border-line bg-sheet p-5";
  const th = "px-3 py-2", td = "px-3 py-2";
  const head = (cols: [string, boolean?][]) => <thead className="bg-well text-left text-xs uppercase tracking-wide text-soft"><tr>{cols.map(([c, right]) => <th key={c} className={`${th} ${right ? "text-right" : ""}`}>{c}</th>)}</tr></thead>;
  const link = (p: P) => <Link href={`/projects/${p.id}`} className="font-medium text-brand hover:underline">{p.name}</Link>;

  const budgetCsv: CsvCell[][] = budget.map(({ p, change, perAcre }) => [p.name, p.kind === "test" ? "Test" : "Live", p.region, p.location, STATUS[p.status]?.[0], revLabel(p.status, p.last_rev), num(p.acre), num(p.base_total, 4), num(p.grand_total, 4), num(change, 4), num(perAcre, 4), fmtDay(p.updated_at)]);
  const waitCsv: CsvCell[][] = waiting.map(({ p, dept, at, days }) => [p.name, p.kind === "test" ? "Test" : "Live", p.region, revLabel(p.status, p.last_rev), STATUS[p.status]?.[0], dn(dept), fmtShortDateTime(at), days]);
  const rateCsv: CsvCell[][] = rateRows.map((r) => [r.p.name, r.p.kind === "test" ? "Test" : "Live", r.item, r.loc, r.master, r.own, r.diff === null ? null : +(r.diff * 100).toFixed(2)]);

  return (
    <div className="grid gap-8">
      <div className="grid gap-3">
        <PageHeader title="Reports" description={<>{isAdmin ? "Every project, Live and Test." : `The Live projects of your region (${me.regions.join(", ") || "none yet"}).`} Read-only; each report downloads as a CSV that opens in Excel.</>} />
        <nav aria-label="Reports" className="flex flex-wrap gap-1.5">
          {[["#budget", "Budget summary"], ["#workflow", "Workflow"], ["#rates", "Rates"]].map(([h, l]) => <a key={h} href={h} className="rounded-full border border-line px-3 py-1 text-sm text-soft hover:border-brand hover:text-brand">{l}</a>)}
        </nav>
      </div>

      <section id="budget" className={`${card} scroll-mt-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Budget summary <span className="text-base font-normal text-soft">({projects.length} projects)</span></h2>
          <CsvDownload filename="budget-summary.csv" rows={budgetCsv} header={["Project", "Kind", "Region", "Rates location", "Status", "Revision", "Area (acre)", "R0 total (Rs Cr)", "Grand total (Rs Cr)", "Change vs R0 (Rs Cr)", "Cost per acre (Rs Cr)", "Last change"]} />
        </div>
        {regions.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {regions.map((r) => (
              <div key={r.region} className="rounded-lg border border-line p-3">
                <div className="text-sm text-soft">{r.region} · {r.count} Live project{r.count > 1 ? "s" : ""}</div>
                <div className="text-xl font-semibold">{crore(r.total)}</div>
                <div className="text-sm text-soft">{isNum(r.perAcre) ? `${crore(r.perAcre)} per acre` : "–"}</div>
              </div>
            ))}
          </div>
        )}
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
        <p className="text-xs text-soft">Region totals add up Live projects only. Change vs R0 is blank until R0 is frozen.</p>
      </section>

      <section id="workflow" className={`${card} scroll-mt-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Workflow <span className="text-base font-normal text-soft">({waiting.length} open)</span></h2>
          <CsvDownload filename="workflow.csv" rows={waitCsv} header={["Project", "Kind", "Region", "Revision", "Status", "Waiting for", "Since", "Days waiting"]} />
        </div>
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
        <h3 className="mt-2 font-semibold">Workflow steps in the last 30 days, by person</h3>
        {people30.length ? (
          <div className="overflow-x-auto">
            <table className="w-full max-w-xl text-sm">
              {head([["Person"], ["Steps", true], ["Projects", true]])}
              <tbody>{people30.map((x) => <tr key={x.name} className="border-t border-line"><td className={td}>{x.name}</td><td className={`${td} text-right tabular-nums`}>{x.steps}</td><td className={`${td} text-right tabular-nums`}>{x.projects}</td></tr>)}</tbody>
            </table>
          </div>
        ) : <p className="text-sm text-soft">No workflow steps in the last 30 days.</p>}
        <p className="text-xs text-soft">A step is a submit, a start of work, a send-back, an approval or a new version. Saving a draft isn&apos;t counted. Days waiting count from the last step (or from when the project was created).</p>
      </section>

      <section id="rates" className={`${card} scroll-mt-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Project rates <span className="text-base font-normal text-soft">({rateRows.length} across {new Set(rateRows.map((r) => r.p.id)).size} projects)</span></h2>
          <CsvDownload filename="project-rates.csv" rows={rateCsv} header={["Project", "Kind", "Item", "Location", "Master rate (Rs)", "Project rate (Rs)", "Difference (%)"]} />
        </div>
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
                  <td className={`${td} text-right tabular-nums`}>{isNum(r.master) ? r.master.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "–"}</td>
                  <td className={`${td} text-right font-medium tabular-nums`}>{r.own.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>
                  <td className={`${td} text-right tabular-nums ${isNum(r.diff) && r.diff > 0 ? "text-bad" : isNum(r.diff) && r.diff < 0 ? "text-good" : "text-soft"}`}>{isNum(r.diff) ? `${r.diff > 0 ? "+" : ""}${(r.diff * 100).toFixed(1)}%` : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-soft">Each project&apos;s rates against the master rate of the template its draft is on.</p>
      </section>
    </div>
  );
}
