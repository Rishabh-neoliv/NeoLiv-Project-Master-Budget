// Onboarding people into the app. Which projects they work on, and in which department, is set on each
// project by its Base Line team, not here.
//
// POST  /api/admin/users  { name, email, role?, region?, department?, projects?, sendEmail? }
//        admins and sub-admins (user, 2026-11-27: ordinary members no longer invite people): adds a member and
//        emails them their sign-up link; they also get the link back (to send it themselves) and may skip the email.
//        Optional, as on the invite form:
//          role        "admin" / "subadmin" (with region): admins only; default an ordinary member
//          department  their company department (lib/departments.ts)
//          projects    [{ projectId, dept }]: put them on those projects' teams, as Base Line / Design / ... (admins
//                      any project, sub-admins Live projects of their region: the same rule as acting for every department)
// PATCH /api/admin/users  { id, name?, department? }   admins (anyone) and sub-admins (ordinary members): edit a member
import { z } from "zod";
import { DEPARTMENTS } from "@/lib/departments";
import { actsForAll, isStaff, kindOf, REGIONS, roleOf } from "@/lib/roles";
import { DEPTS, dn } from "@/lib/workflow";
import { errorResponse, HttpError, readJson, requireUser } from "@/lib/server/data";
import { audit } from "@/lib/server/audit";
import { sendInvite } from "@/lib/server/email";
import { appUrlFor, linkFor } from "@/lib/server/links";
import { mailProvider } from "@/lib/server/mailer";
import { authSettings, microsoftReady } from "@/lib/server/setup-status";

const Department = z.string().trim().max(60).refine((d) => d === "" || (DEPARTMENTS as readonly string[]).includes(d), "Pick a department from the list.");
const Invite = z.object({
  name: z.string().trim().min(1, "Enter their name.").max(80),
  email: z.email("Enter a valid email address.").transform((s) => s.trim().toLowerCase()),
  role: z.enum(["member", "subadmin", "admin"]).default("member"),
  region: z.enum(REGIONS).optional(),
  department: Department.optional(),
  projects: z.array(z.object({ projectId: z.uuid(), dept: z.enum(DEPTS) })).max(50).default([]),
  sendEmail: z.boolean().default(true),
});

export async function POST(req: Request) {
  // for recording a refused attempt
  let tried: { db: Awaited<ReturnType<typeof requireUser>>["db"]; me: { id: string; name: string }; email: string; name: string } | null = null;
  try {
    const { db, me } = await requireUser();
    const body = Invite.parse(await readJson(req));
    tried = { db, me, email: body.email, name: body.name };
    const staff = isStaff(me.role);
    if (!staff) throw new HttpError(403, "Only an admin or sub-admin can invite people. Ask one of them to add your colleague.");
    const { data: existing } = await db.from("profiles").select("id").eq("email", body.email).maybeSingle();
    if (existing) throw new HttpError(409, `${body.email} is already a member. Use “${staff ? "New link" : "Resend invite"}” on their row to send another sign-up link.`);
    // the extras on the invite form, each with the same rule as where it's done later (lib/roles.ts)
    if (body.role !== "member" && me.role !== "admin") throw new HttpError(403, "Only an admin can make someone an admin or sub-admin.");
    if (body.role === "subadmin" && !body.region) throw new HttpError(400, "Pick the region they'll handle as sub-admin.");
    if (!body.sendEmail && !staff) throw new HttpError(403, "Your invites always go by email.");
    const joins = [...new Map(body.projects.map((t) => [`${t.projectId}|${t.dept}`, t])).values()];
    const projectIds = [...new Set(joins.map((t) => t.projectId))];
    const { data: projs } = projectIds.length ? await db.from("projects").select("id, name, kind, region").in("id", projectIds) : { data: [] };
    for (const id of projectIds) {
      const pr = projs?.find((x) => x.id === id);
      if (!pr) throw new HttpError(404, "One of the projects wasn't found.");
      if (!actsForAll(me.role, kindOf(pr), pr.region, me.regions)) throw new HttpError(403, `You can't add people to the team of ${pr.name}. Its Base Line team can, on the project's Team tab.`);
    }

    // With Microsoft sign-in on, the account is created with its (company) email already confirmed, so their
    // NeoLiv Microsoft account joins it on first sign-in; the link is only a fallback to set a password.
    // Otherwise it's a normal invite: they confirm by opening the link and setting a password.
    const microsoft = microsoftReady(await authSettings());
    let userId: string, link: string;
    if (microsoft) {
      const { data: made, error } = await db.auth.admin.createUser({ email: body.email, email_confirm: true, user_metadata: { name: body.name } });
      if (error) throw new HttpError(400, error.message);
      userId = made.user.id;
      const { data, error: linkErr } = await db.auth.admin.generateLink({ type: "recovery", email: body.email });
      if (linkErr) throw new HttpError(400, linkErr.message);
      link = linkFor(appUrlFor(req), data.properties.hashed_token, "recovery");
    } else {
      const { data, error } = await db.auth.admin.generateLink({ type: "invite", email: body.email, options: { data: { name: body.name } } });
      if (error) throw new HttpError(400, error.message);
      userId = data.user.id;
      link = linkFor(appUrlFor(req), data.properties.hashed_token, "invite");
    }
    await db.from("profiles").upsert({
      id: userId, name: body.name, email: body.email, is_admin: body.role === "admin", is_subadmin: body.role === "subadmin",
      regions: body.role === "subadmin" ? [body.region] : [], ...(body.department ? { department: body.department } : {}),
    });
    // their projects: on each team, recorded in the project's history like a change on its Team tab
    for (const id of projectIds) {
      const mine = joins.filter((t) => t.projectId === id);
      const { error } = await db.from("project_members").insert(mine.map((t) => ({ project_id: id, user_id: userId, dept: t.dept })));
      if (error) throw new HttpError(400, `${body.name} is added, but couldn't be put on a project's team: ${error.message}`);
      await db.from("activity").insert({ project_id: id, by: me.id, dept: me.role === "admin" ? "Admin" : "Sub-admin",
        action: "Changed the team: " + mine.map((t) => `added ${body.name} (${dn(t.dept)})`).join(", "), rev: null });
    }

    // the approved invite email (lib/server/email.ts), unless an admin or sub-admin chose to send the link themselves
    const emailed = body.sendEmail ? await sendInvite({ to: body.email, name: body.name, from: me.name, link, microsoft, appUrl: appUrlFor(req) }) : false;
    const target = { id: userId, name: body.name, email: body.email };
    const pname = (id: string) => projs?.find((x) => x.id === id)?.name ?? "";
    await audit(db,
      { actor: me, target, kind: "invite", action: "Member invited", before: null,
        after: { role: body.role, region: body.role === "subadmin" ? body.region : null, department: body.department || null, projects: joins.map((t) => `${pname(t.projectId)} (${dn(t.dept)})`), emailed } },
      ...joins.map((t) => ({ actor: me, target, kind: "project_access" as const, action: "Added to project", before: null, after: { dept: t.dept, access: "edit" }, project: { id: t.projectId, name: pname(t.projectId) } })),
    );
    if (!staff && !emailed) throw new HttpError(500, `${body.name} is added, but the invite email couldn't be sent. Ask an admin to send them a link.`);
    // a sign-up link signs whoever opens it in as the new member, so only admins and sub-admins see it
    return Response.json({ id: userId, link: staff ? link : undefined, emailed, via: mailProvider(), microsoft });
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: err.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    if (tried && err instanceof HttpError && err.status === 403)
      await audit(tried.db, { actor: tried.me, target: { id: "", name: tried.name, email: tried.email }, kind: "invite", action: "Member invited", status: "failed", detail: err.message });
    return errorResponse(err);
  }
}

const Edit = z.object({ id: z.uuid(), name: z.string().trim().min(1, "Enter their name.").max(80).optional(), department: Department.optional() });

export async function PATCH(req: Request) {
  let tried: { db: Awaited<ReturnType<typeof requireUser>>["db"]; me: { id: string; name: string }; target: { id: string; name: string; email: string } } | null = null;
  try {
    const { db, me } = await requireUser();
    const { id, name, department } = Edit.parse(await readJson(req));
    const { data: person } = await db.from("profiles").select("*").eq("id", id).single();
    if (!person) throw new HttpError(404, "Member not found.");
    tried = { db, me, target: { id, name: person.name, email: person.email } };
    // whom you manage: admins everyone, sub-admins ordinary members (lib/roles.ts); your own details are on My profile
    const theirs = roleOf(person);
    if (!(me.role === "admin" || (me.role === "subadmin" && theirs === "member")))
      throw new HttpError(403, me.role === "subadmin" ? "Only an admin can edit an admin or sub-admin." : "Only an admin or sub-admin can edit members.");
    const upd = { ...(name !== undefined ? { name } : {}), ...(department !== undefined ? { department } : {}) };
    if (!Object.keys(upd).length) return Response.json({ ok: true });
    const { error } = await db.from("profiles").update(upd).eq("id", id);
    if (error) throw new HttpError(400, error.message);
    await audit(db, { actor: me, target: tried.target, kind: "member", action: "Member details edited",
      before: Object.fromEntries(Object.keys(upd).map((k) => [k, (person as Record<string, unknown>)[k] ?? ""])), after: upd });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: err.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    if (tried && err instanceof HttpError && err.status === 403)
      await audit(tried.db, { actor: tried.me, target: tried.target, kind: "member", action: "Member details edited", status: "failed", detail: err.message });
    return errorResponse(err);
  }
}
