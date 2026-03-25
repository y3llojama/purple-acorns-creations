-- Atomic "claim" mechanism for private-sale checkout.
-- Prevents the double-charge race condition where two concurrent requests both
-- pass the used_at / revoked_at check and both charge the customer's card.
--
-- claim_private_sale: atomically marks the sale as in-flight.
--   Returns TRUE if this caller claimed it, FALSE if another caller already has it
--   (or the sale is no longer active).
--   A claim older than 5 minutes is considered stale (server crash / network timeout)
--   and can be overwritten.
--
-- release_private_sale_claim: clears the claim on payment failure so the customer
--   can retry.

ALTER TABLE private_sales
  ADD COLUMN IF NOT EXISTS processing_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION claim_private_sale(sale_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE private_sales
  SET processing_at = NOW()
  WHERE id = sale_id
    AND used_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > NOW()
    AND (processing_at IS NULL OR processing_at < NOW() - INTERVAL '5 minutes');

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION release_private_sale_claim(sale_id UUID)
RETURNS void AS $$
  UPDATE private_sales SET processing_at = NULL WHERE id = sale_id AND used_at IS NULL;
$$ LANGUAGE plpgsql SECURITY DEFINER;
