// The app's emails, worded exactly as approved by Rishabh on 2026-11-16 (docs/Email templates.md). Don't change
// wording or recipients without his approval.
//
// Workflow emails (A3–A9): ONE email: the department that has to act next in To (an approval: the whole team), and
// the person who took the step in Cc. Nobody else. No email when a project is created (A1) or someone joins a team
// (A2): both dropped by Rishabh on 2026-11-18. The sign-in emails (B1–B4) go one per person: they carry a link that
// signs whoever opens it in.
// Sent through lib/server/mailer.ts. Without email set up nothing is sent: links are shown to the admin to share,
// and steps are logged as skipped.
import "server-only";
import { numCell } from "@/lib/budget";
import { createAdminClient } from "@/lib/supabase/admin";
import { NOTIFY, STATUS, type NotifyKey, type Status } from "@/lib/workflow";
import { sendMail } from "./mailer";

// ------------------------------------------------------------------ layout (HTML and plain text from one list)
type Part = { p: string[] } | { h: string } | { ul: string[] } | { btn: { href: string; label: string } };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const P = (...lines: string[]): Part => ({ p: lines });

function compose(parts: Part[]) {
  const html = parts.map((x) =>
    "p" in x ? `<p style="margin:0 0 14px">${x.p.map(esc).join("<br>")}</p>`
    : "h" in x ? `<p style="margin:18px 0 6px;font-weight:600">${esc(x.h)}</p>`
    : "ul" in x ? `<ul style="margin:0 0 14px;padding-left:20px">${x.ul.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`
    : `<p style="margin:20px 0 6px"><a href="${esc(x.btn.href)}" style="background:#0d6a5b;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">${esc(x.btn.label)}</a></p>`
      + `<p style="margin:0 0 14px;color:#4b5954;font-size:13px">${esc(x.btn.href)}</p>`).join("");
  const text = parts.map((x) =>
    "p" in x ? x.p.join("\n") : "h" in x ? x.h : "ul" in x ? x.ul.map((l) => `* ${l}`).join("\n") : `[ ${x.btn.label} ] → ${x.btn.href}`).join("\n\n");
  return {
    html: `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.5;color:#111a17">${html}<p style="margin:18px 0 0">Regards,<br>NeoLiv</p></div>`,
    text: `${text}\n\nRegards,\nNeoLiv`,
  };
}
const firstName = (name: string) => (name || "").trim().split(/\s+/)[0] || "";
const hello = (name: string) => P(firstName(name) ? `Hello ${firstName(name)},` : "Hello,");

// ------------------------------------------------------------------ B1–B4: sign-in emails, one per person
/** B1 / B2 (invite) and B3 (new link). Returns false when email isn't set up or fails (the admin then shares the link). */
export async function sendInvite({ to, name, from, link, again = false, microsoft = false, appUrl }: { to: string; name: string; from: string; link: string; again?: boolean; microsoft?: boolean; appUrl?: string }) {
  const who = from || "An admin";
  if (microsoft && !again && appUrl) {
    // B2: Microsoft sign-in is on, so the button opens the sign-in page; the link is the password route
    const { html, text } = compose([
      hello(name),
      P(`${who} has added you to NeoLiv Master Budget.`),
      { h: "How to sign in" },
      P("Open the NeoLiv Master Budget web application and press “Sign in with Microsoft”, using your NeoLiv account."),
      { ul: [`Username: ${to}`] },
      { btn: { href: `${appUrl}/login`, label: "Open NeoLiv Master Budget" } },
      P("Or you can set your password through the below link:", link, "The link works once and expires after an hour. The password is only for this web application."),
    ]);
    return (await sendMail({ to, subject: "NeoLiv Budget | You're invited to NeoLiv Master Budget", text, html })).ok;
  }
  // B1 (first invite) and B3 (a new link)
  const { html, text } = compose([
    hello(name),
    P(again ? `${who} has sent you a new link to set your password for NeoLiv Master Budget.` : `${who} has added you to NeoLiv Master Budget.`),
    { h: "Your login" },
    { ul: [`Username: ${to}`, "Password: set it with the button below. It is only for this web application and doesn't change any other account."] },
    { btn: { href: link, label: "Set your password" } },
    P("The link works once and expires after an hour. If it doesn't open, ask whoever added you, or an admin, for a new one."),
  ]);
  const subject = again ? "NeoLiv Budget | Your link to set your NeoLiv Master Budget password" : "NeoLiv Budget | You're invited to NeoLiv Master Budget";
  return (await sendMail({ to, subject, text, html })).ok;
}

/** B4: "Forgot password", to the person's own email. */
export async function sendPasswordReset({ to, name, link }: { to: string; name: string; link: string }) {
  const { html, text } = compose([
    hello(name),
    P("Here is your link to reset your NeoLiv Master Budget password."),
    { h: "Your login" },
    { ul: [`Username: ${to}`, "Password: set a new one with the button below."] },
    { btn: { href: link, label: "Set a new password" } },
    P("The link works once and expires after an hour. If you didn't ask for it, ignore this email: your password stays as it is."),
  ]);
  return sendMail({ to, subject: "NeoLiv Budget | Reset your NeoLiv Master Budget password", text, html });
}

// ------------------------------------------------------------------ A1–A9: workflow emails
interface Args {
  key: NotifyKey;
  project: { id: string; name: string; status: Status; location: string | null; acre: number | null; last_rev?: number | null };
  rev: number;
  note?: string;
  actor: { id: string; name: string; email?: string };
  /** kept for the callers; the approved emails name the person without departments */
  actorDepts?: string[];
  team: { user_id: string; dept: string }[];
}

export async function notify({ key, project, rev, note, actor, team }: Args) {
  const rule = NOTIFY[key];
  const db = createAdminClient();
  // To: the department that has to act next (an approval: the whole team), never the person who took the step.
  // Cc: only the person who took the step (user's decision, 2026-11-18). Nobody to tell: no email.
  const ids = [...new Set(team.filter((t) => t.user_id !== actor.id && rule.to.includes(t.dept as never)).map((t) => t.user_id))];
  if (!ids.length) return;
  const { data: people } = await db.from("profiles").select("id, name, email").in("id", ids);
  const to = (people ?? []).filter((p) => p.email) as { id: string; name: string; email: string }[];

  const appUrl = (process.env.APP_URL || "").replace(/\/+$/, "");
  const link = appUrl ? `${appUrl}/projects/${project.id}` : "";
  const open: Part[] = link ? [{ btn: { href: link, label: "Open project" } }] : [P("Open the NeoLiv Master Budget web application.")];
  const who = actor.name || "A colleague", name = project.name, loc = project.location || "—";
  const cc = actor.email && !to.some((p) => p.email.toLowerCase() === actor.email!.toLowerCase()) ? [actor.email] : [];
  const summary = (revision: string): Part[] => [{ h: "Project summary" }, { ul: [
    `Project: ${name}`, `Location: ${loc} · ${numCell(project.acre)} acre`, `Revision: ${revision}`, `Status: ${STATUS[project.status][0]}`,
  ] }];
  const next = (line: string): Part[] => [{ h: "Next step" }, P(line)];
  const noted = (label: string) => (note?.trim() ? [`${label}: ${note.trim()}`] : []);
  const tag = `${name} (${loc})`;

  // what each step says: subject, the opening lines, and the layout around them
  type Mail = { to: typeof to; subject: string; parts: Part[] };
  const mails: Mail[] = [];
  const group = (subject: string, parts: Part[]) => mails.push({ to, subject: `NeoLiv Budget | ${subject}`, parts: [P("Hello Team,"), ...parts] });
  switch (key) {
    case "submit": // A3
      group(`R${rev} submitted to Design: ${tag}`, [
        P(rev === 0 ? `${who} has submitted R0 of ${name} to Design. R0 is now frozen as the Base Line.` : `${who} has submitted the R${rev} draft of ${name} to Design.`, ...noted("Note")),
        ...next("Design to open the project and press Start design work."), ...summary(rev === 0 ? "R0 (frozen)" : `R${rev} (draft)`), ...open]);
      break;
    case "revise": // A4
      group(`New version R${rev} started: ${tag}`, [P(`${who} has started a new version, R${rev}, of ${name}.`, ...noted("Reason")),
        ...next("Design to open the project and press Start design work."), ...summary(`R${rev} (draft)`), ...open]);
      break;
    case "return_bd": // A5
      group(`R${rev} sent back to Base Line: ${tag}`, [P(`${who} has sent the R${rev} draft of ${name} back to Base Line.`, ...noted("What to change")),
        ...next("Base Line to make the changes and submit again."), ...summary(`R${rev} (draft)`), ...open]);
      break;
    case "design_done": // A6
      group(`R${rev} submitted to Operations: ${tag}`, [P(`${who} has submitted the R${rev} draft of ${name} to Operations.`, ...noted("Note")),
        ...next("Operations to open the project and press Start operations."), ...summary(`R${rev} (draft)`), ...open]);
      break;
    case "ops_submit": // A7
      group(`R${rev} submitted for approval: ${tag}`, [P(`${who} has submitted the R${rev} draft of ${name} to Management for approval.`, ...noted("Note")),
        ...next(`Management to review R${rev}, then Approve it or Send it back to Operations.`), ...summary(`R${rev} (draft)`), ...open]);
      break;
    case "approve": // A8
      group(`R${rev} approved: ${tag}`, [P(`${who} has approved R${rev} of ${name}. It is now frozen.`, ...noted("Note")),
        ...next("Nothing to do. When the drawings change, Base Line, Design or Operations can start a new version."), ...summary(`R${rev} (frozen)`), ...open]);
      break;
    case "mgmt_return": // A9
      group(`R${rev} sent back to Operations: ${tag}`, [P(`${who} has sent the R${rev} draft of ${name} back to Operations.`, ...noted("What to change")),
        ...next("Operations to make the changes and submit to Management again."), ...summary(`R${rev} (draft)`), ...open]);
      break;
  }

  for (const m of mails) {
    const log = (status: string, error?: string) =>
      db.from("email_log").insert({ project_id: project.id, step: key, rev, to: [...m.to.map((p) => p.email), ...cc.map((c) => `cc: ${c}`)], subject: m.subject, status, error: error ?? null });
    if (!m.to.length) { await log("skipped", "nobody on the team has an email"); continue; }
    const { html, text } = compose(m.parts);
    const r = await sendMail({ to: m.to.map((p) => p.email), cc, subject: m.subject, text, html });
    await log(r.ok ? "sent" : "skipped" in r && r.skipped ? "skipped" : "failed", r.ok ? undefined : r.error);
  }
}
