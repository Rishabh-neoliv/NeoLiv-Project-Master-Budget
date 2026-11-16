# Email templates (approved 2026-11-16)

Approved by Rishabh, one by one, on 2026-11-16. Any change to an email's wording or recipients needs his
approval first. The code is `lib/server/email.ts`.

Rules for all of them:
- The person's name only, never their departments.
- No grand total and no change vs R0.
- "web application", not "app".
- Ends with "Regards, NeoLiv".
- **Workflow emails** (A1, A3–A9): ONE email. **To:** the department(s) the step concerns (whose turn it is).
  **Cc:** the rest of the team and the person who took the step, so the whole team sees every step (user's
  decision, 2026-11-16, after the first live email reached only Design). The person who took the step is never in
  To. If nobody is left to act (you are that department yourself), the rest of the team is in To instead.
- **A2** and the **personal emails** (B1–B4): one email per person. B1–B4 carry a sign-in link, so they must never
  go to a group.
- "Start design work" and "Start operations" send no email.

`<…>` = filled in per project. Revision reads `R<n> (draft)` while the draft is open and `R<n> (frozen)` once frozen.

---

## A1. New project — whole team (except the creator) · Cc the creator
```
Subject: NeoLiv Budget | New project assigned: <Project> (<Location>)

Hello Team,

<Creator> has created a new project in NeoLiv Master Budget and added you to its team.

Project summary
* Project: <Project>
* Location: <Location> · <Area> acre
* Revision: R0 (draft)
* Status: Base Line draft

Next step
Base Line to complete the assumptions and submit R0 to Design.

[ Open project ] → <project link>

To see who else is on the team, open the project and go to the Team tab.

Regards,
NeoLiv
```

## A2. Added to an existing team — one email to each person added · Cc whoever added them
```
Subject: NeoLiv Budget | You've been added to <Project> as <Department>

Hello <First name>,

<Name> has added you to the team of <Project> as <Department>.

Where it stands
<current step, e.g. "Design is working on the R1 draft.">

Project summary
* Project: <Project>
* Location: <Location> · <Area> acre
* Revision: <R<n> (draft) / R<n> (frozen)>
* Status: <status>

[ Open project ] → <project link>

To see who else is on the team, open the project and go to the Team tab.

Regards,
NeoLiv
```

## A3. Base Line submits to Design — To: Design · Cc: rest of the team + the submitter
```
Subject: NeoLiv Budget | R<n> submitted to Design: <Project> (<Location>)

Hello Team,

<Name> has submitted R0 of <Project> to Design. R0 is now frozen as the Base Line.
   (later revisions: "<Name> has submitted the R<n> draft of <Project> to Design.")
Note: <comment>                                   (only if they wrote one)

Next step
Design to open the project and press Start design work.

Project summary
* Project: <Project>
* Location: <Location> · <Area> acre
* Revision: R0 (frozen)   /   R<n> (draft)
* Status: Submitted to Design

[ Open project ] → <project link>

Regards,
NeoLiv
```

## A4. New version started — To: Base Line, Design, Operations · Cc: Management + the person who started it
```
Subject: NeoLiv Budget | New version R<n> started: <Project> (<Location>)

Hello Team,

<Name> has started a new version, R<n>, of <Project>.
Reason: <reason>

Next step
Design to open the project and press Start design work.

Project summary
* Project: <Project>
* Location: <Location> · <Area> acre
* Revision: R<n> (draft)
* Status: Submitted to Design

[ Open project ] → <project link>

Regards,
NeoLiv
```

## A5. Design sends back to Base Line — To: Base Line · Cc: rest of the team + the sender
```
Subject: NeoLiv Budget | R<n> sent back to Base Line: <Project> (<Location>)

Hello Team,

<Name> has sent the R<n> draft of <Project> back to Base Line.
What to change: <comment>

Next step
Base Line to make the changes and submit again.

Project summary
* Project: <Project>
* Location: <Location> · <Area> acre
* Revision: R<n> (draft)
* Status: Returned to Base Line

[ Open project ] → <project link>

Regards,
NeoLiv
```

## A6. Design submits to Operations — To: Operations · Cc: rest of the team + the submitter
```
Subject: NeoLiv Budget | R<n> submitted to Operations: <Project> (<Location>)

Hello Team,

<Name> has submitted the R<n> draft of <Project> to Operations.
Note: <comment>                                   (only if they wrote one)

Next step
Operations to open the project and press Start operations.

Project summary
* Project: <Project>
* Location: <Location> · <Area> acre
* Revision: R<n> (draft)
* Status: With Operations

[ Open project ] → <project link>

Regards,
NeoLiv
```

## A7. Operations submits for approval — To: Management · Cc: rest of the team + the submitter
```
Subject: NeoLiv Budget | R<n> submitted for approval: <Project> (<Location>)

Hello Team,

<Name> has submitted the R<n> draft of <Project> to Management for approval.
Note: <comment>                                   (only if they wrote one)

Next step
Management to review R<n>, then Approve it or Send it back to Operations.

Project summary
* Project: <Project>
* Location: <Location> · <Area> acre
* Revision: R<n> (draft)
* Status: With Management

[ Open project ] → <project link>

Regards,
NeoLiv
```

## A8. Management approves — whole team (except the approver) · Cc the approver
```
Subject: NeoLiv Budget | R<n> approved: <Project> (<Location>)

Hello Team,

<Name> has approved R<n> of <Project>. It is now frozen.
Note: <comment>                                   (only if they wrote one)

Next step
Nothing to do. When the drawings change, Base Line, Design or Operations can start a new version.

Project summary
* Project: <Project>
* Location: <Location> · <Area> acre
* Revision: R<n> (frozen)
* Status: Approved

[ Open project ] → <project link>

Regards,
NeoLiv
```

## A9. Management sends back to Operations — To: Operations · Cc: rest of the team + the sender
```
Subject: NeoLiv Budget | R<n> sent back to Operations: <Project> (<Location>)

Hello Team,

<Name> has sent the R<n> draft of <Project> back to Operations.
What to change: <comment>

Next step
Operations to make the changes and submit to Management again.

Project summary
* Project: <Project>
* Location: <Location> · <Area> acre
* Revision: R<n> (draft)
* Status: Operations in progress

[ Open project ] → <project link>

Regards,
NeoLiv
```

---

## B1. Invitation (password) — the new person only
```
Subject: NeoLiv Budget | You're invited to NeoLiv Master Budget

Hello <First name>,

<Name> has added you to NeoLiv Master Budget.

Your login
* Username: <their email>
* Password: set it with the button below. It is only for this web application and doesn't change any other account.

[ Set your password ] → <link>

The link works once and expires after an hour. If it doesn't open, ask whoever added you, or an admin, for a new one.

Regards,
NeoLiv
```

## B2. Invitation once Microsoft sign-in is on — the new person only
```
Subject: NeoLiv Budget | You're invited to NeoLiv Master Budget

Hello <First name>,

<Name> has added you to NeoLiv Master Budget.

How to sign in
Open the NeoLiv Master Budget web application and press "Sign in with Microsoft", using your NeoLiv account.
* Username: <their email>

[ Open NeoLiv Master Budget ] → <login link>

Or you can set your password through the below link:
<link>
The link works once and expires after an hour. The password is only for this web application.

Regards,
NeoLiv
```

## B3. New link / Resend invite — that person only
```
Subject: NeoLiv Budget | Your link to set your NeoLiv Master Budget password

Hello <First name>,

<Name> has sent you a new link to set your password for NeoLiv Master Budget.

Your login
* Username: <their email>
* Password: set it with the button below. It is only for this web application and doesn't change any other account.

[ Set your password ] → <link>

The link works once and expires after an hour. If it doesn't open, ask whoever added you, or an admin, for a new one.

Regards,
NeoLiv
```

## B4. Forgot password — that person only
```
Subject: NeoLiv Budget | Reset your NeoLiv Master Budget password

Hello <First name>,

Here is your link to reset your NeoLiv Master Budget password.

Your login
* Username: <their email>
* Password: set a new one with the button below.

[ Set a new password ] → <link>

The link works once and expires after an hour. If you didn't ask for it, ignore this email: your password stays as it is.

Regards,
NeoLiv
```
