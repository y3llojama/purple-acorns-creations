# Tiered Shipping by Destination

**Date:** 2026-04-01
**Status:** Approved

## Summary

Split the single global shipping rate into three geographic tiers so the admin can set independent rates for US domestic, Canada/Mexico, and international orders. Each tier has its own mode (fixed $ or % of subtotal) and value.

## Data Model

Keep existing `shipping_mode` + `shipping_value` as US domestic tier. Add 4 columns:

| Column | Type | Default | Constraint |
|--------|------|---------|------------|
| `shipping_mode_canada_mexico` | `TEXT NOT NULL` | `'fixed'` | `IN ('fixed', 'percentage')` |
| `shipping_value_canada_mexico` | `NUMERIC(10,2) NOT NULL` | `0` | `>= 0` |
| `shipping_mode_intl` | `TEXT NOT NULL` | `'fixed'` | `IN ('fixed', 'percentage')` |
| `shipping_value_intl` | `NUMERIC(10,2) NOT NULL` | `0` | `>= 0` |

Defaults to free shipping (0) so existing behavior is unchanged until admin configures new tiers.

## Core Logic — `lib/shipping.ts`

New function `resolveShippingTier(country, allSettings)`:
- Normalizes country to uppercase
- `"US"` → existing `shipping_mode` / `shipping_value`
- `"CA"` | `"MX"` → `shipping_mode_canada_mexico` / `shipping_value_canada_mexico`
- Anything else → `shipping_mode_intl` / `shipping_value_intl`
- Returns `{ shipping_mode, shipping_value }` — same shape as existing

`calculateShipping(subtotal, tier)` is unchanged.

## Country Validation

- Server-side checkout routes validate country as `/^[A-Z]{2}$/` after uppercasing + trimming
- Reject with 400 if invalid
- Unknown codes (e.g. "ZZ") default to international tier — the most expensive, which is the safe failure mode
- Client-side country field stays free-text with validation on submit

## Security — Server Is Authoritative

- Server recalculates shipping from DB settings + submitted country code
- Client-side preview is cosmetic only — the charge uses the server's calculation
- A user faking a cheaper-tier country code gets caught by address verification (Square 3DS) and physical fulfillment mismatch
- Unknown country codes fall to the most expensive tier (intl), so there's no user benefit from faking

## Admin UI — `ShippingEditor.tsx`

Three labeled sections sharing a single Save button:
1. **US Domestic** — existing mode/value (no label change needed)
2. **Canada & Mexico** — new mode/value
3. **International** — new mode/value

Each section has a mode `<select>` and a value `<input type="number">`.

## API Changes

### `POST /api/admin/settings`
Accept 4 new fields with same validation pattern:
- `shipping_mode_canada_mexico` — allowlist `['fixed', 'percentage']`
- `shipping_value_canada_mexico` — range `[0, 10000]`
- `shipping_mode_intl` — allowlist `['fixed', 'percentage']`
- `shipping_value_intl` — range `[0, 10000]`

### `GET /api/shop/shipping-config`
Return all three tiers:
```json
{
  "domestic": { "shipping_mode": "fixed", "shipping_value": 5 },
  "canada_mexico": { "shipping_mode": "fixed", "shipping_value": 12 },
  "intl": { "shipping_mode": "percentage", "shipping_value": 8 }
}
```

### Checkout routes (both regular + private sale)
- Extend `.select()` to include all 6 shipping columns
- Validate country format server-side
- Call `resolveShippingTier()` then `calculateShipping()`

## Client-Side Checkout

- Fetch all tiers from `/api/shop/shipping-config`
- Recalculate displayed shipping when country field changes
- Pass country to `resolveShippingTier()` for preview

## Files to Modify

| File | Change |
|------|--------|
| `supabase/migrations/047_tiered_shipping.sql` | Add 4 columns |
| `lib/supabase/types.ts` | Add 4 fields to `Settings` |
| `lib/shipping.ts` | Add `resolveShippingTier()` |
| `components/admin/ShippingEditor.tsx` | 3-tier UI |
| `app/admin/(dashboard)/settings/page.tsx` | Pass new initial values |
| `app/api/admin/settings/route.ts` | Validate + save new fields |
| `app/api/shop/shipping-config/route.ts` | Return all tiers |
| `app/api/shop/checkout/route.ts` | Country validation + tier resolution |
| `app/api/shop/private-sale/[token]/checkout/route.ts` | Country validation + tier resolution |
| `app/api/shop/private-sale/[token]/route.ts` | Return all tiers in sale data |
| `components/shop/CheckoutForm.tsx` | Use tiers for preview |
| `components/shop/PrivateSaleCheckout.tsx` | Use tiers for preview |

## Review Findings Addressed

- **Architect:** Two-function design (resolveShippingTier + calculateShipping), all `.select()` strings updated
- **Security:** Server authoritative on pricing, country validated server-side, unknown codes → most expensive tier
- **DBA:** Flat columns correct, `_canada_mexico` naming (explicit), NOT NULL DEFAULT, no DB upper bound (API handles it), SQL comments in migration
