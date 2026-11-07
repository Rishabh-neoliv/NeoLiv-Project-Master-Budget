# Work log

What was built, fixed and decided, newest first. Add a dated line whenever something lands, and keep
"Open items" current. (Times are India time.)

## Open items

- **Push to GitHub** from your own terminal: `git push -u origin main` (Claude's processes can't reach github.com).
- **Deploy to Vercel**: import the repo, add the env vars from `.env.example` (`APP_URL` = Vercel URL, no
  `SEED_PASSWORD`), then set Supabase Site URL / Redirect URLs to the Vercel URL.
- **Email**: set `POWER_AUTOMATE_FEED_TOKEN` and build the flow from `docs/Email via Power Automate.md`
  (or the Microsoft 365 route via IT: `docs/IT request - Microsoft 365 email.md`). Until then emails are skipped.
- **AI reading of documents** needs `ANTHROPIC_API_KEY` (user: "not now"). Waiting to be read: the
  (09-09-2026) MOM xlsx and the Guidelines PDF (partly scanned). `6071422233.PDF` is an SAP invoice, not a project doc.
- Imported NCR projects (9) have no team; assign when needed. Test projects still present: "UI Check Project",
  "Workflow Test 05526" (orphaned), and the user's "test12".
- Not built: spreading a typed road total over the road lines (old app's Road Length shortcut).

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
  and Submit is blocked until they're filled.

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
