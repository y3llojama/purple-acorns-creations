alter table artist_venues
  add column if not exists commission_rate text,
  add column if not exists booth_fee text,
  add column if not exists avg_shoppers text,
  add column if not exists application_process text;

alter table recurring_markets
  add column if not exists vendor_fee text,
  add column if not exists avg_vendors text,
  add column if not exists avg_shoppers text,
  add column if not exists application_process text;
