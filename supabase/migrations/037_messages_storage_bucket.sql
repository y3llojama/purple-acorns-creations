-- Create messages bucket for admin reply image uploads and inbound email attachments.
insert into storage.buckets (id, name, public)
  values ('messages', 'messages', true)
  on conflict (id) do nothing;

-- Public read — required for inline email image delivery.
create policy "Public read messages"
  on storage.objects for select
  using (bucket_id = 'messages');

-- Authenticated write — admin uploads only.
create policy "Authenticated upload messages"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'messages');

create policy "Authenticated update messages"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'messages');

create policy "Authenticated delete messages"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'messages');
