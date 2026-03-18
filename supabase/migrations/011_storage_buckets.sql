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
