insert into recurring_markets (name, location, typical_months, notes) values
  ('Live Freely Market', 'Hampton, NH', 'Summer', 'Outdoor artisan/maker market in Hampton, NH. Fill in vendor fee, frequency, and application process from their site or Instagram.')
on conflict (name) do nothing;
