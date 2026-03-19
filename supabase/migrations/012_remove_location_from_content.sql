-- Remove hardcoded location and email from default content.
-- All contact details should flow from admin configuration.

update content
set value = 'Crochet jewelry, sterling silver, and artisan pieces made with love by a mother-daughter duo.'
where key = 'hero_subtext'
  and value like '%Brooklyn%';

update content
set value = replace(
  replace(value, 'purpleacornzcreations@gmail.com · Brooklyn, NY', 'Questions? <a href="${CONTACT_FORM}">Send us a message</a>.'),
  'Purple Acorns Creations ("we"', '${BUSINESS_NAME} ("we"'
)
where key = 'privacy_policy'
  and value like '%Brooklyn%';

update content
set value = replace(value, 'purpleacornzcreations@gmail.com · Brooklyn, NY', 'Questions? <a href="${CONTACT_FORM}">Send us a message</a>.')
where key = 'terms_of_service'
  and value like '%Brooklyn%';
