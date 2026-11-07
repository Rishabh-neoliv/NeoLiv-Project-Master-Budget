// GET /api/email-feed/<token>   the email outbox as an RSS feed, for the Power Automate flow that sends the
// app's emails from Outlook (docs/Email via Power Automate.md). The token is a long secret only the app and the
// flow know; without it there is nothing to see. Each item's summary is the email (to, subject, html) as
// base64 JSON, so the RSS reader can't alter the HTML. Items stay for 3 days; the flow sends each new one once.
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const sameSecret = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function GET(_req: Request, ctx: RouteContext<"/api/email-feed/[token]">) {
  const { token } = await ctx.params;
  const secret = process.env.POWER_AUTOMATE_FEED_TOKEN ?? "";
  if (secret.length < 32 || !sameSecret(token, secret)) return new Response("Not found", { status: 404 });

  const since = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
  const { data, error } = await createAdminClient().from("email_outbox").select("id, created_at, to, subject, html").gte("created_at", since).order("created_at", { ascending: false }).limit(100);
  if (error) return new Response("Feed unavailable", { status: 503 });

  const items = (data ?? []).map((e) => {
    const body = Buffer.from(JSON.stringify({ to: e.to, subject: e.subject, html: e.html }), "utf8").toString("base64");
    return `<item><title>${xml(e.subject)}</title><guid isPermaLink="false">${e.id}</guid><pubDate>${new Date(e.created_at).toUTCString()}</pubDate><description>${body}</description></item>`;
  }).join("");
  const rss = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>NeoLiv Master Budget email outbox</title><link>${xml(process.env.APP_URL || "https://example.invalid")}</link><description>Emails for Power Automate to send</description>${items}</channel></rss>`;
  return new Response(rss, { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}
