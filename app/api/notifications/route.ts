// GET /api/notifications   the bell: what's waiting for your department, then what others changed on the projects
// you're on in the last 14 days (newest first). Read with your own sign-in, so the database decides what you see
// (lib/roles.ts). Base Line's work on R0 isn't listed, as everywhere else (lib/changes.ts). Nothing is stored: which
// ones you've seen is remembered by your browser (components/top-tools.tsx).
import { withoutBaseLine } from "@/lib/changes";
import { createClient } from "@/lib/supabase/server";
import { dn, STATUS, type Status } from "@/lib/workflow";

interface Notice { id: string; at: string; kind: "waiting" | "change"; project: string; projectId: string; text: string; who?: string; comment?: string }

export async function GET() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub as string | undefined;
  if (!uid) return Response.json({ error: "Please sign in." }, { status: 401 });
  const { data: mine } = await supabase.from("project_members").select("*").eq("user_id", uid);
  const deptsOf = new Map<string, string[]>();
  for (const m of mine ?? []) deptsOf.set(m.project_id, [...(deptsOf.get(m.project_id) ?? []), m.dept]);
  // "your turn" only where you can act: View-only rows (migration 0008) aren't counted
  const actsIn = new Map<string, string[]>();
  for (const m of mine ?? []) if ((m as { access?: string }).access !== "view") actsIn.set(m.project_id, [...(actsIn.get(m.project_id) ?? []), m.dept]);
  const ids = [...deptsOf.keys()];
  if (!ids.length) return Response.json({ items: [] });

  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const [{ data: projects }, { data: recent }, { data: r0 }] = await Promise.all([
    supabase.from("projects").select("id, name, status, updated_at").in("id", ids),
    supabase.from("activity").select("id, at, by, action, comment, project_id, rev, kind:details->>kind").in("project_id", ids).neq("by", uid).gte("at", since).order("at", { ascending: false }).limit(60),
    supabase.from("versions").select("project_id, frozen_at").in("project_id", ids).eq("rev", 0),
  ]);
  const name = new Map((projects ?? []).map((p) => [p.id as string, p.name as string]));
  const changes = withoutBaseLine((recent ?? []) as { id: string; at: string; by: string | null; action: string; comment: string | null; project_id: string; rev: number | null; kind: string | null }[], r0 ?? []).slice(0, 30);
  const people = [...new Set(changes.map((a) => a.by).filter(Boolean))] as string[];
  const { data: ppl } = people.length ? await supabase.from("profiles").select("id, name").in("id", people) : { data: [] };
  const who = new Map((ppl ?? []).map((p) => [p.id as string, p.name as string]));

  const waiting: Notice[] = ((projects ?? []) as { id: string; name: string; status: Status; updated_at: string }[])
    .filter((p) => { const d = STATUS[p.status]?.[1]; return d && actsIn.get(p.id)?.includes(d); })
    .map((p) => ({ id: `w-${p.id}-${p.status}`, at: p.updated_at, kind: "waiting", project: p.name, projectId: p.id, text: `Your turn as ${dn(STATUS[p.status][1]!)}: ${STATUS[p.status][0]}` }));
  const items: Notice[] = [
    ...waiting,
    ...changes.map((a): Notice => ({ id: a.id, at: a.at, kind: "change", project: name.get(a.project_id) ?? "project", projectId: a.project_id, text: a.action, who: (a.by && who.get(a.by)) || "Former member", comment: a.comment || undefined })),
  ];
  return Response.json({ items });
}
