// PATCH /api/profile  { name?, department? }   the signed-in person changes their own name (shown everywhere in the
// app and in emails) and their department (lib/departments.ts). The email is the username and isn't changed here;
// passwords are changed in the browser with Supabase.
import { z } from "zod";
import { DEPARTMENTS } from "@/lib/departments";
import { errorResponse, HttpError, readJson, requireUser } from "@/lib/server/data";

const Body = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(80, "That name is too long.").optional(),
  department: z.union([z.enum(DEPARTMENTS), z.literal("")]).optional(),
});

export async function PATCH(req: Request) {
  try {
    const { db, me } = await requireUser();
    const body = Body.parse(await readJson(req));
    const change: Record<string, string> = {};
    if (body.name !== undefined) change.name = body.name;
    if (body.department !== undefined) change.department = body.department;
    if (!Object.keys(change).length) return Response.json({ ok: true });
    const { error } = await db.from("profiles").update(change).eq("id", me.id);
    if (error) throw new HttpError(400, /department/.test(error.message) ? "Departments aren't switched on yet: run supabase/migrations/0005_profile_department.sql in Supabase." : error.message);
    // keep the sign-in account's name in step (invite emails and Supabase's own screens use it)
    if (change.name) await db.auth.admin.updateUserById(me.id, { user_metadata: { name: change.name } });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: err.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    return errorResponse(err);
  }
}
