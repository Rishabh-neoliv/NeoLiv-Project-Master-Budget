# Work log

What was built, fixed and decided, newest first. Add a dated line whenever something lands, and keep
"Open items" current. (Times are India time.)

## Open items

- **Switch off "Allow new users to sign up" in Supabase** (found ON on 2026-11-12; check-access.mjs fails until it is).
- Delete the dummy accounts (admin@neoliv.test, test.member@neoliv.test) when the user agrees.
- **Microsoft sign-in**: Entra app registration + Supabase Azure provider + `NEXT_PUBLIC_MICROSOFT_SIGNIN=on` in
  Vercel (docs/Microsoft sign-in.md). Needs this code pushed first.
- **Email**: build the Power Automate flow against the live feed address (`docs/Email via Power Automate.md`),
  or the Microsoft 365 route via IT. Until then emails wait in the outbox.
- **AI reading of documents** needs `ANTHROPIC_API_KEY` (user: "not now"). Waiting to be read: the
  (09-09-2026) MOM xlsx and the Guidelines PDF (partly scanned). `6071422233.PDF` is an SAP invoice, not a project doc.
- Imported NCR projects (9) have no team; assign when needed. Test projects still present: "UI Check Project",
  "Workflow Test 05526" (orphaned), and the user's "test12".

## 2026-11-12

- Pushed to GitHub (user, from their own terminal): `main` with commits up to a1e2704. The user deployed it on
  Vercel; the live site works (settings imported from a trimmed `.env.vercel` with the 4 needed values).
- Added "Sign in with Microsoft (NeoLiv account)": button on the login page (shown when
  NEXT_PUBLIC_MICROSOFT_SIGNIN=on), `/auth/callback` with plain messages for not-added / removed accounts, and the
  setup guide docs/Microsoft sign-in.md. Not live until the Entra app and the Supabase provider exist.
- Added scripts/make-admin.mjs to hand the admin role to a real account.
- Found Supabase sign-ups still open (disable_signup false). Added that check to check-access.mjs.
- Rishabh.soni.ext@neoliv.in is now the only admin (`make-admin.mjs --only`); admin@neoliv.test is a normal account.
- Admin panel: "Make admin" on Team members (hands the role over, two-click, only to someone who has signed in;
  you become a normal member); a "Signs in with" column (Microsoft / Password); adding a member creates a
  confirmed account when Microsoft sign-in is on, so they can use Microsoft straight away (link = password
  fallback, email text changes too); Overview has a "Security and setup" card (open sign-up, Microsoft sign-in,
  email route and outbox count, app address, AI reading) with the fix for anything red. The user checked it on
  screen locally: looks good.
- Team members no longer says "emailed" when Power Automate only queued the email: it says "queued for your
  Power Automate flow" and asks the admin to send the link themselves until the flow runs. Gave the user the
  steps to build the flow (docs/Email via Power Automate.md).
- Live site: https://neo-liv-project-master-budget.vercel.app. Its email feed works. The feed key was shown in
  a screenshot, so a new one was made in .env.local / .env.vercel; the user puts it in Vercel and redeploys.
  APP_URL was missing in Vercel (feed showed example.invalid). User put the new key and APP_URL in Vercel and
  redeployed: the new feed address works.
- User built and saved the Power Automate flow "NeoLiv Budget emails" (RSS trigger on the feed, PublishDate →
  Parse JSON with a typed schema → Send an email (V2) with Body to / subject / html). Notes for next time: in
  the new designer RSS is found from "Automated cloud flow" (the add-trigger panel's search missed it); the
  schema must be generated, not the sample pasted; Content must be an fx expression, not typed text.
  First live test (Forgot password) pending.
- Test mode spun 10+ minutes: Microsoft's RSS trigger polls at most every 30 minutes (documented minimum polling
  interval 1800 s). Guide and app wording corrected from "a few minutes" to "about 30 minutes". The app queued
  every test email correctly. Instant email = Microsoft 365 route via IT.
- v58 was fast because it used OneDrive's file trigger. To match it without IT: the feed now takes
  `?after=&until=` (created_at in (after, until], max a day; tested locally incl. Power Automate's +05:30 dates),
  and the flow is rebuilt as Schedule every 2 min → RSS "List all RSS feed items" for the 2 minutes before its
  scheduled time → Apply to each → Parse JSON → Send email. Guide rewritten; app wording now "about 2 minutes".
  Needs this code pushed, then the user rebuilds the flow and turns the RSS-trigger version off.
- Hosting decision: Vercel + Supabase on free plans while testing with dummy data; Pro plans before real data.
  NeoLiv probably has Azure: Microsoft sign-in (Entra ID), shared-mailbox email and Claude via Foundry are the
  next Azure-side steps (need IT).
- Reviewed the claude.ai artifact "NeoLiv Master Budget" (v37, an older build of the same app, with 4 master
  templates and real rates inside; it is private). Compared it and v58 with this app.
- New projects start with the master template's sample values again (user's decision; v37 and v58 do this).
- Road Length shortcut: typing a total spreads it over the road lines in proportion; editing a line updates the
  total; a line with no length hides its other measurements.
- Recalculate a frozen revision on the current master template (Base Line or admin, reason required, two-click
  confirm). Updates base/grand totals, rebuilds the revision's Excel, logs old → new total in Activity.
  Tested on a throwaway project (deleted afterwards).
- "Δ vs R0" as in v58: a line under every input (and calculated value) that differs from R0, e.g.
  "Δ +500 vs R0 (R0: 1,925.60)", and a "Delta vs Base Line (R0)" column on the road table with each road's cost
  change and what changed (type, width, length…). Checked on NCR Test 1 (view only).
- Email automation: set POWER_AUTOMATE_FEED_TOKEN in .env.local and tested the chain locally (Forgot password
  → outbox → private RSS feed → decoded email with the link; wrong key → 404). Test email removed. What's left
  needs a public address: deploy, set the same kind of token in Vercel, then the user builds the 10-minute flow
  from docs/Email via Power Automate.md.

## 2026-11-07

- Added `CLAUDE.md` (rules, commands, conventions) and this work log.
- Committed everything to local `main` as `2737ac9`; remote `origin` set to
  `github.com/Rishabh-neoliv/NeoLiv-Project-Master-Budget`. Push blocked from Claude (DNS), user to push.
- Fixed a hydration error: all dates now come from `lib/dates.ts` (hand-built India time) instead of the
  browser's locale formatting.
- Ran the upload test (with OK, in a throwaway "Upload Test" project, since deleted): Master Budget R1.xlsx read
  exactly (76 values, same as the legacy R1), grand total 62.49635817178207 identical to legacy, download
  identical in size.
- Files tab shows a clear note until migration `0002` is run; user ran it (files, history, outbox, bucket ok).
- Fixed: new projects were filled with the template's sample data. They now start blank, list the missing inputs,
  and Submit is blocked until they're filled. (Reversed on 2026-11-12 at the user's request.)

## 2026-11-06

- Reviewed the old OneDrive app (single HTML, plain JS + JSZip, folder access, Power Automate email) and cleaned
  `_app\people.json`.
- Chose the stack: Next.js 16 + React, API routes as backend, Supabase, Vercel. Extracted the old engine and
  Excel builder; all 10 legacy frozen versions recalculate line by line.
- Schema `0001_init.sql` (profiles, templates, projects, members, versions, activity, email log, RLS, buckets);
  run by the user. `scripts/setup.mjs` loads templates, the admin and the old test projects.
- Access model changed on request: no global roles; one admin who onboards members, with a separate Admin panel,
  and who can do everything a member can. Roles are per project.
- UI reworked to match the old app's look, easier to read; clicking anywhere on a row opens it.
- Added: Rates tab, Rate analysis, compare revisions, download the live draft as Excel, field history, carry
  inputs to a new template, document upload (exact Excel read + AI extraction with Claude).
- Email: Microsoft 365 (Graph) from `Rishabh.soni.ext@neoliv.in`, or Power Automate like the old app (outbox +
  private RSS feed), or Resend; first one configured wins.
- Own password reset (`/api/auth/forgot`), invite links the admin can copy, member remove/restore.
