// Who can do what (agreed with Rishabh on 2026-11-18). One place for the rules, used by the API, the pages and the
// checks; the database's row-level security (migration 0006) mirrors the "who can see" part.
//
//   admin      everything: every project (Live and Test), people, admins and sub-admins, master templates
//   sub-admin  the Live projects of their regions (set by an admin; migration 0007, 2026-11-26), with full control
//              (team, any department's step); creates Live projects in those regions; adds people (gets the
//              sign-up link), removes / restores ordinary members; Admin panel: Overview, Team members, Live
//              projects. Other projects only if on their team, like a member.
//   member     only the projects they're on, their own department's steps; adds people (link by email only)
export type Role = "admin" | "subadmin" | "member";
export type Kind = "live" | "test";
/** A project's region, picked when it's created and fixed: the four locations the master budget has rates for. */
export const REGIONS = ["NCR", "MMR", "Alibaug", "Nagpur"] as const;
export type Region = (typeof REGIONS)[number];
/** A sub-admin's regions (profiles.regions); empty for anyone else. */
export const regionsOf = (p: { regions?: unknown } | null | undefined): string[] => (Array.isArray(p?.regions) ? (p.regions as string[]) : []);
export const ROLE_NAME: Record<Role, string> = { admin: "Admin", subadmin: "Sub-admin", member: "Member" };

export const roleOf = (p: { is_admin?: boolean | null; is_subadmin?: boolean | null } | null | undefined): Role =>
  p?.is_admin ? "admin" : p?.is_subadmin ? "subadmin" : "member";
export const kindOf = (p: { kind?: string | null } | null | undefined): Kind => (p?.kind === "test" ? "test" : "live");

/** Admins and sub-admins: the Administration pages, inviting people (with the sign-up link handed back), removing members. */
export const isStaff = (role: Role) => role !== "member";
/** A sub-admin's reach: Live projects in one of their regions. */
const subadminReach = (role: Role, kind: Kind, region: string, regions: string[]) => role === "subadmin" && kind === "live" && regions.includes(region);
/** Can this person see the project at all? */
export const canSeeProject = (role: Role, kind: Kind, onTeam: boolean, region: string, regions: string[]) => role === "admin" || onTeam || subadminReach(role, kind, region, regions);
/** Acts for every department on this project, team or not (an admin anywhere, a sub-admin on Live projects of their regions). */
export const actsForAll = (role: Role, kind: Kind, region: string, regions: string[]) => role === "admin" || subadminReach(role, kind, region, regions);
export const canCreateProject = (role: Role, kind: Kind, region: string, regions: string[]) => role === "admin" || subadminReach(role, kind, region, regions);
/** Only Test projects can be deleted, and only by an admin. Live projects are never deleted. */
export const canDeleteProject = (role: Role, kind: Kind) => role === "admin" && kind === "test";

// ---- project access levels (project_members.access, migration 0008; agreed 2026-11-27)
export type Access = "view" | "edit" | "manage";
export const ACCESS_LEVELS: Access[] = ["edit", "view", "manage"];
export const ACCESS_NAME: Record<Access, string> = { view: "View only", edit: "Edit", manage: "Manage" };
export const ACCESS_HELP: Record<Access, string> = {
  edit: "Sees the project, edits the draft, rates and files, and takes steps on their department's turn.",
  view: "Sees the project and downloads it, but changes nothing and takes no steps.",
  manage: "Edit, plus changes the project's team.",
};
/** A team row's level: "edit" until migration 0008 adds the column (and for rows saved before it). */
export const accessOf = (row: { access?: string | null }): Access => (row.access === "view" || row.access === "manage" ? row.access : "edit");

// ---- each role in a few words (role cards and the role pop-up)
export const ROLE_POINTS: Record<Role, string[]> = {
  admin: ["Sees and acts on every project, Live and Test.", "Creates Live and Test projects; deletes Test ones.", "Manages people and their roles; uploads master templates.", "Reads role activity and Settings."],
  subadmin: ["Handles one region: its Live projects, with full control.", "Creates Live projects in that region.", "Invites people; edits, removes and restores ordinary members.", "Other projects only if on their team."],
  member: ["Sees only the projects they're on the team of.", "Edits drafts, rates and files there (Edit or Manage).", "Takes workflow steps on their department's turn.", "Doesn't invite people."],
};

// ---- what each role can do, for the Roles & access page and the role preview. `true` = yes, `false` = no, text = a
// limited yes. Mirrors the rules above, lib/workflow.ts and the database (keep them in step).
export type Can = boolean | string;
export const PERMISSIONS: [what: string, can: Record<Role, Can>][] = [
  ["See projects", { admin: "All", subadmin: "Region's Live + own teams", member: "Own teams" }],
  ["Edit drafts, rates and files", { admin: true, subadmin: "Region's Live + own teams", member: "Own teams (Edit / Manage)" }],
  ["Take workflow steps", { admin: "Any department", subadmin: "Region's Live: any department", member: "Own department's turn" }],
  ["Change a project's team", { admin: true, subadmin: "Region's Live", member: "As Base Line or Manage" }],
  ["Create Live projects", { admin: true, subadmin: "Own region", member: false }],
  ["Create and delete Test projects", { admin: true, subadmin: false, member: false }],
  ["Invite people, send sign-up links", { admin: true, subadmin: true, member: false }],
  ["Edit, remove and restore members", { admin: true, subadmin: "Ordinary members", member: false }],
  ["Change roles (admin, sub-admin)", { admin: true, subadmin: false, member: false }],
  ["Reports", { admin: "All projects", subadmin: "Region's Live", member: false }],
  ["Upload master templates", { admin: true, subadmin: false, member: false }],
  ["Settings and role activity", { admin: true, subadmin: false, member: false }],
];
