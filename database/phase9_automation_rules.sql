-- Phase 9: Automation rules table only.
-- Run this in Supabase SQL Editor if Automation says the table is missing.

create extension if not exists pgcrypto;

create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  name text not null default 'Untitled automation',
  trigger text not null default 'daily_report',
  action text not null default 'generate_report',
  schedule text not null default 'manual',
  status text not null default 'paused',
  config jsonb not null default '{}'::jsonb,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.automation_rules add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table public.automation_rules add column if not exists name text not null default 'Untitled automation';
alter table public.automation_rules add column if not exists trigger text not null default 'daily_report';
alter table public.automation_rules add column if not exists action text not null default 'generate_report';
alter table public.automation_rules add column if not exists schedule text not null default 'manual';
alter table public.automation_rules add column if not exists status text not null default 'paused';
alter table public.automation_rules add column if not exists config jsonb not null default '{}'::jsonb;
alter table public.automation_rules add column if not exists last_run_at timestamptz;
alter table public.automation_rules add column if not exists created_at timestamptz not null default now();
alter table public.automation_rules add column if not exists updated_at timestamptz not null default now();
alter table public.automation_rules drop column if exists owner_id;

alter table public.automation_rules drop constraint if exists automation_rules_trigger_check;
alter table public.automation_rules drop constraint if exists automation_rules_action_check;
alter table public.automation_rules drop constraint if exists automation_rules_status_check;
alter table public.automation_rules add constraint automation_rules_trigger_check check (trigger in ('daily_report', 'new_message', 'content_scheduled', 'handoff_completed', 'approval_pending'));
alter table public.automation_rules add constraint automation_rules_action_check check (action in ('create_task', 'draft_reply', 'generate_report', 'notify_user', 'draft_content'));
alter table public.automation_rules add constraint automation_rules_status_check check (status in ('active', 'paused'));

create index if not exists automation_rules_project_id_idx on public.automation_rules(project_id);
create index if not exists automation_rules_status_idx on public.automation_rules(status);

alter table public.automation_rules enable row level security;

drop policy if exists "allow anon read automation_rules" on public.automation_rules;
drop policy if exists "allow anon insert automation_rules" on public.automation_rules;
drop policy if exists "allow anon update automation_rules" on public.automation_rules;
drop policy if exists "allow anon delete automation_rules" on public.automation_rules;

create policy "allow anon read automation_rules" on public.automation_rules for select to anon, authenticated using (true);
create policy "allow anon insert automation_rules" on public.automation_rules for insert to anon, authenticated with check (true);
create policy "allow anon update automation_rules" on public.automation_rules for update to anon, authenticated using (true) with check (true);
create policy "allow anon delete automation_rules" on public.automation_rules for delete to anon, authenticated using (true);
