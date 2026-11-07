// Sends one test email through Microsoft 365 with the settings in .env.local, and says what's wrong if it fails.
//   node --env-file=.env.local scripts/test-email.mjs you@neoliv.in
const [to] = process.argv.slice(2);
const { MS_TENANT_ID: tenant, MS_CLIENT_ID: client, MS_CLIENT_SECRET: secret, MAIL_FROM: from } = process.env;
if (!to) throw new Error("Give the address to send the test to.");
for (const [k, v] of Object.entries({ MS_TENANT_ID: tenant, MS_CLIENT_ID: client, MS_CLIENT_SECRET: secret, MAIL_FROM: from })) if (!v) throw new Error(`${k} is empty in .env.local`);

const t = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
  method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ grant_type: "client_credentials", client_id: client, client_secret: secret, scope: "https://graph.microsoft.com/.default" }),
});
const tok = await t.json();
if (!t.ok) { console.error("1. Sign-in to Microsoft FAILED:", tok.error, "-", (tok.error_description || "").split("\r\n")[0]); console.error("   Check MS_TENANT_ID, MS_CLIENT_ID and MS_CLIENT_SECRET (secret value, not its ID; not expired)."); process.exit(1); }
console.log("1. Sign-in to Microsoft: ok");

const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`, {
  method: "POST", headers: { authorization: `Bearer ${tok.access_token}`, "content-type": "application/json" },
  body: JSON.stringify({ message: { subject: "NeoLiv Master Budget: test email", body: { contentType: "Text", content: `This is a test from the NeoLiv Master Budget app, sent from ${from}.` }, toRecipients: [{ emailAddress: { address: to } }] }, saveToSentItems: true }),
});
if (r.status === 202) { console.log(`2. Send from ${from} to ${to}: ok. Check the inbox (and Junk).`); process.exit(0); }
const out = await r.json().catch(() => ({}));
console.error(`2. Send FAILED (${r.status}):`, out.error?.code, "-", out.error?.message);
if (r.status === 403) console.error("   The app isn't allowed to send from this mailbox: the Exchange role assignment (IT request, step 3) is missing or not active yet (it can take up to 2 hours).");
if (r.status === 404) console.error(`   Mailbox ${from} wasn't found: check MAIL_FROM and that the shared mailbox exists.`);
process.exit(1);
