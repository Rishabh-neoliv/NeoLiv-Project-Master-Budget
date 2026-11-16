-- A person's home department in the company, chosen on My profile (lib/departments.ts has the list).
-- Project roles (Base Line, Design, Operations, Management) stay per project in project_members.
-- Run once in Supabase → SQL Editor.
alter table public.profiles add column if not exists department text not null default '';
