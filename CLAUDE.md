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
node --env-file=.env.local scripts/check-db.mjs       # tables and buckets exist
node --env-file=.env.local scripts/check-access.mjs   # RLS (Live/Test, roles) + sign-ups off: 23 checks must pass (makes and removes its own test accounts)
node --env-file=.env.local scripts/delete-user.mjs <email>
node --env-file=.env.local scripts/make-admin.mjs <email> --only  # change who the admin is (also: Admin panel → Make admin)
node --env-file=.env.local scripts/test-email.mjs
```

## Access model and workflow

- **Three roles, two project kinds** (`lib/roles.ts`, migration 0006, agreed 2026-11-18; README has the full table).
  Roles: **admin** (`profiles.is_admin`; several allowed, at least one always kept), **sub-admin**
  (`profiles.is_subadmin`, given by admins), **member**. Projects are **Live** or **Test** (`projects.kind`), fixed at
  creation; only admins create Test, admins and sub-admins create Live; only Test can be deleted (admins).
- **Who sees a project** is RLS (`can_see_project`): admins all; sub-admins every Live + Test they're on; members only
  projects they're on. `requireViewer` applies the same rule (404 otherwise).
- **Who acts for every department without being on the team** (`actsForAll`): admins on any project, sub-admins on
  Live ones (recorded as "Admin" / "Sub-admin"). Everyone else acts as their own departments on their team.
- **Admin panel** (`app/(admin)/admin/`): admins see Overview (+ Security and setup), Team members, Live projects,
  Test projects, Master templates; sub-admins see Overview (Live only), Team members, Live projects
  (`staffOrRedirect` / `adminOrRedirect` in `lib/server/admin-guard.ts`). **My overview** (`/overview`) is everyone's
  landing page.
- **Any member can add people** (`/members`, same `UsersAdmin` component; API `POST /api/admin/users` takes any
  signed-in user). Only admins and sub-admins get the sign-up link back (a link signs whoever opens it in);
  members' invites go only by email, and they can resend only to people who haven't signed in yet. Sub-admins
  get links for, and remove/restore, ordinary members only; admin and sub-admin roles are changed by admins only.
- **Sign-in:** email + password, and "Sign in with Microsoft" (Supabase Azure provider, single-tenant NeoLiv,
  shown when `NEXT_PUBLIC_MICROSOFT_SIGNIN=on`; docs/Microsoft sign-in.md). Only people the admin added can get
  in: Supabase's "Allow new users to sign up" must stay **off** (check-access.mjs checks it).
- **Departments are per project** (`project_members.dept`), set by Base Line, an admin or (Live) a sub-admin.
- Changes need a place on the team or `actsForAll` (`requireMember`): anyone on the team, any department, can edit the open draft,
  rates and files at any stage (`canEditDraft`); Submit and workflow steps stay with whose turn it is (`canSubmit`,
  `ACTIONS`). User's decision, 2026-11-13. The screen sends only changed fields, so parallel edits don't clash.
- **Master templates** (Admin panel): admins upload a new master .xlsx; the model is built in the app
  (`lib/template-import.ts`, matches the old exporter on all 16 legacy templates) and refused unless every formula
  recalculates exactly like Excel and the input sheets' labels are unchanged. The Assumptions form (sections, options)
  and the rate tables' columns are hand-made and carried over from the current template: new input rows need a
  developer. Rate columns are picked by name (NCR / ALL), since jsonb doesn't keep key order.
- **Who changed what** (`lib/changes.ts`): each person a colour (`--who-1..8` in globals.css); inputs, road cells
  and rates changed in the shown revision are tinted by whoever changed them last. Derived from `activity.details`
  (saves carry `rev`; rate changes by time), so every save must keep recording its field changes.
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
app/(app)/profile, members     My profile (name, department, password, my projects); Members (add people)
lib/departments.ts             company departments for My profile (PROVISIONAL list until the user confirms it)
lib/roles.ts                   admin / sub-admin / member, Live / Test: who sees, creates, deletes, acts for all
app/(admin)/admin/...          admin panel: overview, members, live/ and test/ (lists + new), templates
app/api/...                    projects, drafts, actions, team, rates, files, extract, admin users, auth, email feed
lib/budget.ts, lib/workflow.ts shared logic (browser and server)
lib/template-import.ts         reads a master .xlsx into a model (Admin panel → Master templates); lib/server/templates.ts checks it
lib/server/                    data access, freeze, workbook, extract (Excel exact read + Claude), email
lib/engine/                    original engine (see hard rules)
supabase/migrations/           0001–0006 (all run)
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
