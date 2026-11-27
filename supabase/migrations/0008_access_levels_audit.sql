-- 0008 (2026-11-27): project access levels and a read-only audit log of role and access changes.
-- Run once in Supabase → SQL Editor. Safe to run again.
--
-- 1. Access level per project and department (project_members.access), agreed with Rishabh on 2026-11-27:
--      edit    (everyone today, the default) sees the project, edits the draft, rates and files, takes steps on
--              their department's turn
--      view    sees the project and downloads, but changes nothing and takes no steps
--      manage  edit, plus changes the project's team (like Base Line)
--    Every department keeps at least one Edit or Manage person (checked by the app). Workflow emails are unchanged.
alter table public.project_members add column if not exists access text not null default 'edit';
do $$ begin
  alter table public.project_members add constraint project_members_access_check check (access in ('view', 'edit', 'manage'));
exception when duplicate_object then null; end $$;

-- 2. The audit log: who changed whose role, project access, invites and member details, before and after, when,
--    why, and whether it worked (refused attempts too). Written by the app (secret key) only; read by admins only;
--    nobody can change or delete a record, not even an admin or the app: the triggers below refuse it.
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor uuid,                                   -- who did it (no foreign key: the record outlives a deleted account)
  actor_name text not null default '',
  target uuid,                                  -- whose role or access it was
  target_name text not null default '',
  target_email text not null default '',
  kind text not null check (kind in ('role', 'project_access', 'invite', 'member')),
  action text not null,                         -- in words: "Role changed", "Added to project", ...
  before jsonb,
  after jsonb,
  project_id uuid,
  project_name text,
  reason text,
  status text not null default 'success' check (status in ('success', 'failed')),
  detail text                                   -- for a refused attempt: why
);
create index if not exists audit_log_at on public.audit_log (at desc);
create index if not exists audit_log_target on public.audit_log (target);

alter table public.audit_log enable row level security;
drop policy if exists "admins read the audit log" on public.audit_log;
create policy "admins read the audit log" on public.audit_log for select to authenticated using (public.is_admin());

create or replace function public.audit_log_read_only() returns trigger language plpgsql as $$
begin
  raise exception 'The audit log is read-only: records cannot be changed or deleted.';
end $$;
drop trigger if exists audit_log_no_change on public.audit_log;
create trigger audit_log_no_change before update or delete on public.audit_log for each row execute function public.audit_log_read_only();
drop trigger if exists audit_log_no_truncate on public.audit_log;
create trigger audit_log_no_truncate before truncate on public.audit_log for each statement execute function public.audit_log_read_only();
revoke update, delete, truncate on public.audit_log from anon, authenticated;
