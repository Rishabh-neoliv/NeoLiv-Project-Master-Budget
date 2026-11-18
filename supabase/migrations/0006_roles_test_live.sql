-- Roles and project types (agreed with Rishabh on 2026-11-18).
--   * Every project is Live or Test, for good. Admins create both (from the Admin panel tabs); sub-admins create Live.
--   * Sub-admin: a new role between admin and member (profiles.is_subadmin), given by admins.
--   * Who can see a project (replaces 0003, where every member saw every project):
--       admins         every project
--       sub-admins     every Live project, plus Test projects they're on
--       members        only projects they're on (Live or Test)
-- Changing anything still goes through the app's API, which applies the same rules.
-- Run once in Supabase → SQL Editor.

-- ------------------------------------------------------------------ columns
-- The projects so far are all dummy data: they become Test (so they can be deleted); new projects choose their type.
-- Only when the column is first added, so running this file again never turns a Live project into Test.
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'projects' and column_name = 'kind') then
    alter table public.projects add column kind text not null default 'live';
    update public.projects set kind = 'test';
  end if;
end $$;
alter table public.projects drop constraint if exists projects_kind_check;
alter table public.projects add constraint projects_kind_check check (kind in ('live', 'test'));

alter table public.profiles add column if not exists is_subadmin boolean not null default false;

-- ------------------------------------------------------------------ helpers for the rules
create or replace function public.is_subadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_subadmin from public.profiles where id = auth.uid()), false)
$$;

-- can the signed-in person see this project? (security definer: reads projects without going through its own policy)
create or replace function public.can_see_project(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or public.is_member(p)
      or (public.is_subadmin() and exists (select 1 from public.projects where id = p and kind = 'live'))
$$;

-- ------------------------------------------------------------------ who reads what
drop policy if exists "members read projects" on public.projects;
drop policy if exists "members read teams"    on public.project_members;
drop policy if exists "members read versions" on public.versions;
drop policy if exists "members read activity" on public.activity;
drop policy if exists "members read files"    on public.files;
-- (and this file's own, so it can be run again)
drop policy if exists "visible projects"          on public.projects;
drop policy if exists "teams of visible projects" on public.project_members;
drop policy if exists "versions of visible"       on public.versions;
drop policy if exists "activity of visible"       on public.activity;
drop policy if exists "files of visible"          on public.files;

create policy "visible projects"          on public.projects        for select to authenticated using (public.can_see_project(id));
create policy "teams of visible projects" on public.project_members for select to authenticated using (public.can_see_project(project_id));
create policy "versions of visible"       on public.versions        for select to authenticated using (public.can_see_project(project_id));
create policy "activity of visible"       on public.activity        for select to authenticated using (public.can_see_project(project_id));
create policy "files of visible"          on public.files           for select to authenticated using (public.can_see_project(project_id));
