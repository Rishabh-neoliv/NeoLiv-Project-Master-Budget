# Work log

What was built, fixed and decided, newest first. Add a dated line whenever something lands, and keep
"Open items" current. (Times are India time.)

## Open items

- **Run `supabase/migrations/0008_access_levels_audit.sql`** in Supabase → SQL Editor (written 2026-11-27): adds the
  project access level (everyone starts at Edit) and the read-only role activity log. Until it is run, levels other
  than Edit can't be saved and nothing is logged; everything else works as before.

- **Current master template: 3.4 saved 15:39** (OSBL fixed, G90 = G91; checked 2026-11-27: no errors or warnings,
  NCR 43.5498 / MMR 41.8177 Cr). Two earlier 3.4 saves with the OSBL bug (G90 = G91/10000000 → OSBL ₹0, about
  ₹1.27 Cr short) are also loaded: **13:56 ("3.4f", 1 open draft) and 14:09 (3 open drafts, 1 frozen revision)**.
  Open drafts on them should "Move to the new template"; the frozen revision needs Base Line's "Recalculate". The
  upload now refuses this bug (2026-11-27).
- **For Parth, in the 3.4 workbook:** Survey rate (Preliminaries F48) links to a file on his PC (Sonipat Infra
  ConceptCost …DataSheet!C8): Excel on any other PC shows #REF! for the grand total; the app keeps the saved 17.97,
  which looks like an acreage, not a rate (type the rate). Alibaug/Nagpur have no total (Master Budget G58 Storm Water
  rate "" for them → #VALUE!). PHE!N18 = L16+#REF! (stray). UOM spelling (M3/m3), blank UOMs on Avenue Plantation, OWC
  has a quantity but no rate.
- **UI review 2026-11-27, item 8 on hold (user):** "Submit R0 to Design" shows twice on the project page (header and
  side panel). Keep it until the user says otherwise. Not done yet either: a phone layout for the project list (cards
  instead of a wide table) and project tabs in one scrolling row (review items 4 and 5).
- **3.2 has no total for Alibaug or Nagpur, in Excel too** (checked 2026-11-27 by recalculating a copy in Excel: NCR
  43.055735 / MMR 41.817657 Cr = the app; Alibaug/Nagpur #VALUE! in both). PHE!I39/J39 (Storm Water, Alibaug/Nagpur)
  = SUMPRODUCT(...)/F39 with F39 = FALSE → #DIV/0!, which reaches Master Budget G58 and the grand total. Alibaug/Nagpur
  also have almost no rates (Roadworks, PHE, OSBL none; Electrical 1 Alibaug). For Parth to fix in Excel.

- **Master template version 2 goes in as it is** (user's decision 2026-11-25; corrections are for Parth to make in
  the master Excel, emailed to him). Upload `D:DownloadsNeoLiv_Master_Budget_template_20261102-1146_version_2.xlsx`
  in Admin panel → Master templates after this change is pushed: it passes with one warning (5 mixed-unit lines,
  shown right in the app). Then "Add and make current": new projects start on it, open drafts get "Move to the new
  template" (12 new fields start from the workbook's sample values). Waiting on Parth's corrected Excel: units in
  Master Budget F42/F55/F82 (×10000000) and row 93 (G93 ÷10000000, G92 = G93, F93 ×10000000); delete Master Budget
  K–N and Q41/R41 (links to Dream Estate DD_R3 / Sonipat files); LT Cable unit Acre and MMR ÷ acre, MMR cable rates
  H35:H42 blank; NCR rates for Fire Fighting Lines, Pumps, OWC; Hard Rock % as a number; Signage / Street Furniture
  MMR swapped?; work notes F53/H38/H53; typos "Signanges", "Undergound". Comparison lists: `_legacy/compare/*.csv`.
- **Move everything to Microsoft Azure** (user's decision 2026-11-18: company IT standard). Hosting, database, files,
  sign-in, live updates and email all on Azure; Vercel and Supabase retired afterwards. Plan presented in chat,
  waiting for the user's OK on the open choices and for IT to provide the Azure resources. Nothing built yet.
- **Roles + Live/Test build: commit and push** (tested 2026-11-18, migration 0006 is run). After the push, the
  first real Live project is made from Admin panel → Live projects; make sub-admins from Team members.
- **Directory search when adding a member** (user's idea, 2026-11-18; "not now"): type a name, pick from the NeoLiv
  directory, name/email/department filled in. Needs an Entra app registration with User.Read.All + admin consent
  (also gives real departments, replacing the provisional list). Bundle into the IT request with Microsoft sign-in
  and the shared mailbox.
- **MMR rates:** the master workbook (template 20261102-1146) has 64 items with an NCR rate and a blank MMR rate,
  so they cost ₹0 in MMR projects (sample project: NCR ₹41.83 Cr vs MMR ₹11.89 Cr). Fix in the workbook and upload
  via Master templates; offered the user a list of the 64.
- **Rate names on the Rates tab** take the nearest line above without an NCR rate as their heading ("Excavation –
  25 mm dia", "Water Supply Main Line … – Sluice Valve Chamber"); and lines rated only for MMR aren't rate rows. Both
  come from the rate reader (rateIndex / rateRows); the names are also the keys that carry project rates to a new
  template, so a fix needs care. Raised with the user 2026-11-26: **keep as it is, don't fix until he says so.**
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
- **Reports charts:** not yet seen with real data (no `.env.local` on this PC); check Administration → Reports on
  Vercel after pushing.

## 2026-11-28

- **Reports as charts** (user: "all statistics in charts, graph or diagram"; chose charts first, table on click, all
  nine charts): `components/report-charts.tsx` (bars, over/under bars, dot chart, "Show table") on
  Administration → Reports. Budget: totals by region (Live only, all if no Live), grand total per project (15
  largest) with an R0 tick, change vs R0, area vs grand total with the average-per-acre line. Workflow: projects by
  stage, days waiting (3+ amber, 7+ red, each with its label), steps per person (30 days). Rates: difference from
  master (20 biggest), project rates per sheet. Every bar/dot has a hover tip; tables and CSVs unchanged, under
  "Show table". Chart colours are tokens in `app/globals.css` (`--chart-*`), checked with the dataviz palette
  validator in light and dark (the brand green failed its checks, so bars use a brighter teal).
- **Reports charts tidied** after seeing them with real data (user approved all 7): over/under values in their own
  right column (they ran out of the card); rate bars name the item in full with project · location under it; cards
  keep their own height, and one region shows as three figures (total, projects, cost per acre); unchanged projects
  listed in one line under Change vs R0 instead of empty rows; the dot chart zooms to where the dots are (average
  line kept, smaller outlined dots); Days waiting shows the 10 longest; Workflow puts stage and steps per person
  stacked beside Days waiting.

## 2026-11-27

- **Search and the bell on each page's heading line** (user rejected the slim top bar tried first: name shown twice,
  extra strip): `components/page-header.tsx` on all 15 pages: title with search and bell at the right end of its line,
  then the description with the page's buttons to its right. Narrow pages keep their narrow content below a
  full-width heading; the project and member pages put search and bell on their "← back" row. The top bar is removed.
  tsc, eslint, build clean; not checked in a browser.

- **Settings in tabs** (user picked the "worth doing" suggestions): General (version, environment, address, current
  template, currency and time, contingency, sign-in, email), Security & access (sign-up / sign-in status, who has
  which role, links to Roles & access and Role activity; password and session settings stay in Supabase), Notifications
  (email status, which events send an email, delivery history from the Power Automate outbox: last 50 with To, Cc,
  subject), Master templates (current one, recent uploads), System health (the setup checks), Data export (projects,
  members, role activity as CSV). Not done, on purpose: Supabase sign-in settings, configurable workflow, budget
  rules (they come from the master Excel), backups, audit retention, new email toggles.
  **Fixed:** "Current master template: none" (the page asked for a `source` column; file name and adder are in the
  model) and the doubled "To turn on: To turn it on". tsc, eslint, build clean; not checked in a browser.

- **Roles & access from the user's four designs (features, adapted to the app's rules; user's choices: all four,
  levels Edit / View only / Manage, no role email, two pages with charts on the admin dashboard):**
  - **Access levels** per project and department (migration 0008): View only = sees and downloads only; Manage = Edit +
    changes the team. Enforced in `requireMember` (all write routes), the project page (badge, note, no controls), the
    team route (Base Line or Manage may change the team; each department keeps an Edit/Manage person) and "waiting
    for you". Emails unchanged.
  - **Change role pop-up** (Team members → ⋯ → Change role…): current → new role, region, live permission preview,
    reason; one `set_role` API step (admin → sub-admin too; at least one admin stays). Replaces Make/Remove admin,
    Make/Remove sub-admin and Move region in the menu ("Stop being admin" stays on your own row).
  - **Manage project access pop-up** (⋯ → Project access…): searchable projects you manage with a department each,
    assigned projects with level select, bulk level / remove, confirmation before removing, access history (admins),
    effective permissions. `GET/PUT /api/admin/users/[id]/projects`.
  - **Role activity** (`/admin/access/activity`, admins): read-only audit log (database triggers block edits and
    deletes) of role, access, invite and member changes incl. refused attempts; cards (30 days, with trend), search,
    filters, tabs, details with before → after, CSV export and print to PDF.
  - **Roles & access page**: role cards, permission matrix (`PERMISSIONS`), quick actions (change role, project access,
    send invites → opens the invite pop-up, role activity), access levels, workflow.
  - **Admin dashboard**: budget by region (Live; Test until there are Live ones), projects by stage, waiting longest
    (days since the last step), team status (active / invited / links expired / removed). My overview unchanged.
  - tsc, eslint, build clean. Not checked in a browser or against the database; migration 0008 not run yet.

- **One sidebar, no separate Admin panel** (user picked option 1): every page has the same sidebar
  (`components/side-bar.tsx` + `side-nav.tsx`, replacing app-nav and admin-nav) with **My work** (My overview,
  Projects, My profile) and, for admins and sub-admins, **Administration** (Admin dashboard, Team members, Live
  projects, Reports, Roles & access; admins also Test projects, Master templates, Settings). The admin "Overview" is
  now **Admin dashboard**; "Open the app as a team member" and the "ADMIN PANEL" label are gone; on-screen "Admin
  panel" wording updated. Page addresses and access checks are unchanged.
- **Only admins and sub-admins invite people** (user, reversing 2026-11-18): Members is gone from ordinary members'
  menu; `/members` forwards (staff → Team members, others → My overview); `POST /api/admin/users` and the "link"
  action refuse ordinary members; search shows people only to staff. Roles & access, Team members, README and
  CLAUDE.md say so. tsc, eslint, build clean; not checked in a browser.

- **The app gets the Admin panel's look** (user chose "A and B"): every signed-in page now has a dark green sidebar
  (`app/(app)/layout.tsx`, `components/app-nav.tsx`) with icons for My overview, Projects, Members, My profile and
  (admins, sub-admins) Admin panel; the current template and the user card with Sign out at its foot; search and the
  bell at the top right of each page; a compact header on phones. **My overview**: icon cards (waiting, my projects,
  in progress, changes by others), a slimmer admin note, "Last step" cut to two lines (full text on hover), and
  "Created <date, time> by <name>" under each project. Trade-off: the sidebar takes about 240 px, so wide project
  tables scroll a little more on small laptops. tsc, eslint, build clean; not checked in a browser.

- **Downloads dated today** (user: a previous master template or frozen revision downloaded today showed its upload
  date in File Explorer, so "Group by date" never put it under Today). Cause: those downloads redirected to a storage
  link, which sends the upload date (Last-Modified) and the browser dates the saved file with it. Now the master
  template, frozen revision and Files-tab downloads go through the app (`lib/server/download.ts`: same bytes and file
  name, `Last-Modified` = now, no caching); the draft Excel uses the same helper. Check after the push in Explorer.
- **Project lists by region, newest first** (user): Admin panel → Live / Test projects and the app's Projects page
  show one table per region (the rates location: NCR, MMR, Alibaug, Nagpur, then others), Test projects split by
  region too ("Test projects · NCR"), each sorted by when the project was created (newest first), with "Created
  <date, time> by <name>" under each name. tsc, eslint and build clean; not checked in a browser.

- **People and admin pages rebuilt from the user's reference design (features only, not a copy; user's choices on
  the open parts: Reports = budget + workflow + rates, bell from activity with no table, Settings = setup + app info,
  quick actions = explain + link).** No database migration.
  - **Team members / Members** (`users-admin.tsx`): summary cards (members, active, pending invites with expired
    links, admins & sub-admins), tabs (all, admins & sub-admins, members, invited, removed), search + department /
    role / status filters, table (#, initials in a steady person colour, role badge with the sub-admin's region,
    department, projects, status incl. "Link expired" (sent > 1 h ago, from Supabase's invited/recovery time), last
    active), view 👁, edit ✏️ (name, department), ⋯ (role changes, move region, Remove), paging of 15, an
    Invitations panel (pending / expired, send again), Quick links, and an **invite pop-up**.
  - **Invite** (`POST /api/admin/users`): also department; role (admins; sub-admin needs a region); projects with
    their project department (admins any, sub-admins their region's Live projects; each logged as a team change on
    the project); "send the invitation email" can be unticked by admins and sub-admins (they get the link). The
    email wording is unchanged. **Edit** (`PATCH`): name and department, admins anyone, sub-admins ordinary members.
  - **Member page** (`/admin/members/[id]`): details, sign-in status and link times, their projects (department,
    revision, status, total; only projects the viewer can see) and recent activity.
  - **Reports** (`/admin/reports`): budget summary (totals, R0, change, cost/acre, Live totals by region), workflow
    (waiting for whom and for how many days, steps per person in 30 days), project rates vs master; each as CSV.
  - **Roles & access** (`/admin/access`): the fixed rules explained, with links to where each is changed.
  - **Settings** (`/admin/settings`, admins): Security and setup checks (moved from the Overview, which now only shows
    a note when one needs attention) and app info (version, current template, email and sign-in method).
  - **Top bar** (app and Admin panel): search (projects you can see, people, pages; `/api/search`) and a bell
    (`/api/notifications`: waiting for your department + others' changes on your projects in 14 days; "seen" kept in
    the browser). Admin sidebar has icons. Version web v5.
  - Build, tsc, eslint clean. **Not checked in a browser or against the database** (no .env.local here): the invite
    with role/projects, edit, and the new pages need trying after the push, ideally on a Test project first.

- **UI review of the live site, changes the user approved one by one (no Excel or data changes):**
  - **Rate analysis summary fixed** (`lib/rate-analysis.ts`, used by `components/rate-analysis.tsx`): Sonipat 1 showed
    Quantities +₹4.96 Cr and contingency −₹4.45 Cr for a +₹0.51 Cr change. Two causes: lines were paired by name, so a
    road line renamed by a width change ("10 m" → "9 m - Bitumen Road") counted in full and the old one was never
    subtracted; and heading rows were skipped even when their amount is their own calculation (1 Retaining wall =
    E85*F85/10000000). Now lines pair by row when both sides have the same layout (by name otherwise, with lines that
    disappeared subtracted), subtotals are any line adding up other Master Budget amounts, and heading rows with their
    own formula count. Checked offline on 3.4 with Sonipat 1's 40 changed inputs: +₹0.2343 quantities + ₹0.0117
    contingency (5.0%) = +₹0.2461 Cr; simple cases and a 3.2-vs-3.4 comparison also 5.0%. Only the Rate analysis tab.
  - **Money on one line:** `crore()` and the Master Budget table use non-breaking spaces ("₹ 42.79 Cr" no longer wraps).
  - **"Newer master template" banner** above the tabs (every tab), not inside Project Inputs.
  - **One ⓘ style:** the form's Excel-cell "i" uses `InfoTip` like the totals.
  - **Members:** role changes and Remove in a "⋯" menu (Remove last, red; each asks to confirm, admin changes now by
    a confirm dialog instead of a second press); search by name, email or department.
  - **Projects list:** search box; "–" for empty values; no "Test" tag inside the Test projects section. Tables moved
    to `components/project-groups.tsx` (the page still decides who sees what).
  - **Rates tab:** empty boxes say "Use master", project rates bold with an amber border and an amber bar on the row,
    quick links to each sheet with its count of project rates.
  - **Admin panel** compact on narrow screens (menu in one scrolling row, one-line user card).
  - **Developer text:** "web v4" only as a hover tooltip; Security and setup without "docs/…md" names; "Someone" →
    "Former member" (every signed-in user reads every name, so a missing one is a deleted account).
  - **Sign-in:** "Forgot password?" kept, styled as a link.
  - Item 9 (Overview vs Projects "Waiting for you") needed no change: same rule, both 1. Build, tsc, eslint clean;
    not checked in a browser (no .env.local here).

- **Totals display (user's 5 points, confirmed):** (1) Projects list: "Cost / acre (before 5%)" column = grand total
  ÷ 1.05 ÷ area (only the grand total is stored per project; `CONTINGENCY` in lib/budget.ts), and an ⓘ on the Grand
  total: Total COC + 5% contingencies = Grand total. (2) Master Budget table: Total column in ₹ Cr. (3) Grand Total
  card: ⓘ beside Cost / acre with the per-acre lines from the Master Budget itself (`grandTotalLines`). (4) Upload
  refuses a ₹ Cr amount divided by 1 crore twice (3.4's OSBL G90 = G91/10000000). (5) **Bug:** a new template kept
  the previous template's mixed-unit rows (`...prev`), so 3.4 (live, rows fixed in Excel) showed Preliminaries /
  Electrical / Water supply rates ×1 crore; fixed in buildModel, and the display now corrects a listed row only while
  it still is quantity × rate (so the live 3.4 shows right without a re-upload). `components/info-tip.tsx` (base-ui
  Popover). Tested offline on 3.1/3.2/3.4; tsc + eslint clean; not checked in the browser (no .env.local here).

- **Master workbook version 3.2**: "Landscape & Amenities" renamed **"Signage + Furniture"** (same columns B/C/E–H),
  added to `SHEET_RENAMES`. check-template-v2 on 3.2: labels ok, 1379 formulas as Excel, sample ₹43.0557 Cr = Excel,
  rate rows on every sheet; same 5 mixed-unit warning (rows now 41/54/79/80/91). Offline move test (old sheet names →
  3.2): 136 rate lines, none lost; a project's own rates on Water Supply / Landscape / Roadworks all carried, total
  unchanged. Existing projects stay on their template until "Move to the new template".

- **Master workbook version 3 / 3.1 refused on upload, fixed in code.** Two layout changes against the template of
  2026-11-25: the "Water Supply" sheet is now **"PHE"** (same columns), and Project Inputs!B64 reads "CCTV (Nos)".
  `SHEET_RENAMES` gains Water Supply → PHE (project rates follow it); `buildModel` uses a renamed sheet's new name
  when the old one is missing; the label check ignores a trailing unit in brackets. check-template-v2 on 3.1: labels
  ok, 1366 formulas as Excel, sample ₹38.1929 Cr = Excel, PHE 28 rate rows; same 5 mixed-unit warning as before.
  tsc + eslint clean. Not yet committed/pushed or uploaded.

## 2026-11-26

- **One region per sub-admin, picked when made** (user): "Make sub-admin" opens a region picker on the member's row
  (NCR, MMR, Alibaug, Nagpur; a click elsewhere cancels) and only "Make sub-admin for <region>" gives the role. On a
  sub-admin's row the region chips act as a choice of one; moving to another region asks for a second press. API:
  `make_subadmin` needs `region`, `set_region` replaces `set_regions` (one region; the column stays `regions`, no new
  migration). Wording "your regions" → "your region". Tested: 5 API checks (no region / two regions refused, make,
  move, non-sub-admin) and the picker in the browser (opens, closes on a click elsewhere, saves MMR); check-access
  26/26. Throwaway accounts deleted.
- **Base Line's work on R0 isn't shown** (user: "show nothing in base line history"; history starts with Design):
  activity from before R0 freezes, and R0's own steps (creation, saves, submit), is left out of the project's
  Activity tab, the who-changed-what colours, My overview and the Admin overview; R0 shows no tints and "Base Line"
  instead of a name. `afterBaseLine` / `withoutBaseLine` in lib/changes.ts; nothing is deleted from the database.
- **Input descriptions from the workbook** (user: show the Particulars where C39 was): lib/sheet-links.ts follows the
  template's formulas from each input to the working-sheet lines it feeds and names them by Particulars, with their
  heading and description rows (Sluice Valve Chamber → "Domestic Water Supply › Sluice Valve Chamber - 75x 75 x 120 cm
  – 1200 x 650 mm (Depth 1200 mm)"; Secondary Gate → "Entrance Gate - Others"). 102 of the version-2 form's 138
  inputs get one; inputs that feed none, more than 5 lines (Location, Project Area) or a line of the same name keep
  the plain-words text (lib/field-help.ts). The template's own note shows under it. Consideration not included (user).
- **Consideration column on the Rates tab**: the workbook's "Consideration" beside each line (Water Supply,
  Electrical, OSBL; 30 lines in version 2), searchable. Lines with no NCR rate (e.g. Water Supply Excavation, Main
  Line, which have only an MMR rate) aren't rate rows, so they and their considerations aren't on the Rates tab.
- Tested with throwaway accounts (Rishabh +tags) on a Live project: at Base Line no tints and an empty history; after
  the R0 submit only Design's steps listed (also on My overview), Design's changes tinted, R0 untinted; descriptions
  and the Consideration column shown. Accounts and project deleted (the R0-submit emails were left queued).
  tsc, eslint, template checks (15/15, version 2 clean) pass.

- **Sub-admins limited to regions** (user said "build it", recommendations taken): a project's region (NCR, MMR,
  Alibaug, Nagpur — the four rate locations) is picked at creation and no longer follows the Location input; an admin
  ticks each sub-admin's regions on Team members; a sub-admin sees, acts on, lists and creates Live projects only in
  those regions (none: only their own teams). "Domain" (departments) left out. lib/roles.ts takes the region;
  migration 0007 (profiles.regions, can_see_project; run by the user); check-access gains 3 region checks.
  Tested: check-access 26/26; 17 API checks with +tag accounts (no region → can't create; admin sets NCR+Alibaug;
  creates in NCR not MMR; MMR/Nagpur projects "not found"; Location change keeps the region; removing the role clears
  the regions); browser as sub-admin (Live list, Overview and New project show only NCR) and admin (region chips
  toggle and save). Test data deleted.
- Fixed: a two-press button left showing "Confirm: …" (e.g. Make sub-admin) now goes back as soon as you click
  anywhere else, press Escape, or after a few seconds. One helper (components/use-armed.ts) for all 9 such buttons:
  make/remove admin and sub-admin, make template current, delete Test project, submit from the side panel,
  recalculate a revision, save rates. Checked in the browser on a throwaway member (nothing changed).
- Project Inputs: the Excel cell codes (C39, C40 …) beside each field are replaced by a plain-words description
  under its name (lib/field-help.ts, ~60 fields, matched by name so old templates get them too); the cell is still
  in a small ⓘ beside the name (hover). The road table's column headings explain themselves on hover.

## 2026-11-25

- **Whole-system test** (user asked; version 2 already current, uploaded by the user): tsc, eslint, engine 10/10,
  old templates 15/15, version 2 check passed, check-access 23/23. End-to-end on localhost with 7 +tag accounts (tag
  sc51d2c): 47 API checks (one was a test mistake: a file download answers with a redirect to a signed link, confirmed
  working; the outsider gets "not found"): create Live/Test by role, visibility, R0 draft save, project rate, draft
  Excel (inputs on Project Inputs), a budget workbook uploaded and read exactly (92 values), the full workflow R0 →
  design → operations → sent back → approve R1 → new version R2 → sent back to Base Line with every refusal for the
  wrong department, R0/R1 Excel (Delta vs R0, revision history), an old-template draft moved onto version 2 (66
  carried). 8 workflow emails, each To the next department and Cc only the person who acted; none for creating
  projects or moving templates (left queued for the user's inbox). Browser as member and admin: every page and
  project tab, frozen R1 read-only, admin panel, templates page; no server or console errors. All test data deleted
  (15 projects, 5 people, version 2 current, as before). Fixed a stale comment in the file download route.
- **Version 2 accepted as it is** (the user didn't want a corrected copy; the copy I'd made was deleted): lines mixing ₹
  and ₹ Cr are now a warning, not a refusal. Each is classed from the sample (amount ≥ 1,000 → still in ₹, else the
  rate is in ₹ Cr) and kept in `model.rupeeAmountRows` / `croreRateRows`; the app shows them in the right units.
  The original file passes check-template-v2 (one warning). Form: Hard Rock % shown as a percentage.
- **Version-2 master workbook supported** (user said "build it"; plan agreed: tab renamed Project Inputs, the
  workbook's colour key decides what's typed vs calculated, its notes shown read-only, done before the Azure move):
  - A template now says where its inputs are (`inputSheet`): Assumptions (older) or Project Inputs (version 2).
    Engine keys, the frozen/draft Excel export (inputs written to Project Inputs as constants), exact reading of an
    uploaded budget workbook (refuses the other layout politely) and the form all follow it. lib/engine unchanged.
  - lib/template-forms.ts: the version-2 form (138 fields; new Project Duration, Terrain Type, Saucer Drain sides,
    Kerb stone multiplier per road, STP placement, OSBL MSEDCL distance, Electrical utility space, Chain link
    fencing, HT cables, Water supply OSBL), expected labels (70) and rate tables. Upload picks it for the first
    version-2 workbook; drop-down choices come from the workbook's lists.
  - Import: TRANSPOSE spills turned into plain formulas; Roadwork → Roadworks for rates and moving drafts; ₹ Cr
    amounts converted to rupees in the app and lines mixing units refused; "INFRA COST - TOTAL (A)" / "TOTAL COC
    (A + B)" recognised; the workbook's notes kept.
  - Checks: engine 10/10 old frozen versions, reader 15/15 old templates, the current template's sample and every
    line unchanged. Version 2 offline: 70 labels, 1,372 formulas = Excel, sample ₹44.2941 Cr = Excel, every line =
    Excel, old draft moves (66 carried, 12 new), Excel export right. Browser: a throwaway Test project on a
    non-current copy of version 2 (form, road table, notes, live total, save, Master Budget tab, draft Excel, R0
    freeze and its Excel re-read); all test data deleted, current template untouched.

## 2026-11-18

- **Layout fits laptop screens** (user: couldn't find Delete on Admin panel → Test projects; it was in a last
  column off screen because the table had a 980px minimum and scrolled sideways). Delete stays the last column; the
  Live/Test lists now have 5 columns (area under the name, stage = revision + status, R0 under the current budget),
  no fixed minimum width. Team members: sign-in method under the status, action buttons wrap. Project page: the
  summary panel sits beside the form from 1280px, above it (two columns) below that, so the road table keeps its
  720px. Badges no longer break over two lines. Checked at 1024 and 1280 (no sideways scrolling on Overview, Team
  members, Test projects, Projects, a project page); throwaway admin deleted after. Still wide by design: Rate
  analysis (1100px matrix) scrolls inside its box below ~1300px.
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
