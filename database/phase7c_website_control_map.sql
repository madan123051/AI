-- Phase 7C - Website Control Map
-- Run this in Supabase SQL Editor if public.website_control_map is missing.

create table if not exists public.website_control_map (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  collection_name text not null,
  display_name text not null default '',
  create_action text not null default '',
  update_action text not null default '',
  delete_action text not null default '',
  publish_behavior text not null default '',
  source_file text not null default '',
  source_function text not null default '',
  status text not null default 'review_required',
  action_statuses jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.website_control_map add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table public.website_control_map add column if not exists collection_name text not null default '';
alter table public.website_control_map add column if not exists display_name text not null default '';
alter table public.website_control_map add column if not exists create_action text not null default '';
alter table public.website_control_map add column if not exists update_action text not null default '';
alter table public.website_control_map add column if not exists delete_action text not null default '';
alter table public.website_control_map add column if not exists publish_behavior text not null default '';
alter table public.website_control_map add column if not exists source_file text not null default '';
alter table public.website_control_map add column if not exists source_function text not null default '';
alter table public.website_control_map add column if not exists status text not null default 'review_required';
alter table public.website_control_map add column if not exists action_statuses jsonb not null default '{}'::jsonb;
alter table public.website_control_map add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.website_control_map add column if not exists created_at timestamptz not null default now();
alter table public.website_control_map add column if not exists updated_at timestamptz not null default now();
alter table public.website_control_map drop column if exists owner_id;
alter table public.website_control_map drop constraint if exists website_control_map_status_check;
alter table public.website_control_map add constraint website_control_map_status_check check (status in ('available', 'review_required', 'blocked'));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'website_control_map_project_collection_key') then
    alter table public.website_control_map add constraint website_control_map_project_collection_key unique (project_id, collection_name);
  end if;
end $$;

create index if not exists website_control_map_project_id_idx on public.website_control_map(project_id);
create index if not exists website_control_map_collection_name_idx on public.website_control_map(collection_name);

insert into public.rules (name, action, effect, enabled)
select 'Update Live Content', 'update_live_content', 'review', true
where not exists (select 1 from public.rules where action = 'update_live_content');

insert into public.rules (name, action, effect, enabled)
select 'Reply Comment', 'reply_comment', 'review', true
where not exists (select 1 from public.rules where action = 'reply_comment');

grant select, insert, update, delete on public.website_control_map to anon, authenticated;

alter table public.website_control_map enable row level security;

drop policy if exists "allow anon read website_control_map" on public.website_control_map;
drop policy if exists "allow anon insert website_control_map" on public.website_control_map;
drop policy if exists "allow anon update website_control_map" on public.website_control_map;
drop policy if exists "allow anon delete website_control_map" on public.website_control_map;

create policy "allow anon read website_control_map" on public.website_control_map for select to anon, authenticated using (true);
create policy "allow anon insert website_control_map" on public.website_control_map for insert to anon, authenticated with check (true);
create policy "allow anon update website_control_map" on public.website_control_map for update to anon, authenticated using (true) with check (true);
create policy "allow anon delete website_control_map" on public.website_control_map for delete to anon, authenticated using (true);
