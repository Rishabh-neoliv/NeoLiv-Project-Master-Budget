-- Sub-admins limited to regions (agreed with Rishabh on 2026-11-26).
--   * A project's region is the one picked when it is created, and never changes: NCR, MMR, Alibaug or Nagpur
--     (the four locations the master budget has rates for).
--   * An admin gives each sub-admin one or more regions (profiles.regions). A sub-admin sees and manages the Live
--     projects of those regions only; with no region, only the projects whose team they're on.
--   * Admins and members are unchanged (admins: everything; members: the projects they're on).
-- Run once in Supabase → SQL Editor. Safe to run again.

alter table public.projects drop constraint if exists projects_region_check;
alter table public.projects add constraint projects_region_check check (region in ('NCR', 'MMR', 'Alibaug', 'Nagpur'));

alter table public.profiles add column if not exists regions text[] not null default '{}';

-- the signed-in person's regions (security definer: reads profiles without going through its policy)
create or replace function public.my_regions() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce((select regions from public.profiles where id = auth.uid()), '{}'::text[])
$$;

-- can the signed-in person see this project? (replaces 0006's: sub-admins now only in their regions)
create or replace function public.can_see_project(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or public.is_member(p)
      or (public.is_subadmin() and exists (
            select 1 from public.projects where id = p and kind = 'live' and region = any(public.my_regions())))
$$;
