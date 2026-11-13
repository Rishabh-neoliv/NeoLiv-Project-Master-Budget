// Admins (there can be several): the Admin panel, removing and restoring people, making admins. Any member can add people.
import "server-only";
import { HttpError, requireUser } from "./data";

export async function requireAdmin() {
  const ctx = await requireUser();
  if (!ctx.me.is_admin) throw new HttpError(403, "Only an admin can do this.");
  return ctx;
}
