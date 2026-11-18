// Links in Supabase's emails (invite, password reset) land here and are turned into a signed-in session.
// Supabase email templates must point at:
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/set-password     (Invite user)
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/set-password   (Reset password)
import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");
  // only an internal path, so a crafted ?next=//evil.com can't redirect off-site after the link is opened
  const next = safeNext(url.searchParams.get("next"), "/");
  const supabase = await createClient();

  const { error } = tokenHash && type
    ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    : code ? await supabase.auth.exchangeCodeForSession(code) : { error: new Error("missing token") };
  if (error) return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent("That link has expired or was already used. Ask an admin for a new invite, or reset your password.")}`, url.origin));
  return NextResponse.redirect(new URL(next, url.origin));
}
