-- Partial index on resend_message_id for fast In-Reply-To lookup.
-- Most rows are NULL (all outbound replies before this feature, and
-- outbound replies sent without Resend configured), so the partial
-- index stays small and covers only the rows that matter.
create index idx_message_replies_resend_id
  on message_replies(resend_message_id)
  where resend_message_id is not null;
