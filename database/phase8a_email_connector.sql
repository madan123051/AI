-- Phase 8A: allow custom email connector metadata and setup statuses.

alter table public.connectors drop constraint if exists connectors_type_check;
alter table public.connectors
  add constraint connectors_type_check
  check (type in ('email', 'gmail', 'instagram', 'facebook', 'website', 'viber', 'storage'));

alter table public.connectors drop constraint if exists connectors_status_check;
alter table public.connectors
  add constraint connectors_status_check
  check (status in ('not_connected', 'not_configured', 'configured', 'test_pending', 'connected', 'error', 'paused'));
