#!/usr/bin/env bash
# reconcile-variation-stock.sh
# Run immediately before deploying the code switch.
# Re-reads products.stock_count and patches any diverged product_variations rows.
# Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.

set -euo pipefail

SUPABASE_URL="${SUPABASE_URL:-${NEXT_PUBLIC_SUPABASE_URL:?Set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL}}"
: "${SUPABASE_SERVICE_ROLE_KEY:?Set SUPABASE_SERVICE_ROLE_KEY}"

API="${SUPABASE_URL}/rest/v1"
AUTH="apikey: ${SUPABASE_SERVICE_ROLE_KEY}"
BEARER="Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"

echo "=== Reconcile variation stock ==="

# Fetch all products with their stock
products=$(curl -s "${API}/products?select=id,stock_count,stock_reserved,square_variation_id" \
  -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json")

count=$(echo "$products" | jq length)
echo "Found $count products to reconcile"

fixed=0
for row in $(echo "$products" | jq -c '.[]'); do
  pid=$(echo "$row" | jq -r '.id')
  pstock=$(echo "$row" | jq -r '.stock_count')
  preserv=$(echo "$row" | jq -r '.stock_reserved')

  # Get the default variation for this product
  var=$(curl -s "${API}/product_variations?product_id=eq.${pid}&is_default=eq.true&limit=1" \
    -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json")

  var_id=$(echo "$var" | jq -r '.[0].id // empty')
  var_stock=$(echo "$var" | jq -r '.[0].stock_count // empty')

  if [ -z "$var_id" ]; then
    echo "WARN: No default variation for product $pid — skipping"
    continue
  fi

  if [ "$var_stock" != "$pstock" ]; then
    echo "FIX: Product $pid — variation stock $var_stock != product stock $pstock"
    curl -s -X PATCH "${API}/product_variations?id=eq.${var_id}" \
      -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
      -H "Prefer: return=minimal" \
      -d "{\"stock_count\": $pstock, \"stock_reserved\": $preserv}" > /dev/null
    fixed=$((fixed + 1))
  fi
done

echo "=== Done: $fixed variations reconciled ==="
