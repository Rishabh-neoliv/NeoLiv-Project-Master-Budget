-- Workflow emails go to everyone a step concerns in ONE email, with the person who took the step in Cc
-- (approved templates, docs/Email templates.md, 2026-11-16). The Power Automate outbox needs the Cc addresses.
-- Run once in Supabase → SQL Editor. Until it is run, emails are still sent, just without the Cc copy.
alter table public.email_outbox add column if not exists cc text not null default '';
