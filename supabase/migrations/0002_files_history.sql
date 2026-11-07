-- NeoLiv Master Budget, update 2: project files (with what was read from them) and field-level history.
-- Run once in the Supabase SQL editor, after 0001_init.sql.

-- ------------------------------------------------------------------ files on a project
-- rev is null while a file belongs to the working draft; it takes the revision number when that revision freezes.
create table public.files (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects (id) on delete cascade,
  rev                int,
  name               text not null,
  path               text not null unique,            -- object in the private "files" bucket
  size               bigint not null default 0,
  content_type       text not null default '',
  kind               text not null default 'document' check (kind in ('budget_excel', 'document')),
  uploaded_by        uuid references public.profiles (id),
  uploaded_at        timestamptz not null default now(),
  -- what the app read from the file: exact values (budget Excel) or Claude's suggestions (other documents)
  extraction_status  text not null default 'none' check (extraction_status in ('none', 'pending', 'done', 'failed')),
  extraction         jsonb,
  extraction_error   text,
  extracted_at       timestamptz
);
create index files_project on public.files (project_id, uploaded_at desc);

alter table public.files enable row level security;
create policy "team or admin reads files" on public.files for select to authenticated
  using (public.is_member(project_id) or public.is_admin());
-- no write policies: uploads, extraction and deletes go through the API

alter publication supabase_realtime add table public.files;

insert into storage.buckets (id, name, public) values ('files', 'files', false) on conflict (id) do nothing;

-- ------------------------------------------------------------------ field history
-- each saved change lists the fields that changed: [{cell, label, from, to}], and where values came from
alter table public.activity add column if not exists details jsonb;

-- ------------------------------------------------------------------ email outbox (sent by a Power Automate flow)
-- The app writes each email here; a flow in the owner's Power Automate reads the private feed
-- /api/email-feed/<token> and sends them from Outlook (like the original app's "Email outbox" folder).
create table if not exists public.email_outbox (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  "to"        text not null,
  subject     text not null,
  html        text not null,
  text        text not null default ''
);
create index if not exists email_outbox_created on public.email_outbox (created_at desc);
alter table public.email_outbox enable row level security;
-- no policies: only the app's server reads and writes it
