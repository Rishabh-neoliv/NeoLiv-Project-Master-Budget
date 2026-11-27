@AGENTS.md

# NeoLiv Master Budget (web app)

A login-based replacement for the old single-HTML Master Budget app that ran from a shared OneDrive folder
(`D:\OneDrive - NeoLiv\Rishabh\Project\NeoLiv Project Master Budget`). Data is dummy for now. Owner: Rishabh
(GitHub `Rishabh-neoliv`, `Rishabh.soni.ext@neoliv.in`). See [README.md](README.md) for setup and tabs, and
[docs/WORKLOG.md](docs/WORKLOG.md) for what has been built, fixed and left to do.

**Keep the work log current:** after any change that lands (a feature, a fix, a setup step, a decision the user
makes), add a dated line to `docs/WORKLOG.md` and update its "Open items". Update this file when a rule,
command or structure below changes.

## Hard rules

- **Email wording and recipients are approved by Rishabh** (docs/Email templates.md, 2026-11-16). Don't change any
  email without showing him the draft first, one by one, template then example.
- **Real master rates never go into git.** They live in `_legacy/` (extracted from the old app; git-ignored) and in
  Supabase Storage behind the login. Before any commit, check that nothing from `_legacy/`, no `.xlsx`/`.pdf`,
  and no `.env.local` is staged.
- **Secrets only in `.env.local` (and Vercel env vars).** Never print, commit or paste key values in chat.
  `.env.example` holds names only.
- **Uploads/tests with real documents only in a throwaway project**, with the user's OK, and delete it afterwards
  (project, storage copies, any local copies).
- **New projects start with the master template's sample values** (`startInputs`, as v37/v58 did; the user
  chose this on 2026-11-12, reversing the earlier "start blank"). The rates location comes from the region.
- **Don't edit `lib/engine/` casually.** It is the old app's `BudgetEngine` and Excel builder, verified line by
  line against the 10 legacy frozen versions (`scripts/check-engine.mjs`). Rerun that check after touching it.
- Never force-push. Commit only when the user asks.

## Stack

Next.js 16 (App Router, Turbopack, `cacheComponents`), React 19, TypeScript, Tailwind v4, shadcn/ui (base-ui).
Supabase: Auth (email/password, invite and recovery links), Postgres with RLS, Storage, Realtime. Hosting: Vercel
(deployed from GitHub `main`; settings in Vercel's Environment Variables). AI reading: `@anthropic-ai/sdk`, model `claude-opus-5-5`.

## Commands

```bash
npm run dev                                   # http://localhost:3000
npx tsc --noEmit; npx eslint .; npm run build # checks before committing
npx next typegen                              # after adding or renaming routes
node scripts/check-engine.mjs "D:\OneDrive - NeoLiv\Rishabh\Project\NeoLiv Project Master Budget"
node scripts/check-template-import.mts        # template upload reader vs the 16 legacy templates (after touching lib/template-import.ts)
npx jiti scripts/check-template-v2.mts "<v2 master .xlsx>"  # a version-2 workbook offline: labels, recalc, units, totals, moving a draft, Excel export
node --env-file=.env.local scripts/check-db.mjs       # tables and buckets exist
node --env-file=.env.local scripts/check-access.mjs   # RLS (Live/Test, roles, regions) + sign-ups off: 26 checks must pass (makes and removes its own test accounts)
node --env-file=.env.local scripts/delete-user.mjs <email>
node --env-file=.env.local scripts/make-admin.mjs <email> --only  # change who the admin is (also: Admin panel → Make admin)
node --env-file=.env.local scripts/test-email.mjs
```

## Access model and workflow

- **Three roles, two project kinds** (`lib/roles.ts`, migration 0006, agreed 2026-11-18; README has the full table).
  Roles: **admin** (`profiles.is_admin`; several allowed, at least one always kept), **sub-admin**
  (`profiles.is_subadmin`, given by admins), **member**. Projects are **Live** or **Test** (`projects.kind`), fixed at
  creation; only admins create Test, admins and sub-admins create Live; only Test can be deleted (admins).
- **Who sees a project** is RLS (`can_see_project`): admins all; sub-admins the Live projects of **their region**
  (one each, picked when an admin makes them sub-admin; `profiles.regions`, migration 0007, 2026-11-26) + any project they're on; members
  only projects they're on. `requireViewer` applies the same rule (404 otherwise). A project's region (NCR, MMR,
  Alibaug, Nagpur) is picked at creation and never changes (the Location input only picks rates).
- **Who acts for every department without being on the team** (`actsForAll`): admins on any project, sub-admins on
  Live ones of their region (recorded as "Admin" / "Sub-admin"). Sub-admins create Live projects only in their region. Everyone else acts as their own departments on their team.
- **One sidebar on every page** (`components/side-bar.tsx`, `side-nav.tsx`; user, 2026-11-27: no separate "app" and
  "Admin panel"): **My work** (My overview, Projects, My profile) for everyone, and **Administration**
  (`app/(admin)/admin/`) for staff: admins see Admin dashboard (`/admin`, was "Overview"), Team members (+ a page per
  member, `members/[id]`), Live projects, Test projects, Master templates, Reports, Roles & access, Settings (Security
  and setup + app info); sub-admins see Admin dashboard (Live only), Team members, Live projects, Reports (their
  region's Live projects), Roles & access (`staffOrRedirect` / `adminOrRedirect` in `lib/server/admin-guard.ts`).
  **My overview** (`/overview`) is everyone's landing page. Every top bar has a search box (`/api/search`) and a bell
  (`/api/notifications`, from activity; "seen" is remembered per browser, no table: user, 2026-11-27).
- **Only admins and sub-admins invite people** (user, 2026-11-27, reversing "any member can add people" of
  2026-11-18): Administration → Team members (`UsersAdmin`); `POST /api/admin/users` and the "link" action refuse
  ordinary members; `/members` forwards staff to Team members and everyone else to My overview. They get the sign-up
  link back (a link signs whoever opens it in). Sub-admins get links for, edit (name, department), and
  remove/restore, ordinary members only; admin and sub-admin roles are
  changed by admins only. The invite form can also set the department (anyone), the role (admins), the projects
  and their department on each (admins any project, sub-admins Live ones of their region: `actsForAll`), and skip the
  email (admins and sub-admins; the approved wording never changes).
- **Sign-in:** email + password, and "Sign in with Microsoft" (Supabase Azure provider, single-tenant NeoLiv,
  shown when `NEXT_PUBLIC_MICROSOFT_SIGNIN=on`; docs/Microsoft sign-in.md). Only people the admin added can get
  in: Supabase's "Allow new users to sign up" must stay **off** (check-access.mjs checks it).
- **Departments are per project** (`project_members.dept`), set by Base Line, an admin or (Live) a sub-admin.
- Changes need a place on the team or `actsForAll` (`requireMember`): anyone on the team, any department, can edit the open draft,
  rates and files at any stage (`canEditDraft`); Submit and workflow steps stay with whose turn it is (`canSubmit`,
  `ACTIONS`). User's decision, 2026-11-13. The screen sends only changed fields, so parallel edits don't clash.
- **Master templates** (Admin panel): admins upload a new master .xlsx; the model is built in the app
  (`lib/template-import.ts`, matches the old exporter on all 16 legacy templates) and refused unless every formula
  recalculates exactly like Excel and the input sheets' labels are unchanged. The input form (sections, options)
  and the rate tables' columns are hand-made and carried over from the current template: new input rows need a
  developer. Rate columns are picked by name (NCR / ALL), since jsonb doesn't keep key order.
- **Two input layouts** (`model.sheetLayout`): "V1" (inputs on Assumptions, all templates up to 2026-11-02) and
  "V2" (master of 25 Nov 2026: inputs on **Project Inputs**, notes on Assumptions, Roadwork → Roadworks, Master
  Budget amounts in ₹ Cr). A plain input key ("C8") means the model's `inputSheet` (`inputSheetOf`/`inputKey` in
  lib/budget.ts); never hard-code "Assumptions". The first V2 workbook is built on the form in
  `lib/template-forms.ts` (follows the workbook's colour key; labels match V1 so drafts move by name; anchors =
  labels that must sit beside the inputs); V2 drop-down choices come from the workbook's lists. TRANSPOSE spills
  become plain formulas at import (the engine has no TRANSPOSE). `model.amounts = "crore"`: snapshot() turns
  line amounts into rupees (the app's unit), and the upload refuses lines mixing rupees and crores.
  `SHEET_RENAMES` carries project rates across renamed sheets. Check a V2 workbook offline with check-template-v2.
- **Who changed what** (`lib/changes.ts`): each person a colour (`--who-1..8` in globals.css); inputs, road cells
  and rates changed in the shown revision are tinted by whoever changed them last. Derived from `activity.details`
  (saves carry `rev`; rate changes by time), so every save must keep recording its field changes.
  **Base Line's work on R0 is never shown** (no names, changes or tints; user, 2026-11-26): pages filter activity with
  `afterBaseLine` / `withoutBaseLine`, so the history starts with Design.
- Workflow: **Base Line → Design → Operations → Management**. R0 freezes when Base Line submits; R1+ freeze on
  Management approval; Delta is always against R0. Rules live in `lib/workflow.ts`.

## Code conventions

- **All writes go through API routes** using the secret key (`createAdminClient`). RLS policies are select-only;
  the browser can never write. Check access with `requireUser` / `requireViewer` / `requireMember` / `requireAdmin` /
  `requireStaff` in `lib/server/`, and the role rules in `lib/roles.ts` (never `me.is_admin` directly).
- Next 16 specifics: `proxy.ts` replaces middleware; use `RouteContext<"/path">`, `PageProps`, `LayoutProps`;
  session reads need `connection()` plus `<Suspense>` / `loading.tsx`; route files must not export arbitrary
  constants. Read `node_modules/next/dist/docs/` before using an unfamiliar API.
- **Dates:** always format with `lib/dates.ts` (hand-built, India time). `toLocaleString` causes hydration errors.
- Database changes: add a numbered file in `supabase/migrations/`; the user runs it in the Supabase SQL Editor.
- Emails (`lib/server/email.ts`): workflow steps send ONE email: the department that acts next in To (approval: whole
  team), only the person who took the step in Cc. No email at project creation or when someone joins a team
  (2026-11-18). Sign-in link emails go one per person. Outbox `to`/`cc` hold ";"-separated addresses.
- **Email tests use Rishabh's own address** with a +tag per role (`rishabh.soni.ext+design@neoliv.in` …), never
  fake domains, and leave the queued emails so he receives them (his instruction, 2026-11-18).
- Email (`lib/server/mailer.ts`) picks the first configured: Microsoft 365 Graph (`MS_*` + `MAIL_FROM`), then
  Power Automate (outbox table + private RSS feed, `POWER_AUTOMATE_FEED_TOKEN`), then Resend. With none, emails
  are logged as skipped.
- UI: clicking anywhere on a list row opens it (`ClickableRow`); theme colours are tokens in `app/globals.css`.

## Map

```
app/(app)/overview             My overview: everyone's landing page (waiting for you, my projects, recent changes)
app/(app)/projects/...         member app: list, project page (project-view.tsx holds the tabs)
app/(app)/profile, members     My profile (name, department, password, my projects); /members only forwards (see above)
components/side-bar.tsx        the one sidebar (My work + Administration), used by both layouts
lib/departments.ts             company departments for My profile (PROVISIONAL list until the user confirms it)
lib/roles.ts                   admin / sub-admin / member, Live / Test: who sees, creates, deletes, acts for all
app/(admin)/admin/...          admin panel: overview, members (+ [id]), live/ and test/ (lists + new), templates,
                               reports, access (roles explained), settings
app/api/...                    projects, drafts, actions, team, rates, files, extract, admin users, auth, email feed,
                               search, notifications
lib/members.ts                 a member as the people pages show them (status, link expiry); lib/server/members.ts builds it
lib/rate-analysis.ts           the Rate analysis tab's calculation (pairs lines by row on the same layout)
lib/budget.ts, lib/workflow.ts shared logic (browser and server)
lib/template-import.ts         reads a master .xlsx into a model (Admin panel → Master templates); lib/server/templates.ts checks it
lib/template-forms.ts          the version-2 input form (Project Inputs), its expected labels and rate tables
lib/sheet-links.ts             from the template's formulas: what each input feeds (form descriptions), Consideration per rate line
lib/server/                    data access, freeze, workbook, extract (Excel exact read + Claude), email
lib/engine/                    original engine (see hard rules)
supabase/migrations/           0001–0007 (all run)
scripts/                       setup, checks, test helpers
docs/                          email guides, WORKLOG.md
```

## Environment quirks (this PC)

- **GitHub is blocked for processes Claude starts** ("Could not resolve host: github.com", even in the app's
  terminal). Commit here; the user runs `git push` from their own terminal.
- The Semgrep plugin is turned off (its hook blocked every write). The Remember plugin's saves fail
  (`call-haiku` not found), so don't rely on it; use this file and the work log.
- No standing test logins (the dummy accounts were deleted on 2026-11-17). Tests make throwaway accounts on
  Rishabh's address with a +tag (`rishabh.soni.ext+…@neoliv.in`) and random passwords, and delete them afterwards,
  as check-access.mjs does. scripts/setup.mjs would
  recreate admin@neoliv.test: only run it on a fresh database.
