// Admin panel → Settings (admins): the Security and setup checks (moved here from the Overview, user 2026-11-27) and
// facts about this copy of the app. Nothing here changes data: each check says where its setting is changed.
import Link from "next/link";
import { SetupChecks } from "@/components/setup-checks";
import { adminOrRedirect } from "@/lib/server/admin-guard";
import { mailProvider } from "@/lib/server/mailer";
import { authSettings, microsoftReady, setupStatus } from "@/lib/server/setup-status";
import { createAdminClient } from "@/lib/supabase/admin";
import { APP_VERSION } from "@/lib/version";
import { CONTINGENCY } from "@/lib/budget";

const MAIL: Record<string, string> = { microsoft365: "Microsoft 365 (sent straight away)", powerautomate: "Power Automate flow (within about 2 minutes)", resend: "Resend" };

export default async function SettingsPage() {
  await adminOrRedirect();
  const db = createAdminClient();
  const [checks, settings, { data: current }, { count: templates }] = await Promise.all([
    setupStatus(),
    authSettings(),
    db.from("templates").select("stamp, modified, source").eq("is_current", true).maybeSingle(),
    db.from("templates").select("stamp", { count: "exact", head: true }),
  ]);
  const provider = mailProvider();
  const facts: [string, React.ReactNode][] = [
    ["App version", APP_VERSION],
    ["App address", process.env.APP_URL || "taken from the address you opened"],
    ["Current master template", current ? <>saved in Excel {String(current.modified || current.stamp)}{current.source ? <span className="block text-sm text-soft">{String(current.source)}</span> : null}</> : "none"],
    ["Master templates loaded", <>{templates ?? 0} · <Link href="/admin/templates" className="text-brand hover:underline">Master templates</Link></>],
    ["Contingency on the cost of construction", `${+(CONTINGENCY * 100).toFixed(2)}% (from the master template; used for the project list's cost per acre)`],
    ["Emails go through", provider ? MAIL[provider] ?? provider : "nothing (email is off)"],
    ["Sign-in", microsoftReady(settings) ? "Email and password, and Sign in with Microsoft" : "Email and password"],
  ];

  return (
    <div className="grid max-w-5xl gap-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-soft">How this copy of the app is set up. Each check says where its setting is changed (Supabase, Vercel or Power Automate); nothing here changes data.</p>
      </div>

      <section className="grid gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-soft">
          Security and setup{checks.some((c) => c.level === "bad") && <span className="ml-2 rounded bg-bad-soft px-1.5 py-0.5 text-xs normal-case tracking-normal text-bad">needs attention</span>}
        </h2>
        <SetupChecks checks={checks} />
      </section>

      <section className="grid gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-soft">About this app</h2>
        <dl className="grid gap-px overflow-hidden rounded-xl border border-line bg-line">
          {facts.map(([k, v]) => (
            <div key={k} className="grid gap-1 bg-sheet px-4 py-3 sm:grid-cols-[260px_1fr]">
              <dt className="text-soft">{k}</dt><dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="text-sm text-soft">Who can do what: <Link href="/admin/access" className="text-brand hover:underline">Roles &amp; access</Link>.</p>
    </div>
  );
}
