-- Phase 7D - Media Library
-- Run this in Supabase SQL Editor to enable draft/published media statuses.

alter table public.media_assets add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.media_assets add column if not exists updated_at timestamptz not null default now();

alter table public.media_assets drop constraint if exists media_assets_status_check;
alter table public.media_assets add constraint media_assets_status_check check (status in ('draft', 'published', 'archived', 'available', 'attached'));

update public.media_assets
set metadata = jsonb_set(
  coalesce(metadata, '{}'::jsonb),
  '{workflow_status}',
  to_jsonb(case when status = 'attached' then 'published' when status = 'available' then 'draft' else status end),
  true
)
where status in ('available', 'attached', 'draft', 'published', 'archived');

create index if not exists media_assets_project_id_idx on public.media_assets(project_id);
create index if not exists media_assets_content_item_id_idx on public.media_assets(content_item_id);
create index if not exists media_assets_status_idx on public.media_assets(status);
create index if not exists media_assets_asset_type_idx on public.media_assets(asset_type);

grant select, insert, update, delete on public.media_assets to anon, authenticated;

alter table public.media_assets enable row level security;

drop policy if exists "allow anon read media_assets" on public.media_assets;
drop policy if exists "allow anon insert media_assets" on public.media_assets;
drop policy if exists "allow anon update media_assets" on public.media_assets;
drop policy if exists "allow anon delete media_assets" on public.media_assets;

create policy "allow anon read media_assets" on public.media_assets for select to anon, authenticated using (true);
create policy "allow anon insert media_assets" on public.media_assets for insert to anon, authenticated with check (true);
create policy "allow anon update media_assets" on public.media_assets for update to anon, authenticated using (true) with check (true);
create policy "allow anon delete media_assets" on public.media_assets for delete to anon, authenticated using (true);
