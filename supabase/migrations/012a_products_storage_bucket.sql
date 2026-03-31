-- Create public storage bucket for product image uploads (Admin → Inventory).
-- on conflict guard makes this safe to re-run.

insert into storage.buckets (id, name, public)
  values ('products', 'products', true)
  on conflict (id) do nothing;

-- Public read (SELECT) — serves product images to all visitors.
create policy "Public read products"
  on storage.objects for select
  using (bucket_id = 'products');

-- Authenticated write (INSERT / UPDATE / DELETE) — admin uploads only.
create policy "Authenticated upload products"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'products');

create policy "Authenticated update products"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'products');

create policy "Authenticated delete products"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'products');
