# Sign in with Microsoft (NeoLiv accounts)

People sign in with their NeoLiv Microsoft account instead of a separate password: company two-step sign-in
applies, and when IT disables someone's NeoLiv account they can no longer get in. Passwords keep working
alongside (useful for the admin if Microsoft is down).

**Who can get in:** only people the admin has already added in the app. New sign-ups stay switched off in
Supabase, and the Microsoft app accepts NeoLiv accounts only ("My organization only").

Three parts: **A** in Azure (you, if your account may register apps, otherwise IT), **B** in Supabase (you),
**C** in Vercel (you). About 20 minutes.

---

## Before anything: switch off open sign-up in Supabase (do this now)

Supabase → your project → **Authentication → Sign In / Providers** → under **User Signups**, turn **off**
"Allow new users to sign up" → **Save**.

Without this, anyone with the app's public key could create an account. `scripts/check-access.mjs` checks it.

---

## A. Register the app in Microsoft Entra ID

At **portal.azure.com**, signed in with your NeoLiv account:

1. **Microsoft Entra ID → App registrations → + New registration**
   - **Name:** `NeoLiv Master Budget`
   - **Supported account types:** *Accounts in this organizational directory only (NeoLiv only – Single tenant)*
   - **Redirect URI:** platform **Web**, value: your Supabase URL + `/auth/v1/callback`, e.g.
     `https://abcdefgh.supabase.co/auth/v1/callback` (the Supabase URL is `NEXT_PUBLIC_SUPABASE_URL` in `.env.local`)
   - **Register**
2. On the app's **Overview**, note the **Application (client) ID** and the **Directory (tenant) ID**.
3. **Certificates & secrets → Client secrets → + New client secret**: description `Supabase`, expiry 24 months
   → **Add**. Copy the **Value** column straight away (it is shown only once; not the "Secret ID").
   Put a reminder in your calendar a week before it expires: sign-in stops when it does.
4. **Manifest** (left menu): find `"optionalClaims"` and replace it (with its value) by the block below, then
   **Save**. It lets Supabase confirm the email Microsoft sends is verified. The portal may warn that
   `xms_edov` is unknown: ignore that.

   ```json
   "optionalClaims": {
       "idToken": [
           { "name": "xms_edov", "source": null, "essential": false, "additionalProperties": [] },
           { "name": "email", "source": null, "essential": false, "additionalProperties": [] }
       ],
       "accessToken": [
           { "name": "xms_edov", "source": null, "essential": false, "additionalProperties": [] }
       ],
       "saml2Token": []
   },
   ```
5. **API permissions:** `Microsoft Graph → User.Read` is there by default; leave it. If your tenant doesn't
   let people consent themselves, IT presses **Grant admin consent for NeoLiv** here.

If **+ New registration** is greyed out or refused, send IT this page: parts A1–A5 are theirs, and they give you
the client ID, tenant ID and secret value (the secret by a safe channel, not chat or email).

## B. Turn on Microsoft in Supabase

Supabase → **Authentication → Sign In / Providers → Azure** → enable it and fill in:
- **Application (client) ID:** from A2
- **Secret Value:** from A3
- **Azure Tenant URL:** `https://login.microsoftonline.com/<Directory (tenant) ID from A2>`

**Save.** Then **Authentication → URL Configuration → Redirect URLs**, add:
- `https://<your app>.vercel.app/**`
- `http://localhost:3000/**`

## C. Show the button in the app

Vercel → project → **Settings → Environment Variables** → add `NEXT_PUBLIC_MICROSOFT_SIGNIN` = `on` →
**Deployments → ⋯ → Redeploy**. (The code must be pushed to GitHub first.)

## Test

Open the app in a private window → **Sign in with Microsoft (NeoLiv account)** → sign in with your NeoLiv
account → you land on the app as yourself (the same account as your password login: Supabase matches it by
email).

| What you see | Fix |
|---|---|
| "provider is not enabled" | Part B isn't saved, or Azure isn't switched on there |
| Microsoft says the reply URL doesn't match (AADSTS50011) | The redirect URI in A1 must be exactly the Supabase URL + `/auth/v1/callback` |
| "Your Microsoft account isn't set up in this app yet" | The admin hasn't added that email in the app; add them, then try again. If they were added but never opened their invite link, send them a new link and have them open it once |
| "Need admin approval" from Microsoft | IT grants admin consent (A5) |
| Worked once, then stops after months | The client secret expired: make a new one (A3) and paste it in B |
