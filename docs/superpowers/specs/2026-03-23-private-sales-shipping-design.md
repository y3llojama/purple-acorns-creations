# Private Sales + Shipping Design

**Date:** 2026-03-23
**Status:** Draft

---

## Overview

Two related features:

1. **Private Sale Links** — Admin creates a tokenized URL tied to one or more catalog items at a negotiated price, sends it to a specific customer. The link reserves inventory, expires after a set period (max 2 weeks), and lets the customer pay + submit shipping info without accessing the public shop.

2. **Shipping Costs** — Admin configures a single global shipping rate (fixed flat fee or percentage of order total). Applied at checkout for both the public shop and private sale pages.

---

## Goals

- Allow admin to negotiate and close sales via direct messaging without listing items publicly
- Reserve inventory at link creation so the item can't be bought out from under the customer
- Collect shipping address at checkout (currently not collected anywhere)
- Pass shipping address to Square as fulfillment metadata (Square remains source of truth for orders)
- Keep shipping config simple: one setting, two modes

---

## Non-Goals

- Multi-currency or carrier-calculated shipping (no USPS/UPS API)
- Customer accounts or order history in Supabase
- Discount codes or coupon system (separate future feature)
- Inventory reservation for public cart (private sales only)

---

## Data Model

### New table: `private_sales`

```sql
CREATE TABLE private_sales (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token          UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  created_by     TEXT NOT NULL,              -- admin email
  expires_at     TIMESTAMPTZ NOT NULL,       -- 48h / 7d / 14d from creation
  used_at        TIMESTAMPTZ,               -- null until purchased
  customer_note  TEXT,                      -- optional admin memo
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
```

### New table: `private_sale_items`

```sql
CREATE TABLE private_sale_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  private_sale_id  UUID NOT NULL REFERENCES private_sales(id) ON DELETE CASCADE,
  product_id       UUID NOT NULL REFERENCES products(id),
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  custom_price     NUMERIC(10,2) NOT NULL    -- admin-set, overrides catalog price
);
```

### Modified: `products`

```sql
ALTER TABLE products ADD COLUMN stock_reserved INTEGER NOT NULL DEFAULT 0;
```

**Available stock** (shown publicly) = `stock_count - stock_reserved`
Public checkout validates against available stock, not raw `stock_count`.

### Modified: `settings`

```sql
ALTER TABLE settings ADD COLUMN shipping_mode   TEXT    DEFAULT 'fixed';
ALTER TABLE settings ADD COLUMN shipping_value  NUMERIC(10,2) DEFAULT 0;
```

`shipping_mode`: `'fixed'` (flat fee per order) | `'percentage'` (% of subtotal)
`shipping_value`: dollar amount or percentage (e.g. `8.50` or `10` for 10%)

---

## New Database Functions

### `reserve_private_sale_stock(items JSONB)`

Atomically increments `stock_reserved` for each item. Verifies `stock_count - stock_reserved >= quantity` before reserving. Returns error if any item is unavailable. Called when admin creates a private sale link.

### `release_private_sale_stock(sale_id UUID)`

Decrements `stock_reserved` for all items in a private sale. Called on: link revocation, expiry cleanup, or failed checkout rollback.

### `fulfill_private_sale(sale_id UUID)`

Atomically: decrements `stock_count` for each item (actual sale), decrements `stock_reserved` (releases hold), sets `used_at = NOW()`. Called on successful Square payment.

---

## Admin Interface

### New page: `/app/admin/(dashboard)/private-sales/page.tsx`

**List view:** Table of all private sale links with columns:
- Customer note
- Items (names + quantities)
- Total value (sum of custom prices)
- Expiry date + status badge (Active / Expired / Used)
- Copy link button
- Revoke button (for Active links only — releases stock)

**Create form (modal or dedicated `/private-sales/new`):**
1. Product search/select (multi-select from active catalog)
2. Per-item: quantity + custom price (pre-filled with catalog price, editable)
3. Expiry selector: 48 hours / 7 days / 14 days
4. Customer note (optional, admin-only memo)
5. **Generate Link** → calls `POST /api/admin/private-sales`

On creation the link is displayed with a one-click copy button.

### Modified: Admin Settings page

New **Shipping** section:
- Mode toggle: Fixed fee / Percentage of subtotal
- Value input (dollar amount or %)
- Saves to `settings` table via existing settings API

---

## API Routes

### `POST /api/admin/private-sales`

Creates a private sale link. Requires admin auth (`requireAdminSession()`).

Request body:
```json
{
  "items": [
    { "productId": "uuid", "quantity": 1, "customPrice": 45.00 }
  ],
  "expiresIn": "48h" | "7d" | "14d",
  "customerNote": "optional string"
}
```

- Validates all products exist and are active
- Calls `reserve_private_sale_stock()` — fails if any item insufficient stock
- Inserts `private_sales` + `private_sale_items` rows
- Returns: `{ token, expiresAt, url }`

### `GET /api/admin/private-sales`

Lists all private sales (paginated, sorted newest first). Admin auth required.

### `DELETE /api/admin/private-sales/[id]`

Revokes a link. Calls `release_private_sale_stock()`. Admin auth required.

### `GET /api/shop/private-sale/[token]`

Public route. Returns sale details if valid (not expired, not used).

Response:
```json
{
  "items": [{ "product": {...}, "quantity": 1, "customPrice": 45.00 }],
  "expiresAt": "...",
  "shipping": { "mode": "fixed", "value": 8.50 }
}
```

Lazy expiry: if `expires_at < now` and `used_at` is null → calls `release_private_sale_stock()` then returns 410 Gone.

### `POST /api/shop/private-sale/[token]/checkout`

Public route. Processes payment for a private sale.

Request body:
```json
{
  "sourceId": "square-payment-token",
  "shipping": {
    "name": "Jane Smith",
    "address1": "123 Main St",
    "address2": "",
    "city": "Portland",
    "state": "OR",
    "zip": "97201",
    "country": "US"
  }
}
```

Flow:
1. Validate token (not expired, not used) — 410 if invalid
2. Re-validate stock is still sufficient (`stock_count - stock_reserved >= qty` for each item — the reservation covers this but double-check)
3. Calculate shipping (from settings)
4. Create Square order with line items + fulfillment/shipping address
5. Charge Square payment (`sourceId`)
6. On success: call `fulfill_private_sale()` atomically
7. On Square failure: do NOT release reservation (link still valid for retry); return error to customer
8. Return: `{ orderId }` → redirect to `/shop/confirmation/[orderId]`

### Modified: `POST /api/shop/checkout`

Existing public checkout route. Changes:
- Accept `shipping` object (same shape as above) in request body
- Add shipping cost as a line item in the Square order
- Validate available stock as `stock_count - stock_reserved >= quantity` (not just `stock_count`)

---

## Customer-Facing Page

### New page: `/app/(public)/private-sale/[token]/page.tsx`

- Server-side token validation; renders 404/expired state or sale details
- Shows: item images, names, custom prices, expiry countdown
- Shipping address form (name, address lines, city, state, zip, country)
- Shipping cost line item (calculated from settings, fetched with sale details)
- Square Web Payments card widget (same as existing `CheckoutForm`)
- On success: redirect to `/shop/confirmation/[orderId]`

### Modified: `/components/shop/CheckoutForm.tsx`

- Add shipping address fields above the card widget
- Show shipping cost as a calculated line item
- Pass shipping address in checkout request body

---

## Lazy Expiry Cleanup

No background jobs. Two cleanup points:

1. **On `GET /api/shop/private-sale/[token]`**: if expired and unused, release stock and return 410
2. **On `GET /api/admin/private-sales`**: expired+unused links shown with "Expired" badge; admin can bulk-revoke via UI to release their stock_reserved holds

A note in the admin UI explains that expired links hold stock until revoked or the next time the link is accessed.

---

## Shipping Calculation

```ts
function calculateShipping(subtotal: number, settings: Settings): number {
  if (settings.shipping_value === 0) return 0;
  if (settings.shipping_mode === 'fixed') return settings.shipping_value;
  return parseFloat(((subtotal * settings.shipping_value) / 100).toFixed(2));
}
```

Applied identically in both checkout routes and on the private sale page (client-side preview + server-side verification).

---

## Security Considerations

- Private sale tokens are UUIDs — not guessable, not sequential
- `GET /api/shop/private-sale/[token]` is public but returns minimal data (no admin notes)
- `POST /api/shop/private-sale/[token]/checkout` rate-limited (60s window per IP, same as contact route)
- All admin private sale routes require `requireAdminSession()`
- Shipping address sanitized via `sanitizeText()` before storage or forwarding to Square
- `custom_price` validated server-side (positive number, max 2 decimal places)

---

## Migration

```
supabase/migrations/XXX_private_sales_shipping.sql
```

1. Add `stock_reserved` to `products`
2. Create `private_sales` table with RLS (admin-only read/write)
3. Create `private_sale_items` table with RLS (admin-only read/write)
4. Create `reserve_private_sale_stock`, `release_private_sale_stock`, `fulfill_private_sale` functions
5. Add `shipping_mode`, `shipping_value` to `settings`
6. Update existing `decrement_stock` check to use `stock_count - stock_reserved` (or document that private_sale checkout uses a separate path)

---

## File Checklist

**New files:**
- `supabase/migrations/XXX_private_sales_shipping.sql`
- `app/admin/(dashboard)/private-sales/page.tsx`
- `app/admin/(dashboard)/private-sales/new/page.tsx`
- `app/(public)/private-sale/[token]/page.tsx`
- `app/api/admin/private-sales/route.ts`
- `app/api/admin/private-sales/[id]/route.ts`
- `app/api/shop/private-sale/[token]/route.ts`
- `app/api/shop/private-sale/[token]/checkout/route.ts`
- `components/admin/PrivateSaleList.tsx`
- `components/admin/PrivateSaleForm.tsx`
- `components/shop/PrivateSaleCheckout.tsx`

**Modified files:**
- `app/api/shop/checkout/route.ts` — add shipping, use available stock check
- `components/shop/CheckoutForm.tsx` — add shipping address fields + shipping line item
- `app/admin/(dashboard)/settings/page.tsx` — add shipping config section
- `app/api/admin/settings/route.ts` — handle new shipping fields
- `types.ts` — add `PrivateSale`, `PrivateSaleItem`, shipping types
- `infra/schema.sql` — reflect schema changes
