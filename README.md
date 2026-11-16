# NeoLiv Master Budget (web app, dummy data)

The NeoLiv Master Budget app rebuilt as a sign-in web app: Next.js + React on Vercel, Supabase for login,
database and files, Resend for the workflow emails. People sign in and see only the projects they're on;
nobody needs the OneDrive folder.

The live OneDrive app (`NeoLiv Project Master Budget\NeoLiv Master Budget.html`) is untouched and keeps working.

## Tech stack

| Tech | Use |
|---|---|
| Next.js 16, React 19, TypeScript | Pages, routing, sign-in protection (`proxy.ts`), API routes |
| Tailwind CSS, shadcn/ui | Styling and components |
| `lib/engine/budget-engine.js` | The original formula engine, unchanged: runs the master Excel's formulas |
| `lib/engine/workbook.js` + JSZip | The original Excel builder, unchanged: makes each frozen `Master Budget Rn.xlsx` |
| Node.js API routes (`app/api`) | The only place a project changes: workflow, freezing, emails, admin |
| Supabase Auth / Postgres / Storage / Realtime | Login, data with row-level security, files, live updates |
| Resend | Workflow emails |
| Vercel, GitHub | Hosting and deploys |

## People and access

- **Admins** (there can be several; now Rishabh.soni.ext@neoliv.in and Shobha Shetty) use the **Admin panel**
  (`/admin`, its own layout):
  - **Overview:** every project and who has access, plus **Security and setup** (open sign-up off? Microsoft
    sign-in on? how emails go out, app address, AI reading), each red item with its fix.
  - **Team members:** add someone (with Microsoft sign-in on they can sign in straight away; the link is a
    password fallback), new link, remove or restore, see how each person signs in (Microsoft / Password),
    **Make admin** (adds another admin) and **Remove admin** (always leaves at least one).
  - **All projects.**
  - **Master templates:** upload a new master workbook (.xlsx). The app reads it, recalculates every formula and
    checks it gives exactly what Excel saved, then shows what changes (each rate, old → new, and the effect on a
    sample project) before **Add and make current**. Older templates stay listed: download one, or make it current
    again. New projects use the current template; open drafts get "Move to the new template". A workbook whose
    input rows moved, were added or renamed is refused: the Assumptions form has to be updated by a developer first.
- **My profile** (click your name in the top bar): change your name and password, see your username and your
  projects with your role in each.
- **Any member can add people** from **Members** in the top bar. The new member gets the sign-up link by email
  only (members never see the link, since it signs whoever opens it in). Members can also **Resend invite** to
  someone who hasn't signed in yet. Removing people and admin changes stay with admins.
- **Sign-in:** email + password, and "Sign in with Microsoft" with a NeoLiv account once set up
  (docs/Microsoft sign-in.md). Only people the admin added can get in.
- **The admin can also do everything a team member can**: create projects, edit drafts, take any workflow step
  in any department, and change any project's team, whether or not they are on it. The history records these
  as "Admin".
- **Roles are per project.** Whoever creates a project picks who is Base Line, Design, Operations and Management
  on it (one person may cover several). Base Line (or the admin) can change the team later on the Team tab.
- **Every member can view every project** (all tabs, Excel and file downloads). Changing one needs a place on
  its team: anyone on the team, from any department, can change the open draft (inputs, rates, files) at any
  stage; **Submit** and the workflow steps stay with the department whose turn it is, and Management approves.

## Workflow (same rules as the original app)

- Base Line → Design → Operations → Management.
- R0 freezes when Base Line submits it. R1 onwards freezes only when Management approves it; a new version
  can start only after that.
- Delta is always against R0 and isn't shown at R0.
- Each step emails the next department's people (never the person who took the step).

## Folders

```
app/
  login/, set-password/, auth/confirm/     sign-in, invite and password-reset links
  auth/callback/                           end of "Sign in with Microsoft" (docs/Microsoft sign-in.md)
  (app)/projects/                          project list, new project, project page (tabs)
  (admin)/admin/                           admin panel: overview + setup status, members, all projects
  api/projects/...                         create, save/submit draft, workflow actions, team, rates, files, Excel
  api/admin/users                          invite / update users (admin only)
components/                                budget table, assumptions form, badges
lib/
  engine/                                  original engine + Excel builder (do not edit casually)
  budget.ts                                snapshot, rowKind, marks... (shared by browser and server)
  workflow.ts                              statuses, who can do what, email rules
  server/                                  server-only: data access, freeze, workbook, email
  supabase/                                browser, server and admin clients
supabase/migrations/0001_init.sql          tables, access rules, storage buckets
supabase/migrations/0002_files_history.sql files, field history, email outbox
supabase/migrations/0003_all_members_view.sql every member can view every project
docs/                                      email guides, WORKLOG.md (what's built and open)
scripts/setup.mjs                          load templates, create dummy users, import old test projects
scripts/check-engine.mjs                   recalculates the old app's frozen versions and compares
_legacy/                                   extracted from the old app's HTML (git-ignored: real rates)
```

## Setup

1. **Supabase**: in your project, open the **SQL Editor**, paste `supabase/migrations/0001_init.sql` and run it.
2. **Keys**: copy `.env.example` to `.env.local` and fill in the Supabase URL, publishable key and secret key
   (Project Settings → API Keys), plus `SEED_PASSWORD` for the dummy users.
3. **Load templates, users and the old test projects**:
   ```bash
   node --env-file=.env.local scripts/setup.mjs "D:\OneDrive - NeoLiv\Rishabh\Project\NeoLiv Project Master Budget"
   ```
   This creates the admin login `admin@neoliv.test` (password = `SEED_PASSWORD`). Imported projects have no team.
4. **Supabase Auth settings** (Authentication):
   - Sign In / Providers → Email: turn **off** "Allow new users to sign up" (people are added from the app).
   - URL Configuration: Site URL = your app URL (`http://localhost:3000` locally, the Vercel URL later), and add both to Redirect URLs.
   - Emails → **Invite user** link: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/set-password`
   - Emails → **Reset password** link: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/set-password`
5. **Run it**: `npm run dev` and open http://localhost:3000.

### Deploy to Vercel

Push to the private GitHub repo, import it in Vercel, and add the same environment variables there
(`APP_URL` = the Vercel URL; leave out `SEED_PASSWORD`). Then set Supabase's Site URL to the Vercel URL.

## Checks

- `npx tsc --noEmit`, `npx eslint .`, `npm run build`
- `node scripts/check-engine.mjs "<old app folder>"`: every frozen version of the old app recalculates to the same
  Master Budget, line by line.
- `node --env-file=.env.local scripts/check-db.mjs`: the schema's tables and buckets exist.
- `node --env-file=.env.local scripts/check-access.mjs`: every signed-in member sees every project, signed-out
  visitors see none; nothing is writable from the browser; nobody can make themselves admin; sign-ups are off.
- `node --env-file=.env.local scripts/delete-user.mjs <email>`: deletes a test account completely.
- `node --env-file=.env.local scripts/make-admin.mjs <email> [--only]`: makes an existing person the admin
  (`--only` removes admin from everyone else).

## Project tabs

| Tab | What it does |
|---|---|
| Assumptions | The inputs, with step guidance for whoever's turn it is, a summary and Save / Submit beside them |
| Master Budget | The budget lines with Delta vs R0; download the draft (as saved) or a frozen revision as Excel |
| Rates | Project rates against the master rates. Anyone on the team can change them while a draft is open |
| Rate analysis | Compare any two of: master template, R0..Rn, the draft. Splits each change into quantity and rate parts |
| Files | Upload documents. A Master Budget workbook is read exactly; others are read by Claude on request. Values are suggestions: tick, apply to the draft, then save |
| Revisions | Frozen revisions; click a row to open it, Compare with R0, download Excel |
| Team / Activity | Who works on it; every step, with the fields each save changed (Field history), each person in their colour, filter by person |

A draft on an older master template shows "Move to the new template", which carries inputs by field name and
project rates by item, as the original app did. A frozen revision on an older template shows "Recalculate R<n>
with the current template" to Base Line (reason required; the old total stays in Activity).

From R1 on, every input that differs from R0 shows "Δ +x vs R0 (R0: y)" under it, and the road table has a
Delta vs Base Line (R0) column with each road's cost change.

New projects start with the master template's sample values. Typing a Road Length total spreads it over the
road lines in proportion; editing a line's length updates the total.

## Settings that turn features on

- `ANTHROPIC_API_KEY`: "Read with AI" on the Files tab (Claude Opus 5.5; documents are sent to Anthropic's API to be read).
- Email, first one configured wins: Microsoft 365 (`MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MAIL_FROM`),
  Power Automate (`POWER_AUTOMATE_FEED_TOKEN`, see `docs/Email via Power Automate.md`), or Resend
  (`RESEND_API_KEY` + `EMAIL_FROM`). Without any, emails are logged as skipped.
- Database update `supabase/migrations/0002_files_history.sql` (files table and bucket, field history) must be run once.

## Not built yet

Imported old versions have no Excel file; new freezes make one.
