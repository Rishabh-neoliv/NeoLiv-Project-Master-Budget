# Security & operational review — 2026-11-17

Scope: the NeoLiv Master Budget web app (Next.js 16 + Supabase), tested at commit `61ab114` on `main`.
Method: automated operational checks, the access-control suite, a live authorization probe of every API route
against a local dev server (throwaway `@neoliv.test` accounts and projects, all deleted afterwards), and a static
review of secret handling, injection surfaces, auth redirects and git hygiene. Dummy data only; nothing was sent
anywhere and no real account or project was touched.

## Verdict

**Strong.** The core security model held on every test: the browser can only read (row-level security is
select-only), every change goes through a server API that checks the caller, and the authorization boundaries
(unauthenticated, non-member, non-admin, cross-project, privilege escalation) all refused what they should.
**One real vulnerability was found — an open redirect — and fixed during the review.** The rest of the findings
are low-severity robustness and hardening items.

Totals: **76 checks run — 1 vulnerability (fixed), 2 low robustness items (both fixed), 3 hardening recommendations.**

## Findings

### 1. Open redirect via the `next` parameter — Low/Medium — FIXED
`/auth/callback` and `/auth/confirm` took `?next=` and only checked `next.startsWith("/")`. A protocol-relative
value like `//evil.com` or `////evil.com` passes that check, and `new URL("//evil.com", origin)` resolves to
`https://evil.com/`. A crafted link on the app's own domain could bounce a user off-site after sign-in (phishing).
The one-time code/token is consumed server-side before the redirect, so no token leaks, but the redirect itself was
exploitable.
**Fix applied:** new `lib/safe-next.ts` rejects values that start with `//` or `/\`; both routes use it. Verified
against `//evil.com`, `////evil.com`, `/\evil.com` (all now fall back to an internal path) while real paths
(`/projects`, `/set-password`) still work.

### 2. Malformed JSON body returns HTTP 500 instead of 400 — Low — FIXED
An authenticated request with a broken JSON body (e.g. to `PATCH /api/profile`) returns 500. Auth is still enforced
first, and the response only echoes the JSON parser's message — **no stack trace, no data, no auth bypass.** It just
should be a clean 400. Recommended: a small `readJson(req)` helper that catches the parse error and throws a 400,
used where routes call `await req.json()`.
**Fix applied:** new `readJson(req)` in `lib/server/data.ts` throws a 400 on a bad body; all 12 JSON-body routes use it. Re-probed: a broken body now returns 400.

### 3. A file row whose storage object is missing returns 500 instead of 404 — Low — FIXED
If a `files` row exists but its object is gone from storage, the download route returns 500 (surfaced only by the
probe inserting a row without an object; normal uploads always have their object). Recommended: treat a missing
object as 404.
**Fix applied:** new `storageError()` helper returns 404 for a missing object (Supabase `NoSuchKey`), 500 otherwise; used in the file, revision and template download routes. Re-probed: a missing object now returns 404, a real object still redirects (302).

### 4. No security response headers (CSP / X-Frame-Options / Referrer-Policy) — Hardening
The app sets no Content-Security-Policy, X-Frame-Options or Referrer-Policy. Vercel adds HSTS on its domain, but
clickjacking and content-type protections are app-level. Recommended: add them in `next.config` headers or `proxy.ts`
(at least `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
and a CSP once script sources are enumerated).

### 5. Password minimum length is enforced only in the browser — Hardening
The set-password and change-password screens require 8+ characters client-side. The real floor is Supabase Auth's
"Minimum password length" setting. Recommended: set it to 8+ in Supabase so the rule can't be bypassed by calling
the API directly.

### 6. The email-feed token is a bearer secret in the URL — Info / by design
`/api/email-feed/<token>` authenticates by a secret in the path (so Power Automate's RSS reader can fetch it). This
is the documented design. The comparison is constant-time (`timingSafeEqual`) and length-gated, wrong/empty/short/
path-traversal tokens all return 404, and the response is `no-store` + `noindex`. Keep the token out of any request
logs, and rotate it if it is ever exposed (a rotation procedure already exists).

## What was tested and held (strengths)

**Access model (RLS):** 12/12 — a project is readable by every signed-in member but writable by none from the
browser; signed-out sees nothing; nobody can change status, freeze a version, change a team or self-promote by
writing directly; the templates bucket (real rates) is unreadable from the browser; sign-ups are off.

**API authorization probe (46 checks):**
- **Authentication:** every protected route returns 401 with no session.
- **Non-member:** an outsider cannot save, submit, change rates, change the team, run a workflow action, move the
  template or recalculate — all 403, and no write landed.
- **Non-admin:** a member cannot rename/remove members, make themselves or anyone admin, remove an admin, or
  upload / switch / download a master template — all 403; the member stayed non-admin.
- **Cross-project (IDOR):** cannot write to a project you're not on; cannot delete another project's file; a file id
  cannot be read through a different project's URL (404); every-member-can-view downloads are by design.
- **Feed token:** wrong / empty / short / truncated-by-one / path-traversal tokens all 404; correct token returns
  the RSS; constant-time comparison.
- **Input validation:** wrong types, unknown action keys, oversized names, invalid departments, bad emails, bad
  regions and empty teams are all rejected with 4xx, never a 500 (except the malformed-JSON case, finding 2).
- **Injection:** `Robert'); DROP TABLE projects;--<script>…` in a project name is stored verbatim as inert data
  (the Supabase client parameterizes queries) and rendered escaped by React; tables intact.
- **Privilege-escalation guards:** a non-admin adding a member is not handed the sign-up link (it would sign the
  opener in); a non-admin can't pull a sign-in link for someone who has already signed in; an admin can't be
  removed while still admin; the last admin can't be dropped.

**Operational checks:** `tsc` clean, `eslint` clean, production build OK, engine recalculation 10/10 legacy
versions identical, template-import 15/15 legacy templates identical, DB tables/buckets present.

**Secret handling & git hygiene:** the Supabase secret key is read only in `lib/supabase/admin.ts` (guarded by
`server-only`); the only `NEXT_PUBLIC_` values are the Supabase URL, the publishable key and a feature flag — no
secret is client-exposed; `.env*` and `/_legacy/` are git-ignored; no secret value appears anywhere in git history;
no `dangerouslySetInnerHTML`, raw SQL or string-built queries exist.

## Recommended next steps
1. (done) Open redirect fixed.
2. (done) `readJson` 400 helper (finding 2) and the missing-object 404 (finding 3).
3. Add security response headers (finding 4).
4. Set Supabase's minimum password length to 8+ (finding 5).
5. Before real data: Supabase Pro (backups) and the move off personal accounts already tracked in the work log.
