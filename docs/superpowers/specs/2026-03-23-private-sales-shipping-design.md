# Private Sales + Shipping Design

**Date:** 2026-03-23
**Status:** Revised (post-review)

---

## Overview

Two related features:

1. **Private Sale Links** — Admin creates a tokenized URL tied to one or more catalog items at a negotiated price, sends it to a specific customer. The link reserves inventory, expires after a set period (max 2 weeks), and lets the customer pay + submit shipping info without accessing the public shop.

2. **Shipping Costs** — Admin configures a single global shipping rate (fixed flat fee or percentage of order total). Applied at checkout for both the public shop and private sale pages.

---

## Goals

- Allow admin to negotiate and close sales via direct messaging without listing items publicly
- Reserve inventory at link creation so the item can't be bought out from under the customer
- Collect shipping address at checkout (required for both public shop and private sale checkout)
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
  created_by     TEXT NOT NULL,              -- admin email from getUser().email
  expires_at     TIMESTAMPTZ NOT NULL,       -- 48h / 7d / 14d from creation (UTC)
  used_at        TIMESTAMPTZ,               -- null until purchased
  revoked_at     TIMESTAMPTZ,               -- null until admin revokes
  customer_note  TEXT,                      -- optional admin memo (never exposed to customer)
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
```

Links are soft-deleted (never hard-deleted) to preserve audit history. A link is considered "active" when `used_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()`.

`created_by` is set from `user.email` returned by `getUser()`. If email is null (should not occur given the ADMIN_EMAILS allowlist), the API returns 500.

### New table: `private_sale_items`

```sql
CREATE TABLE private_sale_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  private_sale_id  UUID NOT NULL REFERENCES private_sales(id) ON DELETE CASCADE,
  product_id       UUID NOT NULL REFERENCES products(id),
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  custom_price     NUMERIC(10,2) NOT NULL CHECK (custom_price > 0)
);
```

### Modified: `products`

```sql
ALTER TABLE products ADD COLUMN stock_reserved INTEGER NOT NULL DEFAULT 0;
```

**Available stock** (shown publicly and used in all stock checks) = `stock_count - stock_reserved`.

### Modified: `settings`

```sql
ALTER TABLE settings
  ADD COLUMN shipping_mode   TEXT           NOT NULL DEFAULT 'fixed',
  ADD COLUMN shipping_value  NUMERIC(10,2)  NOT NULL DEFAULT 0 CHECK (shipping_value >= 0);
```

`shipping_mode`: `'fixed'` (flat fee per order) | `'percentage'` (% of subtotal)
`shipping_value`: dollar amount or percentage (e.g. `8.50` for $8.50, or `10` for 10%)

---

## New Database Functions

### `reserve_private_sale_stock(items JSONB)`

Atomically increments `stock_reserved` for each item in the list. Verifies `stock_count - stock_reserved >= quantity` before reserving each row (using `SELECT FOR UPDATE` to prevent races). If any item fails the check, the whole transaction rolls back and an error is returned. Called when admin creates a private sale link.

### `release_private_sale_stock(sale_id UUID)`

Atomically within a single transaction: sets `revoked_at = NOW()` on the `private_sales` row (if not already set), then decrements `stock_reserved` for all items using `GREATEST(stock_reserved - quantity, 0)` to guard against double-decrement from concurrent calls. Idempotent — safe to call multiple times (if `revoked_at` is already set the update is a no-op, the GREATEST guard handles the stock decrement). By combining both steps in one function, all callers (revocation, lazy expiry, checkout rollback) get atomic consistency without managing a two-step transaction themselves.

### `fulfill_private_sale(sale_id UUID)`

Atomically within a single transaction:
1. Selects the `private_sales` row `FOR UPDATE`
2. Verifies `used_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()` — returns error if any check fails (prevents double-fulfillment or fulfillment of a revoked/expired link)
3. Decrements `stock_count` for each item. `products.stock_count` has a `CHECK (stock_count >= 0)` constraint — if it would go negative (e.g., due to manual admin correction), the transaction fails, triggering the Square refund path in the caller
4. Decrements `stock_reserved` for each item using `GREATEST(stock_reserved - quantity, 0)`
5. Sets `used_at = NOW()`

Returns the updated sale row. Called only after a confirmed Square payment.

### Modified: `decrement_stock(product_id UUID, qty INTEGER)`

**Decision: update this function** to check `stock_count - stock_reserved >= qty` instead of `stock_count >= qty`. This closes the TOCTOU window where a public buyer could decrement into reserved stock. All callers (existing public checkout + new private sale checkout) use the same correct condition.

---

## Admin Interface

### New page: `/app/admin/(dashboard)/private-sales/page.tsx`

**List view:** Table of all private sale links, sorted newest first, paginated (20 per page). Columns:
- Customer note
- Items (names + quantities)
- Total value (sum of `custom_price × quantity`)
- Expiry date + status badge: `Active` / `Expired` / `Used` / `Revoked`
- Copy link button (Active only)
- Revoke button (Active only — sets `revoked_at`, releases stock)

On page load, the API auto-releases stock for all expired+unused links (see Lazy Expiry Cleanup). The list reflects post-cleanup state.

**Create form** (dedicated `/private-sales/new` page):
1. Product search/select (multi-select from active catalog, shows available stock)
2. Per-item: quantity + custom price (pre-filled with catalog price, editable)
3. Expiry selector: 48 hours / 7 days / 14 days
4. Customer note (optional, admin-only memo)
5. **Generate Link** → calls `POST /api/admin/private-sales`

On creation the link is displayed with a one-click copy button.

### Modified: Admin Settings page

New **Shipping** section:
- Mode toggle: Fixed fee / Percentage of subtotal
- Value input (dollar amount or %; validated ≥ 0 server-side)
- Saves to `settings` table via existing settings API

---

## API Routes

### `POST /api/admin/private-sales`

Creates a private sale link. Requires `requireAdminSession()`.

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
- `customPrice` validated: positive number, max 2 decimal places
- `expiresIn` mapped to UTC timestamp: `48h → NOW() + INTERVAL '48 hours'`, `7d → + INTERVAL '7 days'`, `14d → + INTERVAL '14 days'`
- Calls `reserve_private_sale_stock()` — rolls back and returns 409 if any item has insufficient available stock
- Inserts `private_sales` (with `created_by = user.email`) + `private_sale_items` rows
- Returns: `{ id, token, expiresAt, url }` where `url` is constructed as `${process.env.NEXT_PUBLIC_SITE_URL}/private-sale/<token>`. `NEXT_PUBLIC_SITE_URL` must be set in `.env` / Vercel env vars (e.g. `https://purpleacornscreations.com`). Add it to `.env.example` with a placeholder value

### `GET /api/admin/private-sales`

Lists all private sales. Admin auth required.

- **Auto-releases stock** for all expired+unused+un-revoked links before returning results, by calling `release_private_sale_stock()` (which atomically sets `revoked_at` and releases stock in one transaction per link). Capped at 50 links per request to keep response time bounded; remaining expired links are cleaned up on subsequent page loads
- Query params: `?page=1&limit=20`
- Response: `{ data: PrivateSale[], total: number, page: number, limit: number }`

### `DELETE /api/admin/private-sales/[id]`

Revokes an active link. Admin auth required. Calls `release_private_sale_stock()` which atomically sets `revoked_at = NOW()` and releases reserved stock. Returns 409 if link is already used or revoked.

### `GET /api/shop/private-sale/[token]`

Public route. Rate-limited: 30 requests per 60s per IP.

Returns sale details if valid. Unknown tokens and expired/revoked/used tokens all return **410 Gone** (no distinction to prevent enumeration).

On 410 case where `expires_at < NOW()` and `used_at IS NULL` and `revoked_at IS NULL`: calls `release_private_sale_stock()` before returning (lazy expiry cleanup). Uses `GREATEST` guard in `release_private_sale_stock` for concurrency safety.

Response (200 only):
```json
{
  "items": [
    {
      "product": { "id", "name", "description", "price", "images", "is_active" },
      "quantity": 1,
      "customPrice": 45.00
    }
  ],
  "expiresAt": "2026-03-25T10:00:00Z",
  "shipping": { "mode": "fixed", "value": 8.50 }
}
```

Internal fields (`square_catalog_id`, `square_variation_id`, `pinterest_product_id`, `stock_count`, `stock_reserved`, `created_by`, `customer_note`) are never returned to the public.

### `POST /api/shop/private-sale/[token]/checkout`

Public route. Rate-limited: 10 requests per 60s per IP (same pattern as `POST /api/shop/checkout`).

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

All shipping fields sanitized via `sanitizeText()` before being passed to Square. No PII is stored in Supabase.

Flow:
1. Validate token: active (`used_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()`) — return 410 if invalid
2. Re-validate stock (belt-and-suspenders): `stock_count - stock_reserved >= qty` for each item
3. Calculate shipping from settings
4. Create Square order with line items (including a shipping line item) + fulfillment address
5. Charge Square payment (`sourceId`). `amountMoney` = **(subtotal in cents) + (shipping in cents)** — must match the Square order total exactly
6. **On Square payment success**: call `fulfill_private_sale(sale_id)` atomically
   - If `fulfill_private_sale()` fails (DB error): **issue a Square refund** (same rollback pattern as the existing `increment_stock` path in `POST /api/shop/checkout`), log the error with `paymentId` and `sale_id`, return 500 to customer
7. **On Square payment failure**: do NOT release reservation — the link stays active regardless of whether the failure is transient (card decline, network error) or non-retriable (source token already used, invalid card data). In all failure cases the customer must obtain a new Square payment token from the Web Payments widget and retry. The error response body must include `{ error: string }` with a human-readable message the client can display (e.g. "Payment declined — please try a different card"). The link expiry countdown continues normally
8. On success: return `{ orderId }` → customer redirected to `/shop/confirmation/[orderId]`

### Modified: `POST /api/shop/checkout`

Existing public checkout route. Changes:
- **Shipping address is required.** Accept `shipping` object (same shape as above) in request body; validate all fields present
- Calculate and add shipping cost as a Square order line item; `amountMoney` = **(subtotal + shipping) in cents**
- Stock check uses updated `decrement_stock()` which now validates `stock_count - stock_reserved >= qty`

---

## Customer-Facing Page

### New page: `/app/(public)/private-sale/[token]/page.tsx`

**Server component** — fetches sale data server-side, validates token, passes data as props to `<PrivateSaleCheckout />`.

- If token invalid/expired/used/revoked: renders a static "This link is no longer available" error state (no client JS needed)
- If valid: renders `<PrivateSaleCheckout sale={saleData} />` — a `'use client'` component in a separate file per CLAUDE.md rules

### New component: `components/shop/PrivateSaleCheckout.tsx` (`'use client'`)

- Shows: item images, names, custom prices, expiry countdown
- Shipping address form (name, address lines, city, state, zip, country) — all fields required
- Shipping cost shown as a calculated line item (using `calculateShipping` shared utility)
- Square Web Payments card widget (same initialization pattern as existing `CheckoutForm`)
- On success: redirect to `/shop/confirmation/[orderId]`

Token and expiry are re-validated server-side at checkout submission (not just at page load).

### Modified: `/components/shop/CheckoutForm.tsx`

- Add shipping address form above the card widget — all fields required
- Show shipping cost as a calculated line item
- Pass `shipping` object in checkout request body

---

## Lazy Expiry Cleanup

No background jobs. Two cleanup points:

1. **`GET /api/shop/private-sale/[token]`** (per-link): if `expires_at < NOW()` and unused and un-revoked → call `release_private_sale_stock()` which atomically sets `revoked_at` and releases stock in one transaction, then return 410
2. **`GET /api/admin/private-sales`** (bulk): call `release_private_sale_stock()` for each expired+unused+un-revoked link (up to 50) before returning results

`release_private_sale_stock()` is the single point of truth for expiry cleanup — it handles both the `revoked_at` timestamp and the `stock_reserved` decrement atomically, making all callers safe and concurrent calls idempotent.

---

## Shipping Calculation

Shared utility function (used in both checkout routes and client-side preview):

```ts
export function calculateShipping(subtotal: number, settings: Pick<Settings, 'shipping_mode' | 'shipping_value'>): number {
  if (settings.shipping_value === 0) return 0;
  if (settings.shipping_mode === 'fixed') return settings.shipping_value;
  return parseFloat(((subtotal * settings.shipping_value) / 100).toFixed(2));
}
```

`amountMoney` passed to Square = `Math.round((subtotal + shippingCost) * 100)` cents. `toFixed(2)` is used for display only; `Math.round` handles the final cent conversion and absorbs any sub-cent remainder from percentage mode (e.g. 10% of $13.99 = $1.399 → displayed as $1.40, charged as 140 cents).

---

## Type Definitions

New and updated types in `types.ts`:

```ts
interface PrivateSale {
  id: string;
  token: string;
  created_by: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  customer_note: string | null;
  created_at: string;
  items?: PrivateSaleItem[];
}

interface PrivateSaleItem {
  id: string;
  private_sale_id: string;
  product_id: string;
  quantity: number;
  custom_price: number;
  product?: Pick<Product, 'id' | 'name' | 'description' | 'price' | 'images' | 'is_active'>;
}

interface ShippingAddress {
  name: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

interface ShippingConfig {
  mode: 'fixed' | 'percentage';
  value: number;
}

// Product — add field:
// stock_reserved: number;

// Settings — add fields:
// shipping_mode: 'fixed' | 'percentage';
// shipping_value: number;
```

---

## Security Considerations

- Private sale tokens are UUIDs — not guessable, not sequential
- `GET /api/shop/private-sale/[token]` returns 410 for ALL invalid states (expired, used, revoked, unknown) — no enumeration side-channel. Rate-limited 30 req/60s per IP
- `POST /api/shop/private-sale/[token]/checkout` rate-limited 10 req/60s per IP
- All admin routes require `requireAdminSession()`
- Shipping address sanitized via `sanitizeText()` before Square API call. No PII stored in Supabase
- `custom_price > 0` enforced in DB (`CHECK` constraint) and server-side validation
- `shipping_value >= 0` enforced in DB (`CHECK` constraint) and settings API validation
- `fulfill_private_sale()` atomically checks `used_at IS NULL AND revoked_at IS NULL` before fulfilling — prevents double-charge and fulfillment of revoked links
- Payment-succeeds / DB-fails scenario: Square refund issued immediately, error logged with `paymentId` and `sale_id`

---

## Migration

```
supabase/migrations/XXX_private_sales_shipping.sql
```

1. Add `stock_reserved INTEGER NOT NULL DEFAULT 0` to `products`
2. **Update `decrement_stock`** function: change condition to `stock_count - stock_reserved >= qty`
3. Create `private_sales` table with RLS: service_role full access, no public access
4. Create `private_sale_items` table with RLS: service_role full access, no public access
5. Create `reserve_private_sale_stock`, `release_private_sale_stock`, `fulfill_private_sale` functions (SECURITY DEFINER, called via service_role)
6. Add `shipping_mode`, `shipping_value` to `settings` with constraints

---

## File Checklist

**New files:**
- `supabase/migrations/XXX_private_sales_shipping.sql`
- `app/admin/(dashboard)/private-sales/page.tsx` (server component, list view)
- `app/admin/(dashboard)/private-sales/new/page.tsx` (server component shell)
- `app/(public)/private-sale/[token]/page.tsx` (server component, validates token)
- `app/api/admin/private-sales/route.ts` (GET list, POST create)
- `app/api/admin/private-sales/[id]/route.ts` (DELETE revoke)
- `app/api/shop/private-sale/[token]/route.ts` (GET public sale details)
- `app/api/shop/private-sale/[token]/checkout/route.ts` (POST checkout)
- `components/admin/PrivateSaleList.tsx` (list table with status badges)
- `components/admin/PrivateSaleForm.tsx` (`'use client'` create form)
- `components/shop/PrivateSaleCheckout.tsx` (`'use client'` checkout widget)
- `lib/shipping.ts` (shared `calculateShipping` utility)

**Modified files:**
- `app/api/shop/checkout/route.ts` — add required shipping, use updated `decrement_stock`
- `components/shop/CheckoutForm.tsx` — add required shipping address fields + shipping line item
- `app/admin/(dashboard)/settings/page.tsx` — add shipping config section
- `app/api/admin/settings/route.ts` — handle new shipping fields with `>= 0` validation
- `types.ts` — add all new types, update `Product` and `Settings`
- `infra/schema.sql` — reflect schema changes
