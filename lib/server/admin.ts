// The one admin: onboards people into the app. It does not assign them to projects or take workflow steps.
import "server-only";
import { HttpError, requireUser } from "./data";

export async function requireAdmin() {
  const ctx = await requireUser();
  if (!ctx.me.is_admin) throw new HttpError(403, "Only the admin can onboard team members.");
  return ctx;
}
