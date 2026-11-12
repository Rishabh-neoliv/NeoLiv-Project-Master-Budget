// "Sign in with Microsoft" comes back here: Supabase hands over a one-time code, which becomes a signed-in
// session (the PKCE code verifier is in a cookie set when the sign-in started). Only people the admin has
// already added can get in: new sign-ups are switched off in Supabase, and the Microsoft app only accepts
// NeoLiv accounts (docs/Microsoft sign-in.md).
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const toLogin = (origin: string, message: string) => NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, origin));

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = url.searchParams.get("next")?.startsWith("/") ? url.searchParams.get("next")! : "/";
  const problem = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (problem) {
    // Supabase's wording for someone who isn't in the app yet, or was removed
    if (/signup|sign up|not allowed/i.test(problem)) return toLogin(url.origin, "Your Microsoft account isn't set up in this app yet. Ask the admin to add you, then try again.");
    if (/banned/i.test(problem)) return toLogin(url.origin, "Your access to this app has been removed. Ask the admin if this is a mistake.");
    return toLogin(url.origin, "Microsoft sign-in didn't work: " + problem);
  }
  const code = url.searchParams.get("code");
  if (!code) return toLogin(url.origin, "Microsoft sign-in didn't finish. Please try again.");
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return toLogin(url.origin, /banned/i.test(error.message) ? "Your access to this app has been removed. Ask the admin if this is a mistake."
    : /verifier/i.test(error.message) ? "Microsoft sign-in didn't finish. Start again from this page, in the same browser."
    : "Microsoft sign-in didn't finish (" + error.message + "). Please try again.");
  return NextResponse.redirect(new URL(next, url.origin));
}
