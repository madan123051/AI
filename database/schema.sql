create extension if not exists pgcrypto;

-- AI Handover Control Center - Supabase MVP schema
-- Safe to run multiple times in the Supabase SQL editor.
-- RLS stays enabled, with open anon/authenticated policies for the MVP.

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects add column if not exists description text not null default '';
alter table public.projects add column if not exists created_at timestamptz not null default now();
alter table public.projects add column if not exists updated_at timestamptz not null default now();
alter table public.projects add column if not exists status text not null default 'active';
alter table public.projects add column if not exists archived_at timestamptz;
alter table public.projects drop column if exists owner_id;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'projects_status_check') then
    alter table public.projects add constraint projects_status_check check (status in ('active', 'archived'));
  end if;
end $$;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  goal text not null,
  priority text not null default 'medium',
  status text not null default 'queued',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tasks add column if not exists priority text not null default 'medium';
alter table public.tasks add column if not exists status text not null default 'queued';
alter table public.tasks add column if not exists created_at timestamptz not null default now();
alter table public.tasks add column if not exists updated_at timestamptz not null default now();
alter table public.tasks drop column if exists owner_id;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_priority_check') then
    alter table public.tasks add constraint tasks_priority_check check (priority in ('low', 'medium', 'high'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'tasks_status_check') then
    alter table public.tasks add constraint tasks_status_check check (status in ('queued', 'in_progress', 'needs_review', 'completed', 'blocked'));
  end if;
end $$;

-- Upgrade older live databases where projects -> tasks was created without cascade.
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'tasks_project_id_fkey'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks drop constraint tasks_project_id_fkey;
  end if;

  alter table public.tasks
    add constraint tasks_project_id_fkey
    foreign key (project_id)
    references public.projects(id)
    on delete cascade;
end $$;

create table if not exists public.task_states (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null unique references public.tasks(id) on delete cascade,
  goal text not null,
  current_stage text not null,
  completed_steps text[] not null default '{}',
  next_step text not null,
  last_ai text not null default 'Unassigned',
  status text not null default 'queued',
  needs_review boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.task_states drop column if exists owner_id;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'task_states_status_check') then
    alter table public.task_states add constraint task_states_status_check check (status in ('queued', 'in_progress', 'needs_review', 'completed', 'blocked'));
  end if;
end $$;

create table if not exists public.action_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  actor text not null default 'System',
  action text not null,
  details text not null default '',
  created_at timestamptz not null default now()
);

alter table public.action_logs add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table public.action_logs add column if not exists task_id uuid references public.tasks(id) on delete set null;
alter table public.action_logs add column if not exists actor text not null default 'System';
alter table public.action_logs add column if not exists action text not null default 'system.event';
alter table public.action_logs add column if not exists details text not null default '';
alter table public.action_logs add column if not exists created_at timestamptz not null default now();
alter table public.action_logs drop column if exists owner_id;

create table if not exists public.handoff_summaries (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  from_ai text not null default 'Unknown',
  to_ai text not null default 'Unknown',
  summary text not null default '',
  handoff_pack jsonb not null default '{}'::jsonb,
  completeness_score integer not null default 0,
  ready_for_transfer boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.handoff_summaries add column if not exists from_ai text not null default 'Unknown';
alter table public.handoff_summaries add column if not exists to_ai text not null default 'Unknown';
alter table public.handoff_summaries add column if not exists summary text not null default '';
alter table public.handoff_summaries add column if not exists handoff_pack jsonb not null default '{}'::jsonb;
alter table public.handoff_summaries add column if not exists completeness_score integer not null default 0;
alter table public.handoff_summaries add column if not exists ready_for_transfer boolean not null default false;
alter table public.handoff_summaries add column if not exists created_at timestamptz not null default now();
alter table public.handoff_summaries drop column if exists owner_id;

create table if not exists public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  ai_model text not null default 'Unknown',
  input text not null default '',
  output text not null default '',
  status text not null default 'completed',
  cost_usd numeric(10, 6) not null default 0,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.ai_runs add column if not exists ai_model text not null default 'Unknown';
alter table public.ai_runs add column if not exists input text not null default '';
alter table public.ai_runs add column if not exists output text not null default '';
alter table public.ai_runs add column if not exists status text not null default 'completed';
alter table public.ai_runs add column if not exists cost_usd numeric(10, 6) not null default 0;
alter table public.ai_runs add column if not exists prompt_tokens integer not null default 0;
alter table public.ai_runs add column if not exists completion_tokens integer not null default 0;
alter table public.ai_runs add column if not exists total_tokens integer not null default 0;
alter table public.ai_runs add column if not exists created_at timestamptz not null default now();
alter table public.ai_runs drop column if exists owner_id;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ai_runs_status_check') then
    alter table public.ai_runs add constraint ai_runs_status_check check (status in ('completed', 'failed'));
  end if;
end $$;

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null default 'Review AI draft',
  requested_action text not null default 'review',
  reason text not null default '',
  status text not null default 'pending',
  action_type text not null default 'reply_message',
  connector text not null default 'website',
  target_id text not null default '',
  target_type text not null default 'message',
  draft_text text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  execution_status text not null default 'pending_review',
  execution_error text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.approvals add column if not exists title text not null default 'Review AI draft';
alter table public.approvals add column if not exists requested_action text not null default 'review';
alter table public.approvals add column if not exists reason text not null default '';
alter table public.approvals add column if not exists status text not null default 'pending';
alter table public.approvals add column if not exists action_type text not null default 'reply_message';
alter table public.approvals add column if not exists connector text not null default 'website';
alter table public.approvals add column if not exists target_id text not null default '';
alter table public.approvals add column if not exists target_type text not null default 'message';
alter table public.approvals add column if not exists draft_text text not null default '';
alter table public.approvals add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.approvals add column if not exists execution_status text not null default 'pending_review';
alter table public.approvals add column if not exists execution_error text;
alter table public.approvals add column if not exists created_at timestamptz not null default now();
alter table public.approvals add column if not exists resolved_at timestamptz;
alter table public.approvals drop column if exists owner_id;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'approvals_status_check') then
    alter table public.approvals add constraint approvals_status_check check (status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

alter table public.approvals drop constraint if exists approvals_action_type_check;
alter table public.approvals add constraint approvals_action_type_check check (action_type in ('reply_comment', 'reply_message', 'send_email', 'publish_content', 'update_content'));

alter table public.approvals drop constraint if exists approvals_connector_check;
alter table public.approvals add constraint approvals_connector_check check (connector in ('website', 'email', 'instagram', 'facebook'));

alter table public.approvals drop constraint if exists approvals_execution_status_check;
alter table public.approvals add constraint approvals_execution_status_check check (execution_status in ('pending_review', 'approved', 'executing', 'executed', 'failed', 'execution_pending'));

create table if not exists public.rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  action text not null,
  effect text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.rules drop column if exists owner_id;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rules_effect_check') then
    alter table public.rules add constraint rules_effect_check check (effect in ('allow', 'review', 'block'));
  end if;
end $$;

insert into public.rules (name, action, effect, enabled)
values
  ('Create Draft', 'draft_content', 'allow', true),
  ('Publish Post', 'publish_content', 'review', true),
  ('Send Email', 'send_email', 'review', true),
  ('Delete Post', 'delete_resource', 'block', true)
on conflict do nothing;

insert into public.rules (name, action, effect, enabled)
select 'Update Live Content', 'update_live_content', 'review', true
where not exists (select 1 from public.rules where action = 'update_live_content');

insert into public.rules (name, action, effect, enabled)
select 'Reply Comment', 'reply_comment', 'review', true
where not exists (select 1 from public.rules where action = 'reply_comment');

create table if not exists public.project_memory (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  brand_tone text not null default 'Nature documentary',
  target_channels text[] not null default array['Instagram', 'TikTok'],
  posting_style text not null default 'Macro wildlife',
  hashtag_style text not null default 'Medium competition',
  notes text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.connectors (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  type text not null,
  status text not null default 'not_connected',
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.connectors add column if not exists updated_at timestamptz not null default now();
alter table public.connectors drop column if exists owner_id;

alter table public.connectors drop constraint if exists connectors_type_check;
alter table public.connectors add constraint connectors_type_check check (type in ('email', 'gmail', 'instagram', 'facebook', 'website', 'viber', 'storage'));

alter table public.connectors drop constraint if exists connectors_status_check;
alter table public.connectors add constraint connectors_status_check check (status in ('not_connected', 'not_configured', 'configured', 'test_pending', 'connected', 'error', 'paused'));

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

create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
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

create table if not exists public.content_posts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  channel text not null,
  title text not null,
  body text not null,
  status text not null default 'draft',
  scheduled_for timestamptz,
  created_at timestamptz not null default now()
);

alter table public.content_posts drop column if exists owner_id;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'content_posts_channel_check') then
    alter table public.content_posts add constraint content_posts_channel_check check (channel in ('instagram', 'facebook', 'website', 'email'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'content_posts_status_check') then
    alter table public.content_posts add constraint content_posts_status_check check (status in ('draft', 'needs_review', 'scheduled', 'published'));
  end if;
end $$;

create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  title text not null,
  content_type text not null default 'post',
  caption_body text not null default '',
  media_placeholder text not null default '',
  status text not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.content_items add column if not exists task_id uuid references public.tasks(id) on delete set null;
alter table public.content_items add column if not exists title text not null default '';
alter table public.content_items add column if not exists content_type text not null default 'post';
alter table public.content_items add column if not exists caption_body text not null default '';
alter table public.content_items add column if not exists media_placeholder text not null default '';
alter table public.content_items add column if not exists status text not null default 'draft';
alter table public.content_items add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.content_items add column if not exists created_at timestamptz not null default now();
alter table public.content_items add column if not exists updated_at timestamptz not null default now();
alter table public.content_items drop column if exists owner_id;
alter table public.content_items drop constraint if exists content_items_type_check;
alter table public.content_items drop constraint if exists content_items_status_check;
alter table public.content_items add constraint content_items_type_check check (content_type in ('post', 'story', 'website_page', 'blog', 'reel'));
alter table public.content_items add constraint content_items_status_check check (status in ('draft', 'scheduled', 'approval_required', 'published', 'failed'));

create table if not exists public.content_routes (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  platform text not null,
  target_route text not null default '',
  route_label text not null default '',
  status text not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.content_routes add column if not exists platform text not null default 'website';
alter table public.content_routes add column if not exists target_route text not null default '';
alter table public.content_routes add column if not exists route_label text not null default '';
alter table public.content_routes add column if not exists status text not null default 'draft';
alter table public.content_routes add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.content_routes add column if not exists created_at timestamptz not null default now();
alter table public.content_routes drop column if exists owner_id;
alter table public.content_routes drop constraint if exists content_routes_platform_check;
alter table public.content_routes drop constraint if exists content_routes_status_check;
alter table public.content_routes add constraint content_routes_platform_check check (platform in ('website', 'instagram', 'facebook'));
alter table public.content_routes add constraint content_routes_status_check check (status in ('draft', 'scheduled', 'approval_required', 'published', 'failed'));

create table if not exists public.content_schedule (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null unique references public.content_items(id) on delete cascade,
  scheduled_for timestamptz,
  timezone text not null default 'local',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.content_schedule add column if not exists scheduled_for timestamptz;
alter table public.content_schedule add column if not exists timezone text not null default 'local';
alter table public.content_schedule add column if not exists status text not null default 'draft';
alter table public.content_schedule add column if not exists created_at timestamptz not null default now();
alter table public.content_schedule add column if not exists updated_at timestamptz not null default now();
alter table public.content_schedule drop column if exists owner_id;
alter table public.content_schedule drop constraint if exists content_schedule_status_check;
alter table public.content_schedule add constraint content_schedule_status_check check (status in ('draft', 'scheduled', 'approval_required', 'published', 'failed'));

create table if not exists public.publish_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  route_id uuid references public.content_routes(id) on delete set null,
  action text not null default 'mock_publish',
  status text not null default 'approval_required',
  details text not null default '',
  created_at timestamptz not null default now()
);

alter table public.publish_logs add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table public.publish_logs add column if not exists content_item_id uuid references public.content_items(id) on delete cascade;
alter table public.publish_logs add column if not exists route_id uuid references public.content_routes(id) on delete set null;
alter table public.publish_logs add column if not exists action text not null default 'mock_publish';
alter table public.publish_logs add column if not exists status text not null default 'approval_required';
alter table public.publish_logs add column if not exists details text not null default '';
alter table public.publish_logs add column if not exists created_at timestamptz not null default now();
alter table public.publish_logs drop column if exists owner_id;
alter table public.publish_logs drop constraint if exists publish_logs_status_check;
alter table public.publish_logs add constraint publish_logs_status_check check (status in ('draft', 'scheduled', 'approval_required', 'published', 'failed', 'blocked'));

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  content_item_id uuid references public.content_items(id) on delete set null,
  title text not null,
  asset_type text not null default 'image',
  source_url text not null default '',
  storage_path text not null default '',
  alt_text text not null default '',
  tags text[] not null default '{}',
  status text not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.media_assets add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table public.media_assets add column if not exists content_item_id uuid references public.content_items(id) on delete set null;
alter table public.media_assets add column if not exists title text not null default '';
alter table public.media_assets add column if not exists asset_type text not null default 'image';
alter table public.media_assets add column if not exists source_url text not null default '';
alter table public.media_assets add column if not exists storage_path text not null default '';
alter table public.media_assets add column if not exists alt_text text not null default '';
alter table public.media_assets add column if not exists tags text[] not null default '{}';
alter table public.media_assets add column if not exists status text not null default 'draft';
alter table public.media_assets add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.media_assets add column if not exists created_at timestamptz not null default now();
alter table public.media_assets add column if not exists updated_at timestamptz not null default now();
alter table public.media_assets drop column if exists owner_id;
alter table public.media_assets drop constraint if exists media_assets_type_check;
alter table public.media_assets drop constraint if exists media_assets_status_check;
alter table public.media_assets add constraint media_assets_type_check check (asset_type in ('image', 'video', 'document', 'audio', 'other'));
alter table public.media_assets add constraint media_assets_status_check check (status in ('draft', 'published', 'archived', 'available', 'attached'));

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  connector_id uuid references public.connectors(id) on delete set null,
  source text not null default 'website',
  sender_name text not null default '',
  sender_handle text not null default '',
  subject text not null default '',
  body text not null,
  received_at timestamptz not null default now(),
  status text not null default 'unread',
  priority text not null default 'medium',
  linked_task_id uuid references public.tasks(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  direction text not null default 'inbound',
  sender text not null default '',
  created_at timestamptz not null default now()
);

alter table public.messages add column if not exists source text not null default 'website';
alter table public.messages add column if not exists sender_name text not null default '';
alter table public.messages add column if not exists sender_handle text not null default '';
alter table public.messages add column if not exists subject text not null default '';
alter table public.messages add column if not exists body text not null default '';
alter table public.messages add column if not exists received_at timestamptz not null default now();
alter table public.messages add column if not exists priority text not null default 'medium';
alter table public.messages add column if not exists linked_task_id uuid references public.tasks(id) on delete set null;
alter table public.messages add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.messages add column if not exists direction text not null default 'inbound';
alter table public.messages add column if not exists sender text not null default '';
alter table public.messages add column if not exists status text not null default 'unread';
alter table public.messages add column if not exists created_at timestamptz not null default now();
alter table public.messages drop column if exists owner_id;
alter table public.messages alter column source set default 'website';
alter table public.messages alter column sender_name set default '';
alter table public.messages alter column sender_handle set default '';
alter table public.messages alter column received_at set default now();
alter table public.messages alter column status set default 'unread';
alter table public.messages alter column priority set default 'medium';
alter table public.messages alter column metadata set default '{}'::jsonb;
alter table public.messages alter column direction set default 'inbound';
alter table public.messages alter column sender set default '';

alter table public.messages drop constraint if exists messages_direction_check;
alter table public.messages drop constraint if exists messages_status_check;
alter table public.messages drop constraint if exists messages_source_check;
alter table public.messages drop constraint if exists messages_priority_check;

update public.messages
set
  source = coalesce(nullif(source, ''), 'website'),
  sender_name = coalesce(nullif(sender_name, ''), nullif(sender, ''), 'Unknown sender'),
  sender_handle = coalesce(sender_handle, ''),
  received_at = coalesce(received_at, created_at, now()),
  priority = coalesce(nullif(priority, ''), 'medium'),
  metadata = coalesce(metadata, '{}'::jsonb),
  direction = coalesce(nullif(direction, ''), 'inbound'),
  sender = coalesce(nullif(sender, ''), nullif(sender_handle, ''), nullif(sender_name, ''), 'Unknown sender'),
  status = case
    when status = 'new' then 'unread'
    when status = 'summarized' then 'read'
    when status = 'closed' then 'archived'
    when status in ('unread', 'read', 'drafted', 'replied', 'archived') then status
    else 'unread'
  end;

alter table public.messages drop constraint if exists messages_direction_check;
alter table public.messages drop constraint if exists messages_status_check;
alter table public.messages drop constraint if exists messages_source_check;
alter table public.messages drop constraint if exists messages_priority_check;
alter table public.messages add constraint messages_direction_check check (direction in ('inbound', 'outbound'));
alter table public.messages add constraint messages_status_check check (status in ('unread', 'read', 'drafted', 'replied', 'archived'));
alter table public.messages add constraint messages_source_check check (source in ('gmail', 'website', 'instagram', 'facebook', 'viber'));
alter table public.messages add constraint messages_priority_check check (priority in ('low', 'medium', 'high'));

create index if not exists tasks_project_id_idx on public.tasks(project_id);
create index if not exists task_states_task_id_idx on public.task_states(task_id);
create index if not exists action_logs_task_id_idx on public.action_logs(task_id);
create index if not exists handoff_summaries_task_id_idx on public.handoff_summaries(task_id);
create index if not exists ai_runs_task_id_idx on public.ai_runs(task_id);
create index if not exists approvals_task_id_status_idx on public.approvals(task_id, status);
create index if not exists projects_status_idx on public.projects(status);
create index if not exists ai_runs_task_id_created_at_idx on public.ai_runs(task_id, created_at desc);
create index if not exists project_memory_project_id_idx on public.project_memory(project_id);
create index if not exists connectors_project_id_idx on public.connectors(project_id);
create index if not exists connectors_project_type_idx on public.connectors(project_id, type);
create index if not exists website_control_map_project_id_idx on public.website_control_map(project_id);
create index if not exists website_control_map_collection_name_idx on public.website_control_map(collection_name);
create index if not exists automation_rules_project_id_idx on public.automation_rules(project_id);
create index if not exists automation_rules_status_idx on public.automation_rules(status);
create index if not exists content_posts_project_id_idx on public.content_posts(project_id);
create index if not exists content_items_project_id_idx on public.content_items(project_id);
create index if not exists content_items_task_id_idx on public.content_items(task_id);
create index if not exists content_items_status_idx on public.content_items(status);
create index if not exists content_routes_content_item_id_idx on public.content_routes(content_item_id);
create index if not exists content_routes_platform_idx on public.content_routes(platform);
create index if not exists content_schedule_content_item_id_idx on public.content_schedule(content_item_id);
create index if not exists content_schedule_scheduled_for_idx on public.content_schedule(scheduled_for);
create index if not exists publish_logs_content_item_id_idx on public.publish_logs(content_item_id);
create index if not exists publish_logs_project_id_created_at_idx on public.publish_logs(project_id, created_at desc);
create index if not exists media_assets_project_id_idx on public.media_assets(project_id);
create index if not exists media_assets_content_item_id_idx on public.media_assets(content_item_id);
create index if not exists media_assets_status_idx on public.media_assets(status);
create index if not exists media_assets_asset_type_idx on public.media_assets(asset_type);
create index if not exists messages_project_id_idx on public.messages(project_id);
create index if not exists messages_project_status_received_idx on public.messages(project_id, status, received_at desc);
create index if not exists messages_linked_task_id_idx on public.messages(linked_task_id);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.task_states enable row level security;
alter table public.action_logs enable row level security;
alter table public.handoff_summaries enable row level security;
alter table public.ai_runs enable row level security;
alter table public.approvals enable row level security;
alter table public.rules enable row level security;
alter table public.project_memory enable row level security;
alter table public.connectors enable row level security;
alter table public.website_control_map enable row level security;
alter table public.automation_rules enable row level security;
alter table public.content_posts enable row level security;
alter table public.content_items enable row level security;
alter table public.content_routes enable row level security;
alter table public.content_schedule enable row level security;
alter table public.publish_logs enable row level security;
alter table public.media_assets enable row level security;
alter table public.messages enable row level security;

drop policy if exists "allow anon read projects" on public.projects;
drop policy if exists "allow anon insert projects" on public.projects;
drop policy if exists "allow anon update projects" on public.projects;
drop policy if exists "allow anon delete projects" on public.projects;
drop policy if exists "allow anon read tasks" on public.tasks;
drop policy if exists "allow anon insert tasks" on public.tasks;
drop policy if exists "allow anon update tasks" on public.tasks;
drop policy if exists "allow anon delete tasks" on public.tasks;
drop policy if exists "allow anon read task_states" on public.task_states;
drop policy if exists "allow anon insert task_states" on public.task_states;
drop policy if exists "allow anon update task_states" on public.task_states;
drop policy if exists "allow anon delete task_states" on public.task_states;
drop policy if exists "allow anon read action_logs" on public.action_logs;
drop policy if exists "allow anon insert action_logs" on public.action_logs;
drop policy if exists "allow anon delete action_logs" on public.action_logs;
drop policy if exists "allow anon read handoff_summaries" on public.handoff_summaries;
drop policy if exists "allow anon insert handoff_summaries" on public.handoff_summaries;
drop policy if exists "allow anon delete handoff_summaries" on public.handoff_summaries;
drop policy if exists "allow anon read ai_runs" on public.ai_runs;
drop policy if exists "allow anon insert ai_runs" on public.ai_runs;
drop policy if exists "allow anon delete ai_runs" on public.ai_runs;
drop policy if exists "allow anon read approvals" on public.approvals;
drop policy if exists "allow anon insert approvals" on public.approvals;
drop policy if exists "allow anon update approvals" on public.approvals;
drop policy if exists "allow anon delete approvals" on public.approvals;
drop policy if exists "allow anon read rules" on public.rules;
drop policy if exists "allow anon insert rules" on public.rules;
drop policy if exists "allow anon update rules" on public.rules;
drop policy if exists "allow anon read project_memory" on public.project_memory;
drop policy if exists "allow anon insert project_memory" on public.project_memory;
drop policy if exists "allow anon update project_memory" on public.project_memory;
drop policy if exists "allow anon delete project_memory" on public.project_memory;
drop policy if exists "allow anon read connectors" on public.connectors;
drop policy if exists "allow anon insert connectors" on public.connectors;
drop policy if exists "allow anon update connectors" on public.connectors;
drop policy if exists "allow anon delete connectors" on public.connectors;
drop policy if exists "allow anon read website_control_map" on public.website_control_map;
drop policy if exists "allow anon insert website_control_map" on public.website_control_map;
drop policy if exists "allow anon update website_control_map" on public.website_control_map;
drop policy if exists "allow anon delete website_control_map" on public.website_control_map;
drop policy if exists "allow anon read automation_rules" on public.automation_rules;
drop policy if exists "allow anon insert automation_rules" on public.automation_rules;
drop policy if exists "allow anon update automation_rules" on public.automation_rules;
drop policy if exists "allow anon delete automation_rules" on public.automation_rules;
drop policy if exists "allow anon read content_posts" on public.content_posts;
drop policy if exists "allow anon insert content_posts" on public.content_posts;
drop policy if exists "allow anon update content_posts" on public.content_posts;
drop policy if exists "allow anon delete content_posts" on public.content_posts;
drop policy if exists "allow anon read content_items" on public.content_items;
drop policy if exists "allow anon insert content_items" on public.content_items;
drop policy if exists "allow anon update content_items" on public.content_items;
drop policy if exists "allow anon delete content_items" on public.content_items;
drop policy if exists "allow anon read content_routes" on public.content_routes;
drop policy if exists "allow anon insert content_routes" on public.content_routes;
drop policy if exists "allow anon update content_routes" on public.content_routes;
drop policy if exists "allow anon delete content_routes" on public.content_routes;
drop policy if exists "allow anon read content_schedule" on public.content_schedule;
drop policy if exists "allow anon insert content_schedule" on public.content_schedule;
drop policy if exists "allow anon update content_schedule" on public.content_schedule;
drop policy if exists "allow anon delete content_schedule" on public.content_schedule;
drop policy if exists "allow anon read publish_logs" on public.publish_logs;
drop policy if exists "allow anon insert publish_logs" on public.publish_logs;
drop policy if exists "allow anon update publish_logs" on public.publish_logs;
drop policy if exists "allow anon delete publish_logs" on public.publish_logs;
drop policy if exists "allow anon read media_assets" on public.media_assets;
drop policy if exists "allow anon insert media_assets" on public.media_assets;
drop policy if exists "allow anon update media_assets" on public.media_assets;
drop policy if exists "allow anon delete media_assets" on public.media_assets;
drop policy if exists "allow anon read messages" on public.messages;
drop policy if exists "allow anon insert messages" on public.messages;
drop policy if exists "allow anon update messages" on public.messages;
drop policy if exists "allow anon delete messages" on public.messages;

create policy "allow anon read projects" on public.projects for select to anon, authenticated using (true);
create policy "allow anon insert projects" on public.projects for insert to anon, authenticated with check (true);
create policy "allow anon update projects" on public.projects for update to anon, authenticated using (true) with check (true);
create policy "allow anon delete projects" on public.projects for delete to anon, authenticated using (true);
create policy "allow anon read tasks" on public.tasks for select to anon, authenticated using (true);
create policy "allow anon insert tasks" on public.tasks for insert to anon, authenticated with check (true);
create policy "allow anon update tasks" on public.tasks for update to anon, authenticated using (true) with check (true);
create policy "allow anon delete tasks" on public.tasks for delete to anon, authenticated using (true);
create policy "allow anon read task_states" on public.task_states for select to anon, authenticated using (true);
create policy "allow anon insert task_states" on public.task_states for insert to anon, authenticated with check (true);
create policy "allow anon update task_states" on public.task_states for update to anon, authenticated using (true) with check (true);
create policy "allow anon delete task_states" on public.task_states for delete to anon, authenticated using (true);
create policy "allow anon read action_logs" on public.action_logs for select to anon, authenticated using (true);
create policy "allow anon insert action_logs" on public.action_logs for insert to anon, authenticated with check (true);
create policy "allow anon delete action_logs" on public.action_logs for delete to anon, authenticated using (true);
create policy "allow anon read handoff_summaries" on public.handoff_summaries for select to anon, authenticated using (true);
create policy "allow anon insert handoff_summaries" on public.handoff_summaries for insert to anon, authenticated with check (true);
create policy "allow anon delete handoff_summaries" on public.handoff_summaries for delete to anon, authenticated using (true);
create policy "allow anon read ai_runs" on public.ai_runs for select to anon, authenticated using (true);
create policy "allow anon insert ai_runs" on public.ai_runs for insert to anon, authenticated with check (true);
create policy "allow anon delete ai_runs" on public.ai_runs for delete to anon, authenticated using (true);
create policy "allow anon read approvals" on public.approvals for select to anon, authenticated using (true);
create policy "allow anon insert approvals" on public.approvals for insert to anon, authenticated with check (true);
create policy "allow anon update approvals" on public.approvals for update to anon, authenticated using (true) with check (true);
create policy "allow anon delete approvals" on public.approvals for delete to anon, authenticated using (true);
create policy "allow anon read rules" on public.rules for select to anon, authenticated using (true);
create policy "allow anon insert rules" on public.rules for insert to anon, authenticated with check (true);
create policy "allow anon update rules" on public.rules for update to anon, authenticated using (true) with check (true);
create policy "allow anon read project_memory" on public.project_memory for select to anon, authenticated using (true);
create policy "allow anon insert project_memory" on public.project_memory for insert to anon, authenticated with check (true);
create policy "allow anon update project_memory" on public.project_memory for update to anon, authenticated using (true) with check (true);
create policy "allow anon delete project_memory" on public.project_memory for delete to anon, authenticated using (true);
create policy "allow anon read connectors" on public.connectors for select to anon, authenticated using (true);
create policy "allow anon insert connectors" on public.connectors for insert to anon, authenticated with check (true);
create policy "allow anon update connectors" on public.connectors for update to anon, authenticated using (true) with check (true);
create policy "allow anon delete connectors" on public.connectors for delete to anon, authenticated using (true);
create policy "allow anon read website_control_map" on public.website_control_map for select to anon, authenticated using (true);
create policy "allow anon insert website_control_map" on public.website_control_map for insert to anon, authenticated with check (true);
create policy "allow anon update website_control_map" on public.website_control_map for update to anon, authenticated using (true) with check (true);
create policy "allow anon delete website_control_map" on public.website_control_map for delete to anon, authenticated using (true);
create policy "allow anon read automation_rules" on public.automation_rules for select to anon, authenticated using (true);
create policy "allow anon insert automation_rules" on public.automation_rules for insert to anon, authenticated with check (true);
create policy "allow anon update automation_rules" on public.automation_rules for update to anon, authenticated using (true) with check (true);
create policy "allow anon delete automation_rules" on public.automation_rules for delete to anon, authenticated using (true);
create policy "allow anon read content_posts" on public.content_posts for select to anon, authenticated using (true);
create policy "allow anon insert content_posts" on public.content_posts for insert to anon, authenticated with check (true);
create policy "allow anon update content_posts" on public.content_posts for update to anon, authenticated using (true) with check (true);
create policy "allow anon delete content_posts" on public.content_posts for delete to anon, authenticated using (true);
create policy "allow anon read content_items" on public.content_items for select to anon, authenticated using (true);
create policy "allow anon insert content_items" on public.content_items for insert to anon, authenticated with check (true);
create policy "allow anon update content_items" on public.content_items for update to anon, authenticated using (true) with check (true);
create policy "allow anon delete content_items" on public.content_items for delete to anon, authenticated using (true);
create policy "allow anon read content_routes" on public.content_routes for select to anon, authenticated using (true);
create policy "allow anon insert content_routes" on public.content_routes for insert to anon, authenticated with check (true);
create policy "allow anon update content_routes" on public.content_routes for update to anon, authenticated using (true) with check (true);
create policy "allow anon delete content_routes" on public.content_routes for delete to anon, authenticated using (true);
create policy "allow anon read content_schedule" on public.content_schedule for select to anon, authenticated using (true);
create policy "allow anon insert content_schedule" on public.content_schedule for insert to anon, authenticated with check (true);
create policy "allow anon update content_schedule" on public.content_schedule for update to anon, authenticated using (true) with check (true);
create policy "allow anon delete content_schedule" on public.content_schedule for delete to anon, authenticated using (true);
create policy "allow anon read publish_logs" on public.publish_logs for select to anon, authenticated using (true);
create policy "allow anon insert publish_logs" on public.publish_logs for insert to anon, authenticated with check (true);
create policy "allow anon update publish_logs" on public.publish_logs for update to anon, authenticated using (true) with check (true);
create policy "allow anon delete publish_logs" on public.publish_logs for delete to anon, authenticated using (true);
create policy "allow anon read media_assets" on public.media_assets for select to anon, authenticated using (true);
create policy "allow anon insert media_assets" on public.media_assets for insert to anon, authenticated with check (true);
create policy "allow anon update media_assets" on public.media_assets for update to anon, authenticated using (true) with check (true);
create policy "allow anon delete media_assets" on public.media_assets for delete to anon, authenticated using (true);
create policy "allow anon read messages" on public.messages for select to anon, authenticated using (true);
create policy "allow anon insert messages" on public.messages for insert to anon, authenticated with check (true);
create policy "allow anon update messages" on public.messages for update to anon, authenticated using (true) with check (true);
create policy "allow anon delete messages" on public.messages for delete to anon, authenticated using (true);

