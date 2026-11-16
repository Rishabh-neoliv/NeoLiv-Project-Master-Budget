// PATCH /api/profile  { name }   the signed-in person changes their own name (shown everywhere in the app and in
// emails). The email is the username and isn't changed here; passwords are changed in the browser with Supabase.
import { z } from "zod";
import { errorResponse, HttpError, requireUser } from "@/lib/server/data";

const Body = z.object({ name: z.string().trim().min(2, "Enter your name.").max(80, "That name is too long.") });

export async function PATCH(req: Request) {
  try {
    const { db, me } = await requireUser();
    const { name } = Body.parse(await req.json());
    const { error } = await db.from("profiles").update({ name }).eq("id", me.id);
    if (error) throw new HttpError(400, error.message);
    // keep the sign-in account's name in step (invite emails and Supabase's own screens use it)
    await db.auth.admin.updateUserById(me.id, { user_metadata: { name } });
    return Response.json({ ok: true, name });
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: err.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    return errorResponse(err);
  }
}
