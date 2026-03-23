insert into recurring_markets (name, location, website_url, frequency, typical_months, notes) values
  ('SoWa Summer Market', 'Boston, MA', 'https://www.sowaboston.com', 'Weekly (Sundays)', 'May–October', 'Outdoor open-air market in the South End. Large artisan + food vendor market, draws thousands weekly. Vendor applications open in winter.'),
  ('SoWa Winter Market', 'Boston, MA', 'https://www.sowaboston.com', 'Weekly (Sundays)', 'November–December', 'Indoor holiday market at SoWa Power Station. High foot traffic during holiday shopping season. Strong craft/artisan focus.'),
  ('Found Market', 'Providence, RI', null, 'Seasonal', 'Spring–Fall', 'Curated artisan and vintage market in Providence. Maker/craft focused. Worth investigating application process.'),
  ('Seaport Market', 'Boston, MA', null, 'Seasonal', 'May–October', 'Outdoor market in the Boston Seaport District. High foot traffic from office workers, tourists, and residents in a fast-growing neighborhood.'),
  ('New England Open Markets', 'Various, New England', 'https://newenglandopenmarkets.com', 'Various', 'Spring–Fall', 'Network of open-air markets across New England. Check site for individual market schedules and vendor applications.')
on conflict (name) do nothing;

-- Update SoWa Open Market note to clarify it is the same as SoWa Summer Market
-- (admin can delete the duplicate once confirmed)
