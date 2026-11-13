# Automatic emails through Power Automate (no IT needed)

Like the original app: the app puts each email (sign-up links, Forgot password, workflow steps) in an
**outbox**, and **one flow in your own Power Automate** sends them from **your Outlook**
(Rishabh.soni.ext@neoliv.in), with a copy in your Sent Items. Emails arrive **within about 2 minutes**.

The original app (v58) wrote a file into OneDrive and the flow used OneDrive's "When a file is created" trigger.
The web app can't write into your OneDrive without IT, so it publishes the outbox as a **private feed** (a web
address only you and the app know). The flow runs **every 2 minutes** and asks the feed for the emails queued in
exactly the 2 minutes before that run, so each email is sent once. All connectors used (Schedule, RSS, Data
Operation, Office 365 Outlook) are standard: no premium licence.

> Why not the RSS trigger ("When a feed item is published")? Microsoft limits it to one check every **30
> minutes** (documented minimum polling interval 1800 s). The RSS *action* used below has no such limit.

**Before you start:** the app must be online (Vercel), with `POWER_AUTOMATE_FEED_TOKEN` set there. Your **feed
address** is:

    https://neo-liv-project-master-budget.vercel.app/api/email-feed/<secret>

where `<secret>` is the `POWER_AUTOMATE_FEED_TOKEN` value (in `.env.local`). Treat it like a password: anyone with
it can read the emails in the outbox (they include sign-up links). Don't share it, screenshot it or paste it in chat.

---

Build it at **make.powerautomate.com**, signed in as Rishabh.soni.ext@neoliv.in (about 15 minutes).

## 1. Create the flow
**+ Create → Scheduled cloud flow**
- Flow name: `NeoLiv Budget emails`
- **Repeat every:** `2` **Minute**
- **Create**

## 2. List the emails from the last 2 minutes (RSS → List all RSS feed items)
**+ → Add an action →** search **List all RSS feed items** (RSS) → pick it.
- **The RSS feed URL:** click in the box → **fx** → paste the expression below, with your secret in place of
  `PASTE-SECRET-HERE` (keep the quotes) → **Add**. It must show as a purple fx chip.

  ```
  concat('https://neo-liv-project-master-budget.vercel.app/api/email-feed/PASTE-SECRET-HERE?after=', encodeUriComponent(addMinutes(coalesce(trigger()?['scheduledTime'], utcNow()), -2)), '&until=', encodeUriComponent(coalesce(trigger()?['scheduledTime'], utcNow())))
  ```
- Leave the other fields (Since, Chosen property) empty.

## 3. For each email (Apply to each / For each)
**+ → Add an action →** search **For each** (Control; older designer: **Apply to each**).
- **Select an output from previous steps:** lightning icon → under *List all RSS feed items* → **Body**.

Inside **Apply to each** (click the **+ inside the loop**):

**3a. Parse JSON**
- **Content:** click in the box → **fx** → paste, then **Add** (purple chip):
  `json(base64ToString(item()?['summary']))`
  (`item()` is the loop's current email, whatever the loop is called: the new designer names it "For each".)
- **Schema:** paste this (the schema itself, not a sample):
  ```json
  {"type":"object","properties":{"to":{"type":"string"},"subject":{"type":"string"},"html":{"type":"string"}}}
  ```

**3b. Send an email (V2)** (Office 365 Outlook), still inside the loop
- **To:** lightning → under Parse JSON → **Body to**
- **Subject:** lightning → **Body subject**
- **Body:** click **`</>`** first, then lightning → **Body html**
- If it asks to sign in, use your NeoLiv account.

## 4. Save, and turn off any older version
- **Save.**
- If you built the earlier version with the RSS **trigger** ("When a feed item is published"), **turn it off**
  (My flows → ⋯ → Turn off) so emails aren't sent twice.

## 5. Test
- On the live site (private window): type your own email → **Forgot password?**
- Within about 2 minutes the email arrives from your Outlook, and **My flows → NeoLiv Budget emails → Run history**
  shows runs every 2 minutes (most do nothing, because nothing was queued in their window; that's normal).

## If something is red

| What you see | Fix |
|---|---|
| List all RSS feed items fails with 404 | The secret in the expression is wrong (or has spaces) |
| It fails with 400 "after/until…" | The expression was changed: paste it again exactly |
| Parse JSON fails | Content must be the fx expression in 3a (Code view shows it starting with `@`), and Parse JSON must be inside the loop |
| "Invalid parameters" on Send an email | To, Subject or Body empty, or Outlook not signed in |
| Runs are Succeeded but no email | The loop shows 0 items: the email was queued before the flow was saved, or in a window when the flow was off |

## Good to know
- **Each email is sent once.** Each run covers exactly the 2 minutes before its scheduled time, and the windows
  touch without overlapping. Emails queued while the flow is **off** (or during a skipped run) aren't sent later:
  use **Copy link** on Team members for those.
- About 720 small runs a day; within the normal Office 365 Power Automate limits.
- The flow sends as you, so replies come to your inbox. For the live app, IT's Microsoft 365 route sends straight
  away from a shared mailbox with no flow (docs/IT request - Microsoft 365 email.md); when those settings are in
  Vercel the app uses it automatically and this flow can be turned off.
- New designer tips: an **fx** expression shows as a purple chip; typed text that looks like an expression is
  just text and won't work.
