# Automatic emails through Power Automate (no IT needed)

Like the original app: the app puts each email (sign-up links, Forgot password, workflow steps) in an
**outbox**, and **one flow in your own Power Automate** sends them from **your Outlook**
(Rishabh.soni.ext@neoliv.in), with a copy in your Sent Items.

The original app wrote a file into OneDrive for the flow. The web app can't write into your OneDrive without
IT, so instead it publishes the outbox as a **private feed** (a web address only you and the app know). The
flow checks it every few minutes with the **RSS** connector. RSS and Outlook are standard connectors, so no
premium licence is needed.

**Before you start:** the app must be online (deployed to Vercel). Power Automate runs in Microsoft's cloud and
can't reach `localhost`. Claude sets `POWER_AUTOMATE_FEED_TOKEN` in Vercel when deploying and gives you the
**feed address**:

    https://<app address>/api/email-feed/<secret>

Treat the feed address like a password: anyone with it can read the emails in the outbox (they include sign-up
links, which expire after an hour). Don't share it or paste it in chat.

---

Build it at **make.powerautomate.com**, signed in as Rishabh.soni.ext@neoliv.in (about 10 minutes).

## 1. Create the flow
**+ Create → Automated cloud flow**
- Flow name: `NeoLiv Budget emails`
- Trigger: search **RSS** and pick **When a feed item is published (RSS)**
- **Create**

## 2. Trigger: When a feed item is published
- **The RSS feed URL:** paste the feed address.
- **Chosen property will be used to determine which items are new:** `PublishDate`.

## 3. Parse JSON (Data Operation)
**+ → Add an action → Parse JSON**
- **Content:** click **fx** (expression), paste this and press **Add**:
  `json(base64ToString(triggerBody()?['summary']))`
- **Schema:** **Use sample payload to generate schema**, paste the following and press **Done**:

  ```json
  {"to":"name@neoliv.in","subject":"x","html":"<p>x</p>"}
  ```
- Keep the step's name exactly **Parse JSON**.

## 4. Send an email (V2) (Office 365 Outlook)
**+ → Add an action → Send an email (V2)**
- **To:** lightning icon (dynamic content) → under Parse JSON → **to**
- **Subject:** lightning icon → under Parse JSON → **subject**
- **Body:** lightning icon → under Parse JSON → **html**, and nothing else.
- If it says "Not connected", use **Change connection → Add new → Sign in** with your NeoLiv account.

## 5. Save and test
- **Save** (top). A red mark on a step names the missing field.
- In the app, as the admin: **Team members → New link** on any member, or **Forgot password** on the sign-in
  page with your own email. Within about 5 minutes the email should arrive, and **My flows → NeoLiv Budget
  emails → Run history** shows a run marked Succeeded.

## If something is red

| What you see | Fix |
|---|---|
| Trigger fails with 404 | The feed address is wrong (check the secret part), or the app isn't deployed yet |
| `summary` is empty / Parse JSON fails | Content must be the expression in step 3, exactly |
| "Invalid parameters" on Send an email (V2) | To, Subject or Body is empty, or the Outlook connection isn't signed in (step 4) |
| No runs at all | The flow is turned off (My flows → … → Turn on), or nothing has been sent since you saved it |

## Good to know
- Emails go out within a few minutes, not instantly: the flow checks the feed on a timer.
- Each email is sent once. The outbox keeps emails for 3 days, then they drop off the feed.
- The flow sends as you, so replies come to your inbox. For the live app a shared mailbox avoids depending on
  one person's account: then this same flow is rebuilt by whoever owns that mailbox, or IT sets up Microsoft
  365 sending (docs/IT request - Microsoft 365 email.md).
