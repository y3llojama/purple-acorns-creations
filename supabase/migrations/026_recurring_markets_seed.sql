insert into recurring_markets (name, location, website_url, frequency, typical_months, notes) values
  ('SoWa Open Market', 'Boston, MA', 'https://www.sowaboston.com', 'Weekly (Sundays)', 'May–October', 'Large South End artisan + food market. Very popular, draws thousands. Vendor applications open in winter.'),
  ('Greenway Artisan Market', 'Boston, MA', null, 'Weekly', 'June–September', 'Along the Rose Kennedy Greenway. Curated artisan vendors. High foot traffic from tourists and locals.'),
  ('Providence Flea', 'Providence, RI', 'https://www.providenceflea.com', 'Weekly (Sundays)', 'April–November', 'Outdoor seasonal flea and artisan market. Mix of vintage and handmade. One of the larger RI markets.'),
  ('JP Pilot Market', 'Jamaica Plain, MA', null, 'Monthly', 'May–October', 'Neighborhood artisan and maker market in JP. Smaller, community feel. Worth applying for local presence.'),
  ('Somerville Flea', 'Somerville, MA', null, 'Monthly', 'May–October', 'Rotating outdoor flea and artisan market in Davis/Union Square area. Local maker-friendly.'),
  ('Boston Public Market', 'Boston, MA', 'https://bostonpublicmarket.org', 'Year-round', 'January–December', 'Indoor year-round market near Haymarket. Focuses on New England makers and food producers. More permanent vendor slots.'),
  ('Pawtucket Wintertime Market', 'Pawtucket, RI', null, 'Weekly (Saturdays)', 'November–April', 'Indoor winter market at Hope Artiste Village. Artisan and produce vendors. Good off-season opportunity in RI.'),
  ('Charlestown Farmers Market', 'Boston, MA', null, 'Weekly (Wednesdays)', 'June–October', 'Neighborhood market, artisan vendor slots available alongside produce.'),
  ('Burlington Farmers Market', 'Burlington, VT', null, 'Weekly (Saturdays)', 'May–October', 'Large VT market with artisan vendors. Worth considering for VT expansion.'),
  ('Brattleboro Farmers Market', 'Brattleboro, VT', 'https://www.brattleborofarmersmarket.com', 'Weekly (Saturdays)', 'May–October', 'Long-running VT market with established artisan section.'),
  ('Portland Farmers Market', 'Portland, ME', 'https://www.portlandmainefarmersmarket.org', 'Weekly', 'May–November', 'Multiple locations in Portland ME. Artisan vendors welcome alongside produce.'),
  ('Copley Square Farmers Market', 'Boston, MA', null, 'Weekly (Tuesdays & Fridays)', 'May–November', 'High-traffic downtown Boston location. Artisan vendors alongside food. Very visible spot.')
on conflict (name) do nothing;
