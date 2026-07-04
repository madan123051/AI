-- Phase 8B: approval action payload and connector execution status.

alter table public.approvals add column if not exists action_type text not null default 'reply_message';
alter table public.approvals add column if not exists connector text not null default 'website';
alter table public.approvals add column if not exists target_id text not null default '';
alter table public.approvals add column if not exists target_type text not null default 'message';
alter table public.approvals add column if not exists draft_text text not null default '';
alter table public.approvals add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.approvals add column if not exists execution_status text not null default 'pending_review';
alter table public.approvals add column if not exists execution_error text;

update public.approvals
set execution_status = case
  when status = 'pending' then 'pending_review'
  when status = 'approved' then 'approved'
  when status = 'rejected' then 'failed'
  else execution_status
end
where execution_status is null
   or execution_status not in ('pending_review', 'approved', 'executing', 'executed', 'failed', 'execution_pending');

update public.approvals
set action_type = case
  when requested_action like 'reply_comment:%' then 'reply_comment'
  when requested_action like 'publish_content:%' then 'publish_content'
  when requested_action = 'send_email' then 'send_email'
  when requested_action = 'update_content' then 'update_content'
  else action_type
end
where action_type is null
   or action_type not in ('reply_comment', 'reply_message', 'send_email', 'publish_content', 'update_content');

update public.approvals
set target_id = case
  when requested_action like 'reply_comment:%' then split_part(requested_action, ':', 2)
  when requested_action like 'publish_content:%' then split_part(requested_action, ':', 2)
  else target_id
end
where coalesce(target_id, '') = '';

update public.approvals
set target_type = case
  when action_type = 'publish_content' then 'content_item'
  when action_type in ('reply_comment', 'reply_message', 'send_email') then 'message'
  else target_type
end
where coalesce(target_type, '') = '';

alter table public.approvals drop constraint if exists approvals_action_type_check;
alter table public.approvals
  add constraint approvals_action_type_check
  check (action_type in ('reply_comment', 'reply_message', 'send_email', 'publish_content', 'update_content'));

alter table public.approvals drop constraint if exists approvals_connector_check;
alter table public.approvals
  add constraint approvals_connector_check
  check (connector in ('website', 'email', 'instagram', 'facebook'));

alter table public.approvals drop constraint if exists approvals_execution_status_check;
alter table public.approvals
  add constraint approvals_execution_status_check
  check (execution_status in ('pending_review', 'approved', 'executing', 'executed', 'failed', 'execution_pending'));
