-- supabase/migrations/024_markets_seed.sql
-- New England Craft Fairs (seeded 2026-03-22)
insert into craft_fairs (name, location, website_url, instagram_url, years_in_operation, avg_artists, avg_shoppers, typical_months, notes)
values
  ('Boston Renegade Craft Fair', 'Boston, MA', 'https://renegadecraft.com/boston', 'https://www.instagram.com/renegadecraft/', 'est. 2003', '200+', '10,000+', 'October', null),
  ('Providence Flea', 'Providence, RI', 'https://providenceflea.com', 'https://www.instagram.com/providenceflea/', 'est. 2011', '60–100', '2,000–5,000', 'May–October (weekly)', null),
  ('Cambridge Arts River Festival', 'Cambridge, MA', 'https://cambridgearts.org/programs/riverfestival/', null, 'est. 1978', '100+', '50,000+', 'June', null),
  ('South End Open Market', 'Boston, MA', 'https://southendopenmarket.com', 'https://www.instagram.com/southendopenmarket/', 'est. 2006', '80–120', '3,000–8,000', 'May–October (Sundays)', null),
  ('Vermont Holiday Craft Fair', 'Burlington, VT', 'https://vhcf.org', null, 'est. 1975', '150+', '5,000+', 'November', null),
  ('CraftBoston Holiday', 'Boston, MA', 'https://societyofcrafts.org/craftboston', 'https://www.instagram.com/craftboston/', 'est. 1993', '100+', '8,000+', 'December', null),
  ('Worcester Craft Center Craft Fair', 'Worcester, MA', 'https://worcestercraftcenter.org', null, 'est. 1960s', '50–80', '1,000–3,000', 'November', null),
  ('Northampton Arts & Crafts Fair', 'Northampton, MA', null, null, '20+ years', '80–120', '2,000–4,000', 'May', null),
  ('Portland Flea-for-All', 'Portland, ME', 'https://portlandfleatreasures.com', 'https://www.instagram.com/portlandfleatreasures/', 'est. 2010', '60–90', '1,500–3,000', 'May–October (Sundays)', null),
  ('Seacoast Artist Association Fair', 'Exeter, NH', 'https://seacoastartist.org', null, '50+ years', '50–80', '1,000–2,500', 'July', null),
  ('Deerfield Craft Fair', 'Deerfield, NH', 'https://nhcrafts.org/deerfield', 'https://www.instagram.com/nhcraftsfairs/', 'est. 1971', '250+', '10,000+', 'September', null),
  ('League of NH Craftsmen Fair', 'Newbury, NH', 'https://nhcrafts.org/fair', null, 'est. 1933', '200+', '15,000+', 'August', null),
  ('Newport Craft Fair', 'Newport, RI', null, null, '10+ years', '40–60', '1,000–2,000', 'October', null),
  ('Waltham Mills Open Studios', 'Waltham, MA', 'https://walthamcreativearts.com', null, '15+ years', '80+', '2,000+', 'November', null),
  ('Lowell Summer Music Series Market', 'Lowell, MA', 'https://lowellsummermusic.org', 'https://www.instagram.com/lowellsummermusic/', 'est. 1982', '30–50', '3,000+', 'July–August', null),
  ('Marlborough Harvest Day Craft Fair', 'Marlborough, MA', 'https://visit-marlborough.com', null, '20+ years', '50–80', '2,000–4,000', 'October', null),
  ('Big E Eastern States Exposition', 'West Springfield, MA', 'https://thebige.com', 'https://www.instagram.com/thebige/', 'est. 1916', '100+', '100,000+ (total fair)', 'September', null),
  ('SoWa Open Market', 'Boston, MA', 'https://sowaboston.com', 'https://www.instagram.com/sowaboston/', 'est. 2006', '100+', '5,000+', 'May–October (Sundays)', null),
  ('Jamaica Plain Open Studios', 'Jamaica Plain, MA', 'https://jpopenStudios.org', 'https://www.instagram.com/jpopenStudios/', 'est. 1994', '100+', '5,000+', 'October', null),
  ('Putnam Arts Council Craft Fair', 'Putnam, CT', null, null, '15+ years', '30–50', '500–1,500', 'November', null)
on conflict (name) do nothing;

-- Artist-Hosting Stores & Collectives
insert into artist_venues (name, location, website_url, instagram_url, hosting_model, notes)
values
  ('Brighton Bazaar', 'Brighton, MA', 'https://www.brightonbazaar.com', 'https://www.instagram.com/brightonbazaar/', 'Vendor market / pop-up collective', 'Was selling here until recently'),
  ('Imagine Gift Store', 'Narragansett, RI', null, null, 'Consignment', 'Was selling here'),
  ('Coop Gallery', 'Northampton, MA', 'https://coopgallery.org', 'https://www.instagram.com/coopgallery/', 'Member cooperative / consignment', null),
  ('Artisan''s Asylum Shop', 'Somerville, MA', 'https://artisansasylum.com', 'https://www.instagram.com/artisansasylum/', 'Member collective retail', null),
  ('Made in Lowell', 'Lowell, MA', null, 'https://www.instagram.com/madeinlowell/', 'Consignment / local artist focus', null),
  ('The Maker''s Toolbox', 'Worcester, MA', null, null, 'Consignment + booth rental', null),
  ('Circle of Crafts', 'Plymouth, MA', null, null, 'Collective / consignment', null),
  ('Craftland', 'Providence, RI', 'https://craftlandshop.com', 'https://www.instagram.com/craftlandshop/', 'Curated consignment / wholesale', null),
  ('Reverie Boutique', 'Portsmouth, NH', null, 'https://www.instagram.com/reverieboutiqueph/', 'Consignment / local artists', null),
  ('Wild Craft Emporium', 'Portland, ME', null, null, 'Collective / booth rental', null),
  ('Trident Booksellers & Café', 'Boston, MA', 'https://www.tridentbookscafe.com', 'https://www.instagram.com/tridentbooksboston/', 'Rotating art display / consignment', null),
  ('The Paper Store', 'Various MA/NH/RI', 'https://thepaperstore.com', null, 'Local artist wholesale program', null)
on conflict (name) do nothing;
