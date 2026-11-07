// Sending one email. Every email the app sends (sign-up links, password links, workflow steps) goes through here.
//
// Power Automate (like the original app, no IT needed): the app writes each email to the email_outbox table; a
// flow in the owner's Power Automate reads the private feed /api/email-feed/<token> every few minutes and sends
// it from their Outlook (docs/Email via Power Automate.md). Settings: POWER_AUTOMATE_FEED_TOKEN.
// Microsoft 365 Graph (for later, needs IT): the app signs in as its own Entra ID app registration (client credentials) and sends
// through Microsoft Graph from one mailbox, e.g. budget@neoliv.in. Exchange limits the app to that mailbox
// (see docs/IT request - Microsoft 365 email.md). Settings: MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MAIL_FROM.
// Resend (alternative): RESEND_API_KEY and EMAIL_FROM.
// Neither set: nothing is sent; callers treat that as "not set up" (the admin shares links by hand).
import "server-only";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";

export type MailResult = { ok: true } | { ok: false; skipped?: boolean; error: string };
export interface Mail { to: string; subject: string; text: string; html: string }

export const mailProvider = () =>
  process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET && process.env.MAIL_FROM ? "microsoft365"
  : process.env.POWER_AUTOMATE_FEED_TOKEN ? "powerautomate"
  : process.env.RESEND_API_KEY ? "resend" : null;

// ------------------------------------------------------------------ Power Automate (outbox + feed)
async function queueForFlow(m: Mail): Promise<MailResult> {
  const { error } = await createAdminClient().from("email_outbox").insert({ to: m.to, subject: m.subject, html: m.html, text: m.text });
  return error ? { ok: false, error: "Couldn't queue the email: " + error.message } : { ok: true };
}

// ------------------------------------------------------------------ Microsoft 365 (Graph)
let token: { value: string; expires: number } | null = null;

async function graphToken() {
  if (token && token.expires > Date.now() + 60_000) return token.value;
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(process.env.MS_TENANT_ID!)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.MS_CLIENT_ID!,
      client_secret: process.env.MS_CLIENT_SECRET!,
      scope: "https://graph.microsoft.com/.default",
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.access_token) throw new Error(`Microsoft sign-in failed (${res.status}): ${out.error_description?.split("\r\n")[0] ?? out.error ?? "unknown error"}`);
  token = { value: out.access_token, expires: Date.now() + (Number(out.expires_in) || 3600) * 1000 };
  return token.value;
}

async function sendMicrosoft(m: Mail): Promise<MailResult> {
  const from = process.env.MAIL_FROM!;
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`, {
    method: "POST",
    headers: { authorization: `Bearer ${await graphToken()}`, "content-type": "application/json" },
    body: JSON.stringify({
      message: { subject: m.subject, body: { contentType: "HTML", content: m.html }, toRecipients: [{ emailAddress: { address: m.to } }] },
      saveToSentItems: true, // a copy in the mailbox's Sent Items, for reference
    }),
  });
  if (res.status === 202) return { ok: true };
  const out = await res.json().catch(() => ({}));
  const hint = res.status === 403 ? " The app isn't allowed to send from this mailbox: check the Exchange role assignment in the IT request." : res.status === 404 ? ` Mailbox ${from} wasn't found.` : "";
  return { ok: false, error: `Microsoft 365 refused the email (${res.status}): ${out.error?.message ?? "unknown error"}.${hint}` };
}

// ------------------------------------------------------------------ Resend
async function sendResend(m: Mail): Promise<MailResult> {
  const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: process.env.EMAIL_FROM || "NeoLiv Budget <onboarding@resend.dev>", to: m.to, subject: m.subject, text: m.text, html: m.html,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function sendMail(m: Mail): Promise<MailResult> {
  const provider = mailProvider();
  if (!provider) return { ok: false, skipped: true, error: "Email isn't set up" };
  try {
    return provider === "microsoft365" ? await sendMicrosoft(m) : provider === "powerautomate" ? await queueForFlow(m) : await sendResend(m);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
