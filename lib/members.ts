// A member as the people pages show them (Admin panel → Team members, the Members page, a member's own page).
// Built on the server by lib/server/members.ts; plain data, so the browser can use it too.

export interface Member {
  id: string; name: string; email: string; department: string;
  isAdmin: boolean; isSubadmin: boolean; regions: string[];
  status: "active" | "invited" | "removed";
  lastSignIn: string | null;
  /** the latest sign-up link sent (first invite or "New link"): links work once and expire after an hour */
  linkSentAt: string | null;
  createdAt: string | null;
  projects: number;
  microsoft: boolean;
}

const LINK_LIFE_MS = 60 * 60 * 1000;
/** An invited member whose sign-up link has expired (sent more than an hour ago, still not signed in). */
export const linkExpired = (m: Pick<Member, "status" | "linkSentAt">, now = Date.now()) =>
  m.status === "invited" && !!m.linkSentAt && now - new Date(m.linkSentAt).getTime() > LINK_LIFE_MS;

/** Admin, sub-admin or member, for filters and badges. */
export const memberRole = (m: Pick<Member, "isAdmin" | "isSubadmin">) => (m.isAdmin ? "admin" : m.isSubadmin ? "subadmin" : "member");
