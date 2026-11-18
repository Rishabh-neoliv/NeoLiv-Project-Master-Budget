// A project: header, action bar, summary and tabs. Who can open it is row-level security (migration 0006): its team,
// admins, and sub-admins for Live projects; anyone else gets "not found". Who can change what: lib/roles.ts.
import { notFound } from "next/navigation";
import type { Model } from "@/lib/budget";
import { actsForAll, kindOf, ROLE_NAME, roleOf } from "@/lib/roles";
import { activeMembers } from "@/lib/server/people";
import { createClient } from "@/lib/supabase/server";
import { ProjectView, type ProjectData } from "./project-view";

export default async function ProjectPage(props: PageProps<"/projects/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub as string;

  const { data: project } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  if (!project) notFound();
  const [{ data: team }, { data: versions }, { data: activity }, { data: tpl }, { data: me }, { data: currentTpl }, { data: files, error: filesError }, { data: changes }] = await Promise.all([
    supabase.from("project_members").select("user_id, dept, profiles(name, email)").eq("project_id", id),
    supabase.from("versions").select("rev, inputs, rates, master, calc, grand_total, reason, dept, template, xlsx_path, frozen_by, frozen_at").eq("project_id", id).order("rev"),
    supabase.from("activity").select("id, at, by, dept, action, comment, rev, details").eq("project_id", id).order("at", { ascending: false }).limit(200),
    supabase.from("templates").select("stamp, model, modified").eq("stamp", project.template).maybeSingle(),
    supabase.from("profiles").select("*").eq("id", uid).single(),
    supabase.from("templates").select("stamp, modified").eq("is_current", true).maybeSingle(),
    supabase.from("files").select("id, rev, name, size, content_type, kind, uploaded_by, uploaded_at, extraction_status, extraction, extraction_error").eq("project_id", id).order("uploaded_at", { ascending: false }),
    // every recorded field change (all of them, not just the latest 200), for who-changed-what colours
    supabase.from("activity").select("by, at, rev, details").eq("project_id", id).not("details", "is", null).order("at").limit(5000),
  ]);
  if (!tpl) throw new Error(`Template ${project.template} isn't loaded. Run scripts/setup.mjs.`);

  const ids = [...new Set([project.created_by, ...(activity ?? []).map((a) => a.by), ...(changes ?? []).map((a) => a.by), ...(versions ?? []).map((v) => v.frozen_by), ...(files ?? []).map((f) => f.uploaded_by)].filter(Boolean))] as string[];
  const { data: ppl } = ids.length ? await supabase.from("profiles").select("id, name").in("id", ids) : { data: [] };
  const teamRows = (team ?? []).map((t) => {
    const p = (Array.isArray(t.profiles) ? t.profiles[0] : t.profiles) as { name: string; email: string } | null;
    return { user_id: t.user_id, dept: t.dept, name: p?.name ?? "", email: p?.email ?? "" };
  });
  // Base Line (and the admin) may change the team, so they get the list of onboarded members to pick from
  // an admin acts for every department on any project, a sub-admin on Live projects
  const role = roleOf(me), kind = kindOf(project), all = actsForAll(role, kind);
  const isBaseLine = teamRows.some((t) => t.user_id === uid && t.dept === "BD");

  const data: ProjectData = {
    project,
    team: teamRows,
    versions: versions ?? [],
    activity: activity ?? [],
    changes: changes ?? [],
    names: Object.fromEntries((ppl ?? []).map((p) => [p.id, p.name])),
    model: { ...(tpl.model as Model), stamp: tpl.stamp },
    templateDate: tpl.modified || tpl.stamp,
    meId: uid,
    actsForAll: all,
    roleName: ROLE_NAME[role],
    kind,
    people: isBaseLine || all ? await activeMembers() : [],
    files: files ?? [],
    filesReady: !filesError, // false until supabase/migrations/0002_files_history.sql has been run
    currentTemplate: currentTpl ? { stamp: currentTpl.stamp, date: currentTpl.modified || currentTpl.stamp } : null,
  };
  // key: a fresh screen per project, so nothing typed on one project carries over to another
  return <ProjectView key={project.id} data={data} />;
}
