# IT request: email from the NeoLiv Master Budget app through Microsoft 365

**What we need:** the NeoLiv Master Budget web app sends a few automatic emails (sign-up links for new
users, password reset links, and notices when a budget moves between Base Line, Design, Operations and
Management). We'd like these to come from a NeoLiv mailbox through Microsoft 365, using Microsoft Graph.

**What the app is allowed to do:** send email from **one mailbox only**: `Rishabh.soni.ext@neoliv.in`.
It does not read mail and cannot touch any other mailbox. No DNS changes are needed.

**Expected volume:** low, tens of emails a day at most.

---

## 1. Mailbox

The app sends from the existing mailbox **`Rishabh.soni.ext@neoliv.in`** (the app owner's). Nothing to create.

*(Later, for the live app, we may move to a shared mailbox such as `budget@neoliv.in`, so the emails don't depend
on one person's account. That only changes the address in step 3.)*

## 2. App registration

Microsoft Entra admin center → **App registrations → New registration**

- Name: `NeoLiv Master Budget – mail`
- Supported account types: **Accounts in this organizational directory only** (single tenant)
- Redirect URI: none

Then, in the new app:

- **Certificates & secrets → New client secret** (24 months). Copy the secret **Value** (it's shown only once).
- **Do not** add the Microsoft Graph `Mail.Send` permission under *API permissions*. That would allow sending
  from every mailbox in the tenant. Access is given for the one mailbox in step 3 instead.

Note these three values:

| Value | Where |
|---|---|
| Directory (tenant) ID | App registration → Overview |
| Application (client) ID | App registration → Overview |
| Client secret value | From the step above |

Also note the **Object ID of the Enterprise application** (Entra admin center → Enterprise applications →
`NeoLiv Master Budget – mail` → Overview → Object ID). It's needed in step 3; it is *not* the app
registration's object ID.

## 3. Allow the app to send from that mailbox only (Exchange Online RBAC for Applications)

In Exchange Online PowerShell (`Connect-ExchangeOnline` as an Exchange admin):

```powershell
# the app, as Exchange knows it
New-ServicePrincipal -AppId "<Application (client) ID>" -ObjectId "<Enterprise application Object ID>" -DisplayName "NeoLiv Master Budget – mail"

# a scope containing only this one mailbox
New-ManagementScope -Name "NeoLiv Budget mailbox" -RecipientRestrictionFilter "PrimarySmtpAddress -eq 'Rishabh.soni.ext@neoliv.in'"

# the app may send mail, only within that scope
New-ManagementRoleAssignment -App "<Application (client) ID>" -Role "Application Mail.Send" -CustomResourceScope "NeoLiv Budget mailbox"

# check: should say InScope = True for this mailbox, and False for any other mailbox
Test-ServicePrincipalAuthorization -Identity "<Application (client) ID>" -Resource "Rishabh.soni.ext@neoliv.in"
```

The assignment can take up to two hours to become active.

*(If your tenant still uses Application Access Policies instead: grant Graph `Mail.Send` (Application) with admin
consent, then `New-ApplicationAccessPolicy -AppId <client ID> -PolicyScopeGroupId Rishabh.soni.ext@neoliv.in -AccessRight RestrictAccess`.
RBAC for Applications above is Microsoft's current recommendation.)*

## 4. Send back to the app owner

- Directory (tenant) ID
- Application (client) ID
- Client secret value (share it securely, for example through a password manager or an encrypted message, not plain email or chat)
- The secret's expiry date, so it can be renewed in time

---

### For the app owner, once IT replies

1. Put the values in `.env.local` (`MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`; `MAIL_FROM` is already `Rishabh.soni.ext@neoliv.in`) and later in
   Vercel → Project → Settings → Environment Variables.
2. Check it: `node --env-file=.env.local scripts/test-email.mjs your.name@neoliv.in`. It says which step fails, if any.
3. Restart the app. Sign-up links, Forgot password and workflow emails then go out from Rishabh.soni.ext@neoliv.in,
   with a copy in its Sent Items.
