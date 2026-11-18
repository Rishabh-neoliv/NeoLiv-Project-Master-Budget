// Who can do what (agreed with Rishabh on 2026-11-18). One place for the rules, used by the API, the pages and the
// checks; the database's row-level security (migration 0006) mirrors the "who can see" part.
//
//   admin      everything: every project (Live and Test), people, admins and sub-admins, master templates
//   sub-admin  every Live project, with full control (team, any department's step); creates Live projects;
//              adds people (gets the sign-up link), removes / restores ordinary members; Admin panel: Overview,
//              Team members, Live projects. Test projects only if on their team.
//   member     only the projects they're on, their own department's steps; adds people (link by email only)
export type Role = "admin" | "subadmin" | "member";
export type Kind = "live" | "test";
export const ROLE_NAME: Record<Role, string> = { admin: "Admin", subadmin: "Sub-admin", member: "Member" };

export const roleOf = (p: { is_admin?: boolean | null; is_subadmin?: boolean | null } | null | undefined): Role =>
  p?.is_admin ? "admin" : p?.is_subadmin ? "subadmin" : "member";
export const kindOf = (p: { kind?: string | null } | null | undefined): Kind => (p?.kind === "test" ? "test" : "live");

/** Admins and sub-admins: the Admin panel, sign-up links handed back, removing members. */
export const isStaff = (role: Role) => role !== "member";
/** Can this person see the project at all? */
export const canSeeProject = (role: Role, kind: Kind, onTeam: boolean) => role === "admin" || onTeam || (role === "subadmin" && kind === "live");
/** Acts for every department on this project, team or not (an admin anywhere, a sub-admin on Live projects). */
export const actsForAll = (role: Role, kind: Kind) => role === "admin" || (role === "subadmin" && kind === "live");
export const canCreateProject = (role: Role, kind: Kind) => role === "admin" || (role === "subadmin" && kind === "live");
/** Only Test projects can be deleted, and only by an admin. Live projects are never deleted. */
export const canDeleteProject = (role: Role, kind: Kind) => role === "admin" && kind === "test";
