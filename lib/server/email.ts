// The app's emails: sign-up and password links, and one email per person a workflow step concerns
// (never to the person who took it). Sent through lib/server/mailer.ts (Microsoft 365, or Resend).
// Without email set up nothing is sent: links are shown to the admin to share, and steps are logged as skipped.
import "server-only";
import { crore, numCell } from "@/lib/budget";
import { createAdminClient } from "@/lib/supabase/admin";
import { NOTIFY, STATUS, dn, type NotifyKey, type Status } from "@/lib/workflow";
import { sendMail } from "./mailer";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const page = (lines: string[], action?: { href: string; label: string }) =>
  `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.5;color:#111a17">${lines.map((l) => (l ? esc(l) : "&nbsp;")).join("<br>")}`
  + (action ? `<p style="margin:20px 0"><a href="${esc(action.href)}" style="background:#0d6a5b;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">${esc(action.label)}</a></p><p style="color:#4b5954;font-size:13px">Or paste this link into your browser:<br>${esc(action.href)}</p>` : "")
  + `<p style="color:#4b5954;font-size:13px">NeoLiv Master Budget</p></div>`;

/** A sign-up or password link. Returns false when email isn't set up or fails (the admin then shares the link). */
export async function sendInvite({ to, name, from, link, again = false, microsoft = false, appUrl }: { to: string; name: string; from: string; link: string; again?: boolean; microsoft?: boolean; appUrl?: string }) {
  const subject = again ? "Your link to set your NeoLiv Master Budget password" : "You're invited to NeoLiv Master Budget";
  if (microsoft && !again && appUrl) {
    // Microsoft sign-in: no password needed, so the button goes to the login page
    const lines = [
      `Hello ${name},`, "",
      `${from || "The admin"} has added you to NeoLiv Master Budget.`, "",
      `Open the app and press “Sign in with Microsoft”, using your NeoLiv account (${to}).`, "",
      "Prefer a password? This link lets you set one; it works once and expires after an hour:", link,
    ];
    const r = await sendMail({ to, subject, text: [...lines, "", appUrl].join("\n"), html: page(lines, { href: `${appUrl}/login`, label: "Open NeoLiv Master Budget" }) });
    return r.ok;
  }
  const lines = [
    `Hello ${name},`, "",
    again ? `${from || "The admin"} has sent you a link to set your password for NeoLiv Master Budget.`
      : `${from || "The admin"} has added you to NeoLiv Master Budget. Open the link below to set your password; after that you sign in with this email.`,
    "", "The link works once and expires after an hour. If it doesn't open, ask the admin for a new one.",
  ];
  const r = await sendMail({ to, subject, text: [...lines, "", link].join("\n"), html: page(lines, { href: link, label: "Set your password" }) });
  return r.ok;
}

/** "Forgot password": a link to set a new password, sent to the person's own email. */
export async function sendPasswordReset({ to, name, link }: { to: string; name: string; link: string }) {
  const lines = [`Hello ${name},`, "", "Someone (hopefully you) asked to reset your NeoLiv Master Budget password. Open the link below to set a new one.", "", "The link works once and expires after an hour. If you didn't ask for it, ignore this email: your password stays as it is."];
  return sendMail({ to, subject: "Reset your NeoLiv Master Budget password", text: [...lines, "", link].join("\n"), html: page(lines, { href: link, label: "Set a new password" }) });
}

interface Args {
  key: NotifyKey;
  project: { id: string; name: string; status: Status; location: string | null; acre: number | null; grand_total: number | null };
  rev: number;
  note?: string;
  actor: { id: string; name: string };
  actorDepts: string[];
  team: { user_id: string; dept: string }[];
}

export async function notify({ key, project, rev, note, actor, actorDepts, team }: Args) {
  const rule = NOTIFY[key];
  const db = createAdminClient();
  const ids = [...new Set(team.filter((t) => rule.to.includes(t.dept as never) && t.user_id !== actor.id).map((t) => t.user_id))];
  if (!ids.length) return;
  const { data: people } = await db.from("profiles").select("id, name, email").in("id", ids);
  const to = (people ?? []).filter((p) => p.email);
  const st = STATUS[project.status];
  const appUrl = (process.env.APP_URL || "").replace(/\/+$/, "");
  const link = appUrl ? `${appUrl}/projects/${project.id}` : "";
  const lines = [
    `Hello ${rule.to.map(dn).join(" / ")} team,`, "",
    `${actor.name || "A colleague"}${actorDepts.length ? ` (${actorDepts.map(dn).join(" + ")})` : ""} has ${rule.verb(rev)}: ${project.name}.`, "",
    `Status: ${st[0]}`,
    `Location: ${project.location || "—"} · Area: ${numCell(project.acre)} acre`,
    `Grand total (COC): ${project.grand_total != null ? crore(project.grand_total) : "—"}`,
    ...(note ? [`Note: ${note}`] : []),
  ];
  const subject = `NeoLiv Budget: ${project.name} R${rev} – ${st[0]}`;
  const text = [...lines, "", link ? `Open the project: ${link}` : "Open the NeoLiv Master Budget app."].join("\n");
  const html = page(lines, link ? { href: link, label: "Open the project" } : undefined);

  const log = (status: string, error?: string) =>
    db.from("email_log").insert({ project_id: project.id, step: key, rev, to: to.map((p) => p.email), subject, status, error: error ?? null });
  if (!to.length) return void (await log("skipped", "nobody on the team has an email"));

  // one email each, so nobody sees the others' addresses
  const results = await Promise.all(to.map((p) => sendMail({ to: p.email, subject, text, html })));
  if (results.every((r) => !r.ok && "skipped" in r && r.skipped)) return void (await log("skipped", "email isn't set up"));
  const failed = results.filter((r): r is Extract<typeof r, { ok: false }> => !r.ok);
  await log(failed.length ? "failed" : "sent", failed.map((r) => r.error).join("; ") || undefined);
}
