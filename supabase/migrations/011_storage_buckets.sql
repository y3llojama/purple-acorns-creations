-- Create public storage buckets used by the admin image uploader.
-- 'branding' — logo and hero image uploads (Admin → Branding)
-- 'gallery'  — gallery photo uploads (Admin → Gallery)
-- on conflict guard makes this safe to re-run.

insert into storage.buckets (id, name, public)
  values ('branding', 'branding', true)
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
  values ('gallery', 'gallery', true)
  on conflict (id) do nothing;

-- Public read (SELECT) for both buckets — serves images to all visitors.
create policy "Public read branding"
  on storage.objects for select
  using (bucket_id = 'branding');

create policy "Public read gallery"
  on storage.objects for select
  using (bucket_id = 'gallery');

-- Authenticated write (INSERT / UPDATE / DELETE) — admin uploads only.
create policy "Authenticated upload branding"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'branding');

create policy "Authenticated update branding"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'branding');

create policy "Authenticated delete branding"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'branding');

create policy "Authenticated upload gallery"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'gallery');

create policy "Authenticated update gallery"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'gallery');

create policy "Authenticated delete gallery"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'gallery');
