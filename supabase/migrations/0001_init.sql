-- NeoLiv Master Budget: tables, access rules and storage.
-- Run once in the Supabase SQL editor (or `npx supabase db push`).
--
-- Who can do what:
--   * Everyone signed in can read profiles (names on screen) and templates.
--   * A project, its versions, team and activity are visible to its team members and to admins.
--   * Nobody writes from the browser. Every change goes through the Next.js API (server, service key),
--     which checks the workflow: Base Line -> Design -> Operations -> Management.

-- ------------------------------------------------------------------ profiles
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null default '',
  email       text not null default '',
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- a profile for every new login (name from the invite's metadata, else the email)
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)), new.email)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------------ templates (master workbook versions)
create table public.templates (
  stamp       text primary key,                 -- e.g. 20261102-1146
  modified    text not null default '',
  model       jsonb not null,                   -- formulas + layout exported from the master Excel
  xlsx_path   text not null,                    -- object in the private "templates" bucket
  is_current  boolean not null default false,
  created_at  timestamptz not null default now()
);
create unique index templates_one_current on public.templates (is_current) where is_current;

-- ------------------------------------------------------------------ projects
create table public.projects (
  id               uuid primary key default gen_random_uuid(),
  region           text not null check (region in ('NCR', 'MMR')),
  name             text not null,
  status           text not null default 'DRAFT' check (status in (
                     'DRAFT', 'RETURNED', 'SUBMITTED', 'DESIGN_IN_PROGRESS', 'DESIGN_DONE',
                     'OPS_IN_PROGRESS', 'WITH_MGMT', 'APPROVED', 'COMPLETED')),
  template         text references public.templates (stamp),
  inputs           jsonb not null default '{}'::jsonb,   -- {"C8": "NCR", "Additional Inputs!C6": 1150, ...}
  rates            jsonb not null default '{}'::jsonb,   -- project rates that differ from the master
  rates_template   text,
  last_rev         int,                                 -- last frozen revision; null before R0
  revision_reason  text not null default '',
  grand_total      double precision,
  base_total       double precision,                    -- R0 grand total
  location         text,
  acre             double precision,
  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_by       uuid references public.profiles (id),
  updated_at       timestamptz not null default now(),
  saved_at         timestamptz
);
create unique index projects_name_unique on public.projects (lower(name));

-- a person may cover several departments on one project
create table public.project_members (
  project_id  uuid not null references public.projects (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  dept        text not null check (dept in ('BD', 'Design', 'Operations', 'Management')),
  primary key (project_id, user_id, dept)
);
create index project_members_user on public.project_members (user_id);

-- frozen revisions: R0 on Base Line submit, R1+ on Management approval
create table public.versions (
  project_id   uuid not null references public.projects (id) on delete cascade,
  rev          int not null,
  inputs       jsonb not null,
  rates        jsonb not null default '{}'::jsonb,
  master       jsonb not null,          -- Master Budget rows as calculated at freeze
  calc         jsonb not null,
  grand_total  double precision,
  reason       text not null default '',
  dept         text not null,
  template     text references public.templates (stamp),
  xlsx_path    text,                    -- object in the private "versions" bucket
  frozen_by    uuid references public.profiles (id),
  frozen_at    timestamptz not null default now(),
  primary key (project_id, rev)
);

create table public.activity (
  id          bigint generated always as identity primary key,
  project_id  uuid not null references public.projects (id) on delete cascade,
  at          timestamptz not null default now(),
  by          uuid references public.profiles (id),
  dept        text,
  action      text not null,
  comment     text not null default '',
  rev         int
);
create index activity_project_at on public.activity (project_id, at desc);

create table public.email_log (
  id          bigint generated always as identity primary key,
  project_id  uuid references public.projects (id) on delete set null,
  created_at  timestamptz not null default now(),
  step        text not null,
  rev         int,
  "to"        text[] not null,
  subject     text not null,
  status      text not null,            -- sent | failed | skipped
  error       text
);

-- ------------------------------------------------------------------ helpers for the rules
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

create function public.is_member(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.project_members where project_id = p and user_id = auth.uid())
$$;

-- ------------------------------------------------------------------ row-level security (read only)
alter table public.profiles        enable row level security;
alter table public.templates       enable row level security;
alter table public.projects        enable row level security;
alter table public.project_members enable row level security;
alter table public.versions        enable row level security;
alter table public.activity        enable row level security;
alter table public.email_log       enable row level security;

create policy "signed-in users read profiles"  on public.profiles  for select to authenticated using (true);
create policy "signed-in users read templates" on public.templates for select to authenticated using (true);
create policy "team or admin reads project"    on public.projects  for select to authenticated using (public.is_member(id) or public.is_admin());
create policy "team or admin reads team"       on public.project_members for select to authenticated using (public.is_member(project_id) or public.is_admin());
create policy "team or admin reads versions"   on public.versions  for select to authenticated using (public.is_member(project_id) or public.is_admin());
create policy "team or admin reads activity"   on public.activity  for select to authenticated using (public.is_member(project_id) or public.is_admin());
create policy "admin reads email log"          on public.email_log for select to authenticated using (public.is_admin());
-- no insert/update/delete policies: writes only through the API with the service key

-- live updates on the project screens
alter publication supabase_realtime add table public.projects, public.versions, public.activity;

-- ------------------------------------------------------------------ storage (private buckets)
insert into storage.buckets (id, name, public) values ('templates', 'templates', false), ('versions', 'versions', false)
  on conflict (id) do nothing;
-- no storage policies: files are handed out by the API as short-lived signed links
