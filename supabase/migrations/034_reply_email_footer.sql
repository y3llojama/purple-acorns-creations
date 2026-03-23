-- supabase/migrations/034_reply_email_footer.sql
alter table settings
  add column reply_email_footer text default
    'Please reply to this email to continue our conversation. To send a new message, use our contact form: ${CONTACT_FORM}. This inbox does not accept unsolicited emails.';
-- The ${} placeholders are stored verbatim and resolved at send time
-- by interpolate() in lib/variables.ts -- they are NOT SQL parameters.
