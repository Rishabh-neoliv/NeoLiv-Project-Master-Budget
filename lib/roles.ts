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
