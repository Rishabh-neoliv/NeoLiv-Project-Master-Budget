// GET /api/email-feed/<token>                       the email outbox as an RSS feed (last 3 days)
// GET /api/email-feed/<token>?after=<ISO>&until=<ISO> only the emails queued in that window (after < created ≤ until)
//
// For the Power Automate flow that sends the app's emails from Outlook (docs/Email via Power Automate.md). The
// token is a long secret only the app and the flow know; without it there is nothing to see. Each item's summary
// is the email (to, cc, subject, html) as base64 JSON, so the RSS reader can't alter the HTML. "to" and "cc" can
// hold several addresses separated by ";" (one email to a whole group); cc is "" when there is no copy.
//
// The window is how the flow gets v58's speed: Microsoft's RSS *trigger* checks at most every 30 minutes, so the
// flow runs on a Recurrence every 2 minutes instead and asks for exactly the 2 minutes before its scheduled time.
// Consecutive windows touch without overlapping, so every email is sent once (unless a run is skipped).
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const sameSecret = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const when = (s: string | null) => { if (!s) return null; const d = new Date(s); return Number.isNaN(d.getTime()) ? undefined : d; };
const DAY = 24 * 3600 * 1000;

export async function GET(req: Request, ctx: RouteContext<"/api/email-feed/[token]">) {
  const { token } = await ctx.params;
  const secret = process.env.POWER_AUTOMATE_FEED_TOKEN ?? "";
  if (secret.length < 32 || !sameSecret(token, secret)) return new Response("Not found", { status: 404 });

  const q = new URL(req.url).searchParams;
  const after = when(q.get("after")), until = when(q.get("until"));
  if (after === undefined || until === undefined) return new Response("after/until must be dates (ISO 8601)", { status: 400 });
  if ((after && !until) || (!after && until)) return new Response("give both after and until, or neither", { status: 400 });
  if (after && until && (until <= after || until.getTime() - after.getTime() > DAY)) return new Response("the window must be positive and at most a day", { status: 400 });

  // "*": the cc column only exists after migration 0004, and the feed must keep working before it
  let query = createAdminClient().from("email_outbox").select("*");
  query = after && until
    ? query.gt("created_at", after.toISOString()).lte("created_at", until.toISOString())
    : query.gte("created_at", new Date(Date.now() - 3 * DAY).toISOString());
  const { data, error } = await query.order("created_at", { ascending: false }).limit(100);
  if (error) return new Response("Feed unavailable", { status: 503 });

  const site = xml(process.env.APP_URL || "https://example.invalid");
  const items = (data ?? []).map((e) => {
    const body = Buffer.from(JSON.stringify({ to: e.to, cc: e.cc ?? "", subject: e.subject, html: e.html }), "utf8").toString("base64");
    return `<item><title>${xml(e.subject)}</title><link>${site}</link><guid isPermaLink="false">${e.id}</guid><pubDate>${new Date(e.created_at).toUTCString()}</pubDate><description>${body}</description></item>`;
  }).join("");
  const rss = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>NeoLiv Master Budget email outbox</title><link>${site}</link><description>Emails for Power Automate to send</description>${items}</channel></rss>`;
  return new Response(rss, { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}
