-- Every signed-in member can view every project (user's decision, 2026-11-13).
-- Before: a project, its team, revisions, history and files were visible only to its team and the admin.
-- Changing anything still goes through the app's API, which allows it only for the project's team (and the admin).
-- Only people the admin added can sign in (Supabase sign-ups stay off), so "signed in" means "a NeoLiv member".
-- Run once in Supabase → SQL Editor.

drop policy if exists "team or admin reads project"  on public.projects;
drop policy if exists "team or admin reads team"     on public.project_members;
drop policy if exists "team or admin reads versions" on public.versions;
drop policy if exists "team or admin reads activity" on public.activity;
drop policy if exists "team or admin reads files"    on public.files;

create policy "members read projects" on public.projects        for select to authenticated using (true);
create policy "members read teams"    on public.project_members for select to authenticated using (true);
create policy "members read versions" on public.versions        for select to authenticated using (true);
create policy "members read activity" on public.activity        for select to authenticated using (true);
create policy "members read files"    on public.files           for select to authenticated using (true);
