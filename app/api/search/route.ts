// GET /api/search?q=sonipat   the search box in the top bar: projects you can see (the database decides, with your own
// sign-in: lib/roles.ts), people (everyone signed in can see names), and the app's pages. A few of each.
import { isStaff, roleOf } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { STATUS, type Status } from "@/lib/workflow";

interface SearchHit { kind: "project" | "person" | "page"; title: string; detail: string; href: string }

const PAGES: [title: string, href: string, who: "all" | "staff" | "admin", words: string][] = [
  ["My overview", "/overview", "all", "home dashboard waiting"],
  ["Projects", "/projects", "all", "list"],
  ["My profile", "/profile", "all", "password department name"],
  ["Admin dashboard", "/admin", "staff", "overview administration"],
  ["Team members", "/admin/members", "staff", "people members invite roles"],
  ["Live projects", "/admin/live", "staff", "new project"],
  ["Reports", "/admin/reports", "staff", "budget workflow rates csv excel"],
  ["Roles & access", "/admin/access", "staff", "permissions rules"],
  ["Test projects", "/admin/test", "admin", "new project delete"],
  ["Master templates", "/admin/templates", "admin", "workbook upload excel"],
  ["Settings", "/admin/settings", "admin", "security setup email sign-in"],
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
    // people open their member page, which only admins and sub-admins have (user, 2026-11-27)
    ...(staff ? people ?? [] : []).map((p) => ({ kind: "person" as const, title: p.name as string, detail: [p.email, p.department].filter(Boolean).join(" · "), href: `/admin/members/${p.id}` })),
    ...PAGES.filter(([title, , who, words]) => (who === "all" || (who === "staff" && staff) || (who === "admin" && role === "admin")) && `${title} ${words}`.toLowerCase().includes(ql))
      .slice(0, 4).map(([title, href]) => ({ kind: "page" as const, title, detail: "Page", href })),
  ];
  return Response.json({ hits });
}
