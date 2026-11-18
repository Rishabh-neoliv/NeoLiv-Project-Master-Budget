# Work log

What was built, fixed and decided, newest first. Add a dated line whenever something lands, and keep
"Open items" current. (Times are India time.)

## Open items

- **Roles + Live/Test build: commit and push** (tested 2026-11-18, migration 0006 is run). After the push, the
  first real Live project is made from Admin panel → Live projects; make sub-admins from Team members.
- **Directory search when adding a member** (user's idea, 2026-11-18; "not now"): type a name, pick from the NeoLiv
  directory, name/email/department filled in. Needs an Entra app registration with User.Read.All + admin consent
  (also gives real departments, replacing the provisional list). Bundle into the IT request with Microsoft sign-in
  and the shared mailbox.
- **MMR rates:** the master workbook (template 20261102-1146) has 64 items with an NCR rate and a blank MMR rate,
  so they cost ₹0 in MMR projects (sample project: NCR ₹41.83 Cr vs MMR ₹11.89 Cr). Fix in the workbook and upload
  via Master templates; offered the user a list of the 64.
- **Security review 2026-11-17** (docs/Security review 2026-11-17.md): open redirect + two low robustness items all
  fixed; three hardening recs left (CSP/X-Frame headers; set Supabase min password length ≥ 8; keep the feed token
  out of logs).
- **Department list is provisional** (lib/departments.ts): replace with the confirmed list when the user has it.
  The NeoLifers Group's members/departments couldn't be read from Microsoft 365 (the connector lacks People.Read /
  Team.ReadBasic.All / directory permissions); the list is built from the group's emails + common departments.
- Confirm the Power Automate flow has Cc (Parse JSON schema with "cc", Send an email CC = Body cc): the first
  workflow email after the push should show the person who took the step in Cc.
- Master templates: a workbook with new or moved **input rows** is refused until the Assumptions form (sections in
  the template model) is updated in code. If that becomes common, add a form editor to the Admin panel.
- Tidy (user): delete the old flow "NeoLiv Budget emails" (RSS trigger; its 4 failures were the test emails), and
  the second Supabase project that Vercel's Supabase integration created (remove the integration in Vercel first;
  the app uses pcvsfstbhtmmvbmlbrgv only).
- **Microsoft sign-in**: Entra app registration + Supabase Azure provider + `NEXT_PUBLIC_MICROSOFT_SIGNIN=on` in
  Vercel (docs/Microsoft sign-in.md). Code is live.
- Optional: instant email from a shared mailbox (budget@neoliv.in) via IT's Microsoft 365 route; the 2-minute
  Power Automate flow then gets turned off.
- Before real data: Supabase Pro (backups) and Vercel Pro (commercial use).
- **AI reading of documents** needs `ANTHROPIC_API_KEY` (user: "not now"). Waiting to be read: the
  (09-09-2026) MOM xlsx and the Guidelines PDF (partly scanned). `6071422233.PDF` is an SAP invoice, not a project doc.
- Projects without a team (10, mostly the imported NCR ones): assign when needed.

## 2026-11-18

- **Always light theme** (user's choice): the app no longer follows the Windows dark-mode setting
  (app/globals.css; the dark colours are kept under `:root.dark`, unused, in case a theme switch is wanted).
  Checked in the browser with dark mode on: sign-in and My overview light. The Admin panel's dark green sidebar
  is part of its design and stays.
- **Roles and project kinds built** (agreed with the user point by point; README "People and access" has the table):
  - Admin / **Sub-admin** / Member (`lib/roles.ts`). Sub-admin: creates Live projects, sees and acts for any
    department on every Live project, gets sign-up links and removes/restores ordinary members; Admin panel with
    Overview (Live only, no setup checks), Team members, Live projects. Only admins make or remove admins and
    sub-admins (Team members → Make sub-admin).
  - **Live / Test** projects, fixed at creation: Admin panel → Live projects / Test projects, each with New; only
    admins create Test; Test projects can be deleted (with their versions and files), Live never. Members see only
    projects they're on (reverses 2026-11-13 "every member views every project"); Test projects only their team and
    admins. Migration 0006 (RLS `can_see_project`); existing projects all become Test.
  - New project moved off the members' Projects page into the Admin panel; Projects lists Live by place, then Test.
  - **My overview** (`/overview`), everyone's landing page: waiting for you (with what to do), my projects (role,
    revision, status, last change), recent changes on them in each person's colour, counts.
  - Team route: admins/sub-admins acting for all may take themselves off Base Line. check-access.mjs rewritten for
    the new rules (23 checks; +tag accounts on the user's address, random password).
  - tsc, eslint and build clean. The user ran migration 0006 (17 projects → Test). check-access.mjs 23/23.
    API test as each role (+tag accounts t64e445: admin, sub-admin, 4 departments, outsider): 24/24 (create Live/Test,
    delete, team changes, 404 for projects you can't see, remove/restore, make/remove sub-admin, links). Browser:
    member (overview, own projects only, Admin panel refused), sub-admin (3-page panel, Live only, Test/Templates
    refused, buttons only on ordinary members, submitted R0 on a Live project it isn't on → one email To Design, Cc
    the sub-admin), admin (5 pages, Delete only on Test, two-press delete worked). Test accounts and projects
    deleted; the one email left for the user's inbox.
- User's changes, presented as points and confirmed before building:
  - Emails: no email when a project is created (A1) or someone is added to a team (A2); each workflow step goes To
    the department that acts next (new version: Design only), Cc ONLY the person who took it; approval to the whole
    team. Reverses the 2026-11-16 "rest of the team in Cc". Wording unchanged; docs/Email templates.md updated.
  - Fixed: after "Create new version", the screen stayed on the frozen R1 (read-only) instead of the new R2 draft,
    so Design couldn't edit. The project screen now follows the draft opening/closing for everyone with it open.
    (Sonipat Test Project1 also had no team until the user added himself.) Checked in the browser as a Design member:
    R2 draft shown, 42 fields + 16 dropdowns editable, save accepted.
  - Answered: MMR projects use the MMR rate column (Master Budget looks rates up by Location), but 64 MMR rates are
    blank in the master workbook (see Open items).
- Tests: recipient rules 10/10 with throwaway accounts; then, on the user's instruction, re-run with his own address
  (rishabh.soni.ext+t7357…@neoliv.in, 6 roles): 11/11, 8 emails left queued for his inbox. From now on email tests
  use his address with +tags (CLAUDE.md, memory).
- Found yesterday's security probe had left 6 queued emails to fake @neoliv.test addresses; one invite was sent
  from the user's Outlook (2026-11-17 10:58 IST, no bounce). All deleted from the outbox; told the user.

## 2026-11-17

- Fixed the review's two low items: `readJson` helper turns a malformed JSON body into a 400 (not 500) across all 12 JSON-body routes; `storageError` helper returns 404 (not 500) when a file/revision/template storage object is gone. Re-probed on the dev server: 47 checks, 0 holes; tsc/eslint/build clean.
- Ran a security & operational review (user asked). 75 checks: operational (tsc/eslint/build/engine 10/10/template-import 15/15/db), access suite 12/12, a live API authorization probe with throwaway accounts (auth, non-member, non-admin, cross-project/IDOR, feed token, input validation, injection, privilege-escalation guards — all held), and a static review (secrets server-only, no client/git secret leak, no dangerous sinks). Found and FIXED an open redirect: /auth/callback and /auth/confirm only checked next.startsWith("/"), so next=//evil.com redirected off-site; added lib/safe-next.ts (rejects //, /\) and used it in both. Report in docs/Security review 2026-11-17.md; verified fix + tsc/eslint. Throwaway accounts/projects deleted.
- Tidy-up (user's OK): deleted the dummy accounts admin@neoliv.test and test.member@neoliv.test (scripts/delete-user.mjs,
  which now also clears "uploaded by" on files), the test projects "UI Check Project", "Workflow Test 05526" and
  "test12" with their 4 revision workbooks in storage, and the leftover `.env.vercel`. Left: 4 members (Rishabh and
  Shobha admins, Mayuresh, Kajal), 15 projects. check-access: 12/12.

## 2026-11-16

- Fixes from the user's screenshots:
  - Road table: a line added with "+" (or "+ Add road") offered only "No" until a length was typed, because the
    list shows only types that cost > ₹ 0 and an empty length costs ₹ 0. Now each type is tried with a 100 m length
    when the length is empty, every type is offered while the width is empty, and the line's own width is used
    (before, the template's default width for that line was). Checked in the local app on a throwaway project.
  - NCR projects listed under MMR (test12, test23, Workflow Test 05526: created with region MMR, Location later set
    to NCR). The project list now groups by Location (the rates), Admin → All projects orders by it, and saving a
    draft sets the region to the Location when that is NCR or MMR. Checked: list shows them under NCR; a save moved
    the throwaway project MMR → NCR.
  - New project form no longer says "Only the team can see the project".
- Drafted every email template for the user's approval in docs/Email templates.md (user: "every mail template first
  verify it from me then add").
- User ran migration 0005. Department test 6/6: saving a department works and it shows on the Members list.
- **Department on My profile** (user's request): a dropdown of company departments (provisional list in
  lib/departments.ts: Costing & Budgeting, Fund Raising, Human Resources from the NeoLifers Group emails; Business
  Development, Design, Operations, Management from the app; common real-estate ones; Other). Saved with the name
  ("Save details"); shown under each person on Members and Admin → Team members. Column `profiles.department`
  (migration 0005); pages read it with select("*") so they work before the migration. Tested before the migration:
  5/5 (page and dropdown load, name saves, unknown department refused, department save asks for 0005).
- **My profile** (user's request): click your name in the top bar (or the Admin panel sidebar). Change your name
  (profiles + the sign-in account, PATCH /api/profile), see your username (email, read-only: an admin changes it),
  change your password after confirming the current one, and see your projects with your role in each. Tested with
  a throwaway member: name saved, wrong current password refused, new password works and the old one doesn't.
  Not included (would need a database change): phone / designation fields. Admins can't yet rename others on screen.
- First live workflow email (Test121, R0 to Design) reached only Design + the submitter (as approved). User decided:
  **whose turn in To, the rest of the team in Cc** (plus the person who took the step), so everyone sees every step.
  Built and tested (throwaway project: A1, A3, A6 recipients exactly as intended, 4/4); templates doc updated.
- **Who changed what, in colour** (user's request): each person on a project gets a colour (team order; 8 colours,
  light and dark theme). Every input, road type / measurement / width (Assumptions) and project rate (Rates) changed
  in the revision on screen is tinted in the colour of whoever changed it last, with their name beside it; hovering
  shows who, when and from → to (and how many times). A legend ("Changes in the R1 draft: ● name 3") filters to one
  person. Your own unsaved edits show at once ("(not saved)"). Frozen revisions show the changes made in them.
  Activity: each entry in the person's colour, plus an Everyone/person filter. Built from the Activity log (no new
  table): saves/submits carry their revision, rate changes are placed by time. Amber "changed vs R0" stays for
  changes from earlier revisions. Save entries no longer say "(Base Line)" for R0 (anyone on the team can edit it).
  Checked in the local app with a throwaway project edited by three throwaway people (deleted afterwards).
- User ran migration 0004 (outbox cc column present, checked) and updated the flow (user: "done").
- **Email templates approved one by one** (13: A1–A9 workflow, B1–B4 sign-in) and built. User's changes: greeting
  "Hello Team," for group emails (first name for personal ones); no departments after names; no grand total / change
  vs R0; "web application" not "app"; "Regards, NeoLiv"; A1/A2 in the user's own wording (A2 personal, no team list,
  points to the Team tab); "Here is your link to reset…" in B4; Cc the person who took the step: yes.
  Workflow emails now go as ONE email to everyone concerned (all in To) + Cc; A2 and B1–B4 one per person. The
  draft email's "Note" is now only what the person typed (it used to include the stored revision reason).
  Mailer: several To, Cc for Microsoft 365, Power Automate (outbox `cc` column, migration 0004; falls back to no Cc
  before it) and Resend; feed adds `cc` (works before the migration).
  Tested on the local app: a throwaway project through every step (14 emails captured and deleted from the outbox
  at once, throwaway accounts): 16/16 checks, wording matches the approved text. B2 (Microsoft invite) not
  exercised: Microsoft sign-in isn't on.
- User pushed d699b90 and 1dd0acf and ran migration 0003. **All 12 access checks pass** (members not on a team can
  view a project and its team, can't change it). Live site has the new routes (/members, /admin/templates, templates
  API answer signed-out visitors with the login page / "Please sign in.").
- **Admin panel → Master templates** (user's choice of the next improvement): upload a new master workbook in the
  app instead of a script on Rishabh's PC. `lib/template-import.ts` reads the .xlsx (values, formulas incl. shared
  formulas, hidden rows, links to other workbooks), keeps only the cells the budget depends on, and builds the model;
  the input form and rate-table columns are carried over from the current template. Checked against all 16 legacy
  templates (`scripts/check-template-import.mts`): identical cells, sample values, Master Budget rows and dates where
  the form didn't change, and every formula (1,204–1,335 per template) recalculates exactly like Excel's saved values.
  Upload goes straight to the private bucket (signed upload), then the check report shows errors, each changed
  rate (old → new) and the effect on a sample project; Add (and make current), Make current, Download.
  Refused: any formula giving a different result than Excel, input sheets' labels moved/added/renamed, missing
  sheets, a workbook already loaded.
- Tested end to end with the user's OK: a copy of the current master with 3 rates changed and saved by Excel
  (Roadwork hard rock 200→250, GSB 2400→2500, precast wall 2000→2200) was uploaded by a throwaway admin and added as
  NOT current; 19/19 checks pass (report lists exactly those 3 rates, sample total +0.04 Cr as in Excel, members
  refused, duplicate refused). Also checked on screen. Fixed two bugs found this way: rate columns picked by
  position (the database reorders them) and two same-named rate items mixed up in the report. Then deleted: the
  template row and its file, temporary uploads, test accounts and the local copies. 16 templates, current unchanged.

## 2026-11-13

- Access changed (user's decision): **every member can view every project** (all tabs, Excel and file downloads;
  "View only" shown when not on the team), and **anyone on a project's team, from any department, can change the
  open draft, rates and files at any stage**. Submit, Approve and the other workflow steps stay with the department
  whose turn it is. Team changes stay with Base Line / admin. New `requireViewer` for downloads, `canSubmit` in
  lib/workflow.ts, migration 0003 (RLS select for all signed-in users). Saving now sends only the changed fields,
  so two people editing the same draft don't undo each other. check-access.mjs: 12 checks (outsider can view, can't
  write).
- Shobha Shetty was made admin by mistake with the old "Make admin" (which handed the role over and demoted
  Rishabh). Rishabh is admin again (make-admin.mjs); Shobha stays admin too.
- **Several admins allowed** (user's request): "Make admin" now adds an admin, "Remove admin" / "Stop being admin"
  takes it away, always leaving at least one; an admin must lose the role before they can be removed.
- **Any member can add members** (user's request): new **Members** page in the top bar (`/members`). Non-admins
  don't see sign-up links (a link signs whoever opens it in): the invite goes only to the new person's email, and
  they can "Resend invite" only to people who haven't signed in yet. Remove/restore/admin changes stay with admins.
- Tested against the local app with throwaway accounts (made and deleted by a scratch script, plus any queued
  test emails): 24/24 pass (member adds people without seeing the link, can't make admins or remove people;
  Make/Remove admin; Design saves R0 draft but can't submit; parallel saves keep each other's fields; non-team
  member can't save but can download the draft Excel). Pages not clicked through in a browser.
- Set-password page (first sign-up and password resets) now shows **Username: <their email>** (read-only, marked
  as username so browsers save it with the password), says the password is only for this app, and confirms
  "From now on sign in with <email> and this password" after saving. An expired/used link says so. The invite,
  new-link and Forgot-password emails now carry a "Username: <email>" line. Checked in the local app with a
  throwaway account (deleted).
- Drafted an email to Shobha about the project and her invite (the user sends it; Outlook draft failed: Microsoft
  503s). No account for Shobha in the app yet.

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
  Pushed (8f1e2e0); the live feed answers time windows (checked from here: empty window → 0 items, bad window
  → 400). The old RSS-trigger flow fired once after ~30 min: trigger fine, Parse JSON failed because Content
  was typed text, not an fx expression.
- **Email is live.** The user built "NeoLiv Budget emails 2min" (Schedule every 2 min → List all RSS feed items
  with the after/until fx URL → Apply to each [Parse JSON with item() → Send an email (V2)]); Forgot password
  test email arrived. Invites, password links and workflow emails now go out from the user's Outlook in ~2 min.
  Guide uses item() (the new designer names the loop "For each"/"Apply to each").
- User removed admin@neoliv.test (Admin panel) and invited kajal.shidruk@highbartech.com (invite email queued).
  check-access.mjs now makes its own throwaway admin instead of signing in as admin@neoliv.test: 10/11 pass;
  "sign-ups off" still failed: the user had switched it off in a second Supabase project (made by Vercel's
  integration). Switched off in the app's project pcvsfstbhtmmvbmlbrgv: **all 11 access checks pass.**
- Microsoft's "1 of your flows failed" email was the old RSS-trigger flow (4 failures = the test emails it
  couldn't parse). The 2-minute flow is fine; the old one is to be deleted.
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
