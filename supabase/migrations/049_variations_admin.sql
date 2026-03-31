-- 049_variations_admin.sql
-- Price constraint (A5) + atomic replace RPC (A2)

-- ═══ Price must be positive ═══
ALTER TABLE product_variations ADD CONSTRAINT chk_pv_price_positive CHECK (price > 0);

-- ═══ Atomic full-replace RPC ═══
-- Accepts the complete desired state of a product's options and variations.
-- Runs inside a single transaction. Handles:
--   - Option create/update/delete
--   - Variation create/update/soft-delete
--   - Default variation lifecycle (A3)
--   - Ownership verification (A6)

CREATE OR REPLACE FUNCTION replace_product_variations(
  p_product_id UUID,
  p_options JSONB,     -- [{ id?, name, values: [{ id?, name, sort_order }] }]
  p_variations JSONB   -- [{ id?, option_values: [name1, name2], price, sku?, is_active }]
) RETURNS JSONB AS $$
DECLARE
  opt JSONB;
  opt_id UUID;
  val JSONB;
  val_id UUID;
  var_rec JSONB;
  var_id UUID;
  incoming_opt_ids UUID[] := '{}';
  incoming_var_ids UUID[] := '{}';
  opt_name TEXT;
  val_name TEXT;
  option_count INT;
  variation_count INT;
  has_orders BOOLEAN;
BEGIN
  -- ═══ Payload limits (A4) ═══
  option_count := jsonb_array_length(COALESCE(p_options, '[]'::jsonb));
  variation_count := jsonb_array_length(COALESCE(p_variations, '[]'::jsonb));
  IF option_count > 3 THEN
    RAISE EXCEPTION 'MAX_OPTIONS: max 3 options per product';
  END IF;
  IF variation_count > 60 THEN
    RAISE EXCEPTION 'MAX_VARIATIONS: max 60 variations per product';
  END IF;

  -- Verify product exists
  IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND';
  END IF;

  -- ═══ Handle empty options = revert to simple product (A3) ═══
  IF option_count = 0 THEN
    -- Pick variation with highest stock as new default
    SELECT id INTO var_id FROM product_variations
      WHERE product_id = p_product_id AND is_active = true
      ORDER BY stock_count DESC, created_at ASC LIMIT 1;

    IF var_id IS NOT NULL THEN
      -- Deactivate all others, make winner the default
      UPDATE product_variations SET is_default = false, is_active = false
        WHERE product_id = p_product_id AND id != var_id;
      UPDATE product_variations SET is_default = true, is_active = true
        WHERE id = var_id;
    END IF;

    -- Remove all product_options (trigger sets has_options = false)
    DELETE FROM product_options WHERE product_id = p_product_id;

    RETURN jsonb_build_object('variations_kept', 1, 'reverted_to_simple', true);
  END IF;

  -- ═══ Process options ═══
  FOR opt IN SELECT * FROM jsonb_array_elements(p_options)
  LOOP
    opt_name := opt->>'name';

    -- Value count limit (A4)
    IF jsonb_array_length(COALESCE(opt->'values', '[]'::jsonb)) > 20 THEN
      RAISE EXCEPTION 'MAX_VALUES: max 20 values per option';
    END IF;

    IF opt->>'id' IS NOT NULL THEN
      -- Update existing option (verify it exists)
      opt_id := (opt->>'id')::UUID;
      UPDATE item_options SET name = opt_name, updated_at = now()
        WHERE id = opt_id;
    ELSE
      -- Create new option
      INSERT INTO item_options (name, display_name, is_reusable)
        VALUES (opt_name, opt_name, true)
        RETURNING id INTO opt_id;
    END IF;
    incoming_opt_ids := incoming_opt_ids || opt_id;

    -- Ensure product_options link exists
    INSERT INTO product_options (product_id, option_id, sort_order)
      VALUES (p_product_id, opt_id, array_position(incoming_opt_ids, opt_id) - 1)
      ON CONFLICT (product_id, option_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

    -- Process option values
    FOR val IN SELECT * FROM jsonb_array_elements(COALESCE(opt->'values', '[]'::jsonb))
    LOOP
      val_name := val->>'name';
      IF val->>'id' IS NOT NULL THEN
        val_id := (val->>'id')::UUID;
        UPDATE item_option_values SET name = val_name,
          sort_order = COALESCE((val->>'sort_order')::INT, 0),
          updated_at = now()
          WHERE id = val_id AND option_id = opt_id;
      ELSE
        INSERT INTO item_option_values (option_id, name, sort_order)
          VALUES (opt_id, val_name, COALESCE((val->>'sort_order')::INT, 0))
          RETURNING id INTO val_id;
      END IF;
    END LOOP;
  END LOOP;

  -- Remove product_options for options no longer attached
  DELETE FROM product_options
    WHERE product_id = p_product_id AND option_id != ALL(incoming_opt_ids);

  -- ═══ Process variations ═══
  FOR var_rec IN SELECT * FROM jsonb_array_elements(p_variations)
  LOOP
    -- Price validation (A5)
    IF (var_rec->>'price')::NUMERIC <= 0 THEN
      RAISE EXCEPTION 'INVALID_PRICE: price must be > 0';
    END IF;

    IF var_rec->>'id' IS NOT NULL THEN
      var_id := (var_rec->>'id')::UUID;
      -- Ownership check (A6): verify this variation belongs to this product
      IF NOT EXISTS (
        SELECT 1 FROM product_variations WHERE id = var_id AND product_id = p_product_id
      ) THEN
        RAISE EXCEPTION 'VARIATION_NOT_OWNED: variation % does not belong to product %', var_id, p_product_id;
      END IF;
      -- Update existing — never touch stock_count (A1)
      UPDATE product_variations SET
        price = (var_rec->>'price')::NUMERIC,
        sku = var_rec->>'sku',
        is_active = COALESCE((var_rec->>'is_active')::BOOLEAN, true),
        updated_at = now()
        WHERE id = var_id AND product_id = p_product_id;
    ELSE
      -- Create new variation — stock starts at 0 (by design)
      INSERT INTO product_variations (product_id, price, sku, stock_count, is_default, is_active)
        VALUES (
          p_product_id,
          (var_rec->>'price')::NUMERIC,
          var_rec->>'sku',
          0,
          false,
          COALESCE((var_rec->>'is_active')::BOOLEAN, true)
        )
        RETURNING id INTO var_id;
    END IF;
    incoming_var_ids := incoming_var_ids || var_id;

    -- Rebuild variation_option_values for this variation
    DELETE FROM variation_option_values WHERE variation_id = var_id;
    IF var_rec->'option_value_ids' IS NOT NULL THEN
      INSERT INTO variation_option_values (variation_id, option_value_id)
        SELECT var_id, (jval.value)::UUID
        FROM jsonb_array_elements_text(var_rec->'option_value_ids') jval;
    END IF;
  END LOOP;

  -- ═══ Soft-delete removed variations (A7) ═══
  -- Check for order history before deleting
  FOR var_id IN
    SELECT pv.id FROM product_variations pv
    WHERE pv.product_id = p_product_id
      AND pv.id != ALL(incoming_var_ids)
      AND pv.is_active = true
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM order_line_items WHERE variation_id = var_id
      UNION ALL
      SELECT 1 FROM stock_movements WHERE variation_id = var_id
    ) INTO has_orders;

    IF has_orders THEN
      UPDATE product_variations SET is_active = false, is_default = false, updated_at = now()
        WHERE id = var_id;
    ELSE
      DELETE FROM product_variations WHERE id = var_id;
    END IF;
  END LOOP;

  -- Also deactivate the old default variation (A3)
  UPDATE product_variations SET is_default = false
    WHERE product_id = p_product_id AND is_default = true
      AND id != ALL(incoming_var_ids);

  -- Set first incoming variation as default if none is default
  IF NOT EXISTS (
    SELECT 1 FROM product_variations
    WHERE product_id = p_product_id AND is_default = true AND is_active = true
  ) THEN
    UPDATE product_variations SET is_default = true
      WHERE id = incoming_var_ids[1];
  END IF;

  RETURN jsonb_build_object(
    'options_count', option_count,
    'variations_count', array_length(incoming_var_ids, 1)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
