// GET /api/search?q=sonipat   the search box in the top bar: projects you can see (the database decides, with your own
// sign-in: lib/roles.ts), people (everyone signed in can see names), and the app's pages. A few of each.
import { isStaff, roleOf } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { STATUS, type Status } from "@/lib/workflow";

interface SearchHit { kind: "project" | "person" | "page"; title: string; detail: string; href: string }

const PAGES: [title: string, href: string, who: "all" | "staff" | "admin", words: string][] = [
  ["My overview", "/overview", "all", "home dashboard waiting"],
  ["Projects", "/projects", "all", "list"],
  ["Members", "/members", "all", "people team add invite"],
  ["My profile", "/profile", "all", "password department name"],
  ["Admin panel – Overview", "/admin", "staff", "dashboard"],
  ["Admin panel – Team members", "/admin/members", "staff", "people invite roles"],
  ["Admin panel – Live projects", "/admin/live", "staff", "new project"],
  ["Admin panel – Reports", "/admin/reports", "staff", "budget workflow rates csv excel"],
  ["Admin panel – Roles & access", "/admin/access", "staff", "permissions rules"],
  ["Admin panel – Test projects", "/admin/test", "admin", "new project delete"],
  ["Admin panel – Master templates", "/admin/templates", "admin", "workbook upload excel"],
  ["Admin panel – Settings", "/admin/settings", "admin", "security setup email sign-in"],
];

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub as string | undefined;
  if (!uid) return Response.json({ error: "Please sign in." }, { status: 401 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 2) return Response.json({ hits: [] });
  // for ilike: % and _ are wildcards, so typed ones are taken literally
  const like = `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
  // quoted, so commas or brackets in what was typed don't break the filter
  const val = `"${like.replace(/["\\]/g, (c) => "\\" + c)}"`;
  const [{ data: me }, { data: projects }, { data: people }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", uid).single(),
    supabase.from("projects").select("id, name, location, status").or(`name.ilike.${val},location.ilike.${val}`).order("updated_at", { ascending: false }).limit(6),
    supabase.from("profiles").select("id, name, email, department").or(`name.ilike.${val},email.ilike.${val}`).order("name").limit(6),
  ]);
  const role = roleOf(me), staff = isStaff(role);
  const ql = q.toLowerCase();
  const hits: SearchHit[] = [
    ...(projects ?? []).map((p) => ({ kind: "project" as const, title: p.name as string, detail: `${p.location ?? ""} rates · ${STATUS[p.status as Status]?.[0] ?? p.status}`, href: `/projects/${p.id}` })),
    ...(people ?? []).map((p) => ({ kind: "person" as const, title: p.name as string, detail: [p.email, p.department].filter(Boolean).join(" · "), href: staff ? `/admin/members/${p.id}` : `/members?q=${encodeURIComponent(p.name as string)}` })),
    ...PAGES.filter(([title, , who, words]) => (who === "all" || (who === "staff" && staff) || (who === "admin" && role === "admin")) && `${title} ${words}`.toLowerCase().includes(ql))
      .slice(0, 4).map(([title, href]) => ({ kind: "page" as const, title, detail: "Page", href })),
  ];
  return Response.json({ hits });
}
