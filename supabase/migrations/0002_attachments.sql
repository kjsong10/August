-- Add optional attachments to messages as JSONB
alter table if exists public.messages
  add column if not exists attachments jsonb;


