// Admin and sub-admin powers on the server (lib/roles.ts has the full list).
//   requireAdmin  admins only: master templates, Test projects, admin and sub-admin roles, removing admins
//   requireStaff  admins and sub-admins: the Admin panel's Overview, Team members and Live projects
import "server-only";
import { isStaff } from "@/lib/roles";
import { HttpError, requireUser } from "./data";

export async function requireAdmin() {
  const ctx = await requireUser();
  if (ctx.me.role !== "admin") throw new HttpError(403, "Only an admin can do this.");
  return ctx;
}

export async function requireStaff() {
  const ctx = await requireUser();
  if (!isStaff(ctx.me.role)) throw new HttpError(403, "Only an admin or sub-admin can do this.");
  return ctx;
}
