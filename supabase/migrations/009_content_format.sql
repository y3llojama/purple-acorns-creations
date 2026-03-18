-- Seed format keys for HTML content fields (default 'html').
-- Format is stored as a sibling key: e.g. story_full__format = 'html' | 'markdown'
insert into content (key, value) values
  ('story_full__format',      'html'),
  ('privacy_policy__format',  'html'),
  ('terms_of_service__format','html')
on conflict (key) do nothing;
