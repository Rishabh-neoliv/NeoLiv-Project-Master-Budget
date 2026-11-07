// Sign-up and password links. Made by the server from Supabase's one-time token, so they work without
// changing Supabase's email templates: the admin can copy one and send it any way they like.
import "server-only";

export const appUrlFor = (req: Request) => (process.env.APP_URL || new URL(req.url).origin).replace(/\/+$/, "");

export const linkFor = (appUrl: string, tokenHash: string, type: "invite" | "recovery") =>
  `${appUrl}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=${type}&next=/set-password`;
