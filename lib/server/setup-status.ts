// What the admin needs to know about how the app is set up: is it closed to strangers, can people use their
// Microsoft account, how do emails go out. Read live from Supabase's public auth settings and this server's
// settings, for the Admin panel's Overview and for adding members.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { mailProvider } from "./mailer";

export interface AuthSettings { signupsOff: boolean | null; microsoftInSupabase: boolean | null }

/** Supabase's auth settings (the same public endpoint the browser can read). null = couldn't be read. */
export async function authSettings(): Promise<AuthSettings> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! }, cache: "no-store",
    });
    if (!res.ok) return { signupsOff: null, microsoftInSupabase: null };
    const s = await res.json();
    return { signupsOff: s.disable_signup === true, microsoftInSupabase: s.external?.azure === true };
  } catch {
    return { signupsOff: null, microsoftInSupabase: null };
  }
}

/** Microsoft sign-in is usable: switched on in Supabase and the button is shown in the app. */
export const microsoftReady = (s: AuthSettings) => s.microsoftInSupabase === true && process.env.NEXT_PUBLIC_MICROSOFT_SIGNIN === "on";

export type Level = "good" | "bad" | "warn" | "info";
export interface Check { label: string; level: Level; detail: string; fix?: string }

export async function setupStatus(): Promise<Check[]> {
  const db = createAdminClient();
  const since = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
  const [auth, outbox] = await Promise.all([
    authSettings(),
    db.from("email_outbox").select("id", { count: "exact", head: true }).gte("created_at", since),
  ]);
  const button = process.env.NEXT_PUBLIC_MICROSOFT_SIGNIN === "on";
  const appUrl = process.env.APP_URL ?? "";
  const online = !!process.env.VERCEL;
  const mail = mailProvider();
  const checks: Check[] = [];

  checks.push(auth.signupsOff === null
    ? { label: "Open sign-up", level: "warn", detail: "Couldn't read Supabase's settings just now." }
    : auth.signupsOff
      ? { label: "Open sign-up is off", level: "good", detail: "Only people you add can get in." }
      : { label: "Open sign-up is ON", level: "bad", detail: "Anyone with the app's public key could create an account.",
          fix: "Supabase → Authentication → Sign In / Providers → turn off “Allow new users to sign up” → Save." });

  checks.push(auth.microsoftInSupabase && button
    ? { label: "Sign in with Microsoft is on", level: "good", detail: "People sign in with their NeoLiv account." }
    : auth.microsoftInSupabase
      ? { label: "Microsoft sign-in is set up but hidden", level: "warn", detail: "Supabase has it on; the login page doesn't show the button yet.", fix: "Vercel → Settings → Environment Variables → NEXT_PUBLIC_MICROSOFT_SIGNIN = on → Redeploy." }
      : button
        ? { label: "Microsoft button shown, but not set up", level: "bad", detail: "The login page shows the button, but Supabase's Azure provider is off, so it fails.", fix: "Finish part A and B of docs/Microsoft sign-in.md, or remove NEXT_PUBLIC_MICROSOFT_SIGNIN." }
        : { label: "Microsoft sign-in is off", level: "info", detail: "People sign in with email and password.", fix: "docs/Microsoft sign-in.md (needs an Entra app registration)." });

  checks.push(mail === "microsoft365"
    ? { label: "Email: Microsoft 365", level: "good", detail: `Sent straight away from ${process.env.MAIL_FROM}.` }
    : mail === "powerautomate"
      ? { label: "Email: Power Automate", level: "good", detail: `Your flow sends them from Outlook within about 2 minutes. ${outbox.count ?? 0} email(s) queued in the last 3 days.`,
          fix: online ? "If they don't arrive, check the flow's Run history (docs/Email via Power Automate.md)." : "The flow can only reach the online app, not this computer." }
      : mail === "resend"
        ? { label: "Email: Resend", level: "good", detail: "Sent through Resend." }
        : { label: "Email is off", level: "warn", detail: "Nothing is emailed: copy sign-up links and send them yourself.", fix: "docs/Email via Power Automate.md" });

  checks.push(online && (!appUrl || /localhost|127\.0\.0\.1/.test(appUrl))
    ? { label: "App address isn't set", level: "bad", detail: "Links in emails would point to the wrong address.", fix: "Vercel → Settings → Environment Variables → APP_URL = this site's address → Redeploy." }
    : { label: "App address", level: "good", detail: appUrl || "taken from the address you opened" });

  checks.push(process.env.ANTHROPIC_API_KEY
    ? { label: "Reading documents with AI is on", level: "good", detail: "“Read with AI” works on the Files tab." }
    : { label: "Reading documents with AI is off", level: "info", detail: "Master Budget workbooks are still read exactly; other documents need an Anthropic key." });
  return checks;
}
