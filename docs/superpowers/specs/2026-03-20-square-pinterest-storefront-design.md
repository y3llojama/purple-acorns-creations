# Square + Pinterest Storefront Integration — Design Spec

**Date:** 2026-03-20
**Status:** Draft
**Scope:** Phase 1 — Square API + Pinterest integration, native storefront, multi-channel sync admin. AI-powered inventory (photo identification, AI cataloguing) is a separate Phase 2 spec.

---

## 1. Overview

Replace the current Square.site iframe embed with a fully native storefront backed by a site-managed product inventory. The site becomes the **source of truth** for the product catalog, syncing bidirectionally with Square (catalog + inventory counts) and unidirectionally to Pinterest (catalog). Customers browse and transact entirely on this site; Square handles payment processing invisibly via its Web Payments SDK.

---

## 2. Goals

- Single admin UI to manage all products — no dual-management across Square Dashboard and this site
- Native product browsing on the homepage and `/shop` — no iframes, full brand consistency
- Square Web Payments SDK for on-site checkout — customers never leave the site to pay
- Bidirectional Square sync: catalog changes push from site → Square; POS sales pull back via webhooks to deduct stock
- Pinterest catalog sync + Save button on every product card
- Extensible multi-channel architecture (Etsy-ready, not implemented in Phase 1)
- Heart (♡) icon for local saves (localStorage) — no account required
- Three-layer homepage discovery flow: Featured Pieces → Gallery scroller → `/shop`

---

## 3. Out of Scope (Phase 2)

- AI photo identification of inventory items
- AI-assisted product description generation
- Etsy channel implementation (architecture is ready)
- Pinterest-to-site reverse sync
- Order management on this site (orders live in Square)
- User accounts / persistent wishlists

---

## 4. Data Model

### 4.1 New table: `products`

Central inventory table — source of truth for all product data.

```sql
CREATE TABLE products (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  description      TEXT,
  price            NUMERIC(10,2) NOT NULL,
  category         TEXT NOT NULL CHECK (category IN ('rings','necklaces','earrings','bracelets','crochet','other')),
  stock_count      INTEGER NOT NULL DEFAULT 0,
  images           TEXT[] NOT NULL DEFAULT '{}'
                   CHECK (array_length(images, 1) IS NULL OR array_length(images, 1) <= 10),  -- max 10 images; validated server-side too
  is_active        BOOLEAN NOT NULL DEFAULT true,

  -- Gallery curation
  gallery_featured BOOLEAN NOT NULL DEFAULT false,
  gallery_sort_order INTEGER,  -- only meaningful when gallery_featured = true

  -- Behavioral ranking
  view_count       INTEGER NOT NULL DEFAULT 0,

  -- Channel IDs (populated after first sync)
  square_catalog_id    TEXT,
  square_variation_id  TEXT,
  pinterest_product_id TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 4.2 New table: `channel_sync_log`

Tracks per-product, per-channel sync state. Powers the Channels admin UI health indicators.

```sql
CREATE TABLE channel_sync_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID REFERENCES products(id) ON DELETE CASCADE,
  channel     TEXT NOT NULL CHECK (channel IN ('square','pinterest','etsy')),
  status      TEXT NOT NULL CHECK (status IN ('pending','synced','error','conflict')),
  -- 'conflict': Square catalog.version.updated received — admin review required before next push
  synced_at   TIMESTAMPTZ,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 4.3 Updated table: `gallery`

Add nullable `product_id` FK to link gallery photos to inventory items when promoted.

```sql
ALTER TABLE gallery ADD COLUMN product_id UUID REFERENCES products(id) ON DELETE SET NULL;
```

### 4.4 Updated table: `settings`

Remove `square_store_url` (iframe retired). Add OAuth tokens and channel config.

```sql
ALTER TABLE settings
  DROP COLUMN square_store_url,
  ADD COLUMN square_access_token      TEXT,  -- AES-256-GCM encrypted, key from OAUTH_ENCRYPTION_KEY env var
  ADD COLUMN square_refresh_token     TEXT,  -- AES-256-GCM encrypted
  ADD COLUMN square_location_id       TEXT,
  ADD COLUMN pinterest_access_token   TEXT,  -- AES-256-GCM encrypted
  ADD COLUMN pinterest_refresh_token  TEXT,  -- AES-256-GCM encrypted
  ADD COLUMN pinterest_catalog_id     TEXT,
  ADD COLUMN gallery_max_items        INTEGER NOT NULL DEFAULT 8;
```

**Token encryption:** OAuth tokens are encrypted at the application layer before writing to the DB using AES-256-GCM. The encryption key is stored in the `OAUTH_ENCRYPTION_KEY` environment variable (never in the DB). A `lib/crypto.ts` module exposes `encryptToken(plaintext)` and `decryptToken(ciphertext)` — all reads/writes to OAuth token columns go through these helpers. This protects tokens if the DB is compromised independently of the application layer.

---

## 5. Admin Structure

### 5.1 Inventory Section (`/admin/inventory`)

New top-level admin section for managing the product catalog.

**Product list view:**
- Table/grid of all products with columns: image thumbnail, name, category, price, stock count, active toggle, gallery featured flag, sync status badges (Square ✓/✗, Pinterest ✓/✗)
- Filter by category, active status, sync status
- Search by name
- "Add product" button

**Product form (add/edit):**
- Name, description (rich text), price, category (dropdown), stock count
- Image uploader — reuses existing `ImageUploader` component, supports multiple images, Supabase Storage
- Active toggle
- Gallery featured flag + sort order (only visible when featured is on)
- On save: auto-triggers sync to all enabled channels

### 5.2 Channels Section (`/admin/channels`)

Replaces the Square URL field currently in Integrations. New top-level admin section.

**Square card:**
- OAuth connect/disconnect button
- Sync toggle (on/off)
- Last synced timestamp + next scheduled sync
- "Sync Now" manual trigger button
- Error log (expandable, last 10 errors)
- Square location selector (for multi-location accounts)

**Pinterest card:**
- OAuth connect/disconnect button
- Catalog sync toggle (on/off)
- Last synced timestamp
- "Sync Now" manual trigger
- Error log

**Etsy card:**
- "Coming soon" placeholder — greyed out, no functionality
- Brief description of what Etsy sync will offer

### 5.3 Gallery Section (updated)

Existing Gallery section gains curation controls for the homepage gallery scroller.

- Drag-and-drop list of gallery-featured products (reorder = update `gallery_sort_order`)
- "Max items in scroller" setting (default 8, admin-settable, persisted to `settings.gallery_max_items`)
- Preview panel: shows which non-featured products would auto-fill remaining slots (ranked by `view_count * 0.7 + recency_score * 0.3`)
- Existing gallery photo management unchanged; photos can optionally be linked to a product via `product_id`

---

## 6. Homepage — Three-Layer Discovery Flow

### Layer 1: Featured Pieces (existing, updated)

- 3–4 admin-curated items from `products` where `gallery_featured = true` AND `gallery_sort_order <= 4`
- Existing `FeaturedPieces` component updated to pull from `products` table instead of `featured_products`
- **Prices hidden** — editorial feel, no commerce pressure
- ♡ heart icon (localStorage save) visible on hover
- Clicking a card navigates to `/shop/[id]`
- `featured_products` table retained for backwards compatibility; migrated to `products` in Phase 1

### Layer 2: Gallery Scroller (new)

- Horizontal scroll on mobile, grid on desktop
- `gallery_max_items` total slots (default 8): admin-featured products first (by `gallery_sort_order`), remainder filled by behavioral ranking
- **Prices shown** — small, subtle, below product name. No cart button.
- ♡ heart icon on each card
- Pinterest Save button on each card
- Last "card" slot is a soft CTA: "See everything →" links to `/shop`
- Clicking any product card navigates to `/shop/[id]`
- `view_count` incremented on product detail page load (debounced, not on gallery card hover)

### Layer 3: `/shop` (replaces iframe)

See Section 7.

---

## 7. Store — `/shop` and `/shop/[id]`

### 7.1 Product grid (`/shop`)

- Full product catalog, `is_active = true`, paginated (24 per page)
- Category filter tabs: All / Rings / Necklaces / Earrings / Bracelets / Crochet / Other
- Sort: New (default) / Popular / Price: Low–High / Price: High–Low
- Product card: image, name, price, stock status ("Sold out" if `stock_count = 0`), ♡, Pinterest Save
- Clicking a card navigates to `/shop/[id]`

### 7.2 Product detail (`/shop/[id]`)

- Image carousel (multiple images)
- Name, description, price, category, stock status
- "Add to cart" button (disabled if sold out)
- ♡ heart (localStorage) + Pinterest Save button
- `view_count` incremented on load (debounced per session via sessionStorage)
- Related products: 4 items from the same category, ranked by `view_count`

### 7.3 Cart

- Cart state managed client-side (React context + localStorage for persistence across page refreshes)
- Cart drawer slides in from right; accessible, focus-trapped
- Line items: image thumbnail, name, price, quantity adjuster, remove
- Running total
- "Checkout" button → triggers Square Web Payments SDK flow

### 7.4 Checkout (Square Web Payments SDK)

Tokenization is **client-side only** — card data never reaches this server.

**Client-side steps:**
1. Square Web Payments SDK renders card input fields as Square-hosted iframes
2. On "Pay" click: client calls `card.tokenize()` → receives a one-time-use `sourceId` nonce
3. Client POSTs `{ cart: [...], sourceId }` to `/api/shop/checkout`

**Server-side steps (`/api/shop/checkout`):**
1. Validate each cart item against current `stock_count` — return 409 if any item is sold out
2. Create a Square Order via the Orders API
3. Charge the order via Square Payments API using `sourceId`
4. On successful charge: atomically decrement stock — `UPDATE products SET stock_count = stock_count - 1 WHERE id = $1 AND stock_count > 0 RETURNING id`
5. If decrement returns 0 rows (race: last unit sold between validation and charge): issue Square refund immediately, return "sold out" error to client
6. On successful decrement: return order ID + confirmation data to client

**Why charge before decrement:** A failed charge leaves stock untouched (recoverable). A decremented stock with a failed charge would show the item as sold-out when no payment was taken. Charging first is always safer for one-of-a-kind handmade items.

**Why atomic decrement:** Using `stock_count > 0` in the UPDATE prevents two simultaneous checkouts from both succeeding on the last unit — the second one triggers a refund rather than overselling.

- Order confirmation page: order summary, "Continue shopping" link
- Square handles all order records and receipts; no order table on this site

---

## 8. Local Saves (♡ Heart)

- Heart icon on every product card (homepage layers 1 + 2, `/shop` grid, `/shop/[id]`)
- Filled heart = saved, empty heart = unsaved; toggles on click
- State persisted to `localStorage` as an array of product IDs
- No backend, no account required
- Saved items accessible via a heart icon in the site nav (shows count badge when > 0) → `/shop/saved` page listing saved products
- Pinterest integration is separate (see Section 9) — the ♡ is purely local

---

## 9. Pinterest Integration

### 9.1 Pinterest Save Button

- Standard Pinterest Save button rendered on each product card (homepage layers 1 + 2, `/shop`, `/shop/[id]`)
- Clicking opens Pinterest's native save flow — user saves the product image + URL to their Pinterest board
- Pinterest JS SDK loaded **only in the shop route group layout** (`app/(public)/shop/layout.tsx`) using Next.js `<Script strategy="lazyOnload">` — not in the root layout, to avoid Pinterest tracking all page views
- The CSP in `next.config.js` must be updated to allow `assets.pinterest.com` and `pinimg.com` as `script-src` and `img-src` sources
- No Pinterest account required from the business owner for the Save button

### 9.2 Pinterest Catalog Sync

- Products synced to Pinterest as Product Pins with price, availability (`stock_count > 0`), description, and image
- Sync triggered: on product save in admin (if Pinterest channel enabled) + manual "Sync Now" + daily scheduled job
- Pinterest OAuth managed via the Channels admin section
- `channel_sync_log` records status per product
- Out-of-stock products remain in Pinterest catalog but marked unavailable (not deleted, avoids re-sync cost)

---

## 10. Square Sync Architecture

### 10.1 Site → Square (push)

Triggered on product create/update in admin (if Square channel enabled) + manual "Sync Now".

- Create/update `CatalogItem` (name, description, category via `CatalogCategory`)
- Create/update `CatalogItemVariation` (price, SKU)
- Upload images to Square Catalog
- Store returned `square_catalog_id` and `square_variation_id` on `products` row
- Log result to `channel_sync_log`

### 10.2 Square → Site (webhooks)

Square sends webhook events to `/api/webhooks/square`:

- `inventory.count.updated` → update `products.stock_count`
- `catalog.version.updated` → set `channel_sync_log.status = 'conflict'` for the affected product's Square row; Channels admin UI surfaces a "Review needed" badge on the Square card, listing all conflicted products. Admin dismisses by clicking "Mark reviewed" which sets status back to `'synced'` and triggers a fresh push from site → Square.

Webhook endpoint verifies Square's HMAC signature before processing.

### 10.3 Sync scheduling

- On product save: immediate async sync (non-blocking, fire-and-forget API call)
- Daily full sync at 3am: implemented via **Vercel Cron Jobs** (configured in `vercel.json`). The cron calls `/api/cron/sync` with an `Authorization: Bearer $CRON_SECRET` header. The endpoint validates this header only — `requireAdminSession()` is not used since there is no browser session. `CRON_SECRET` is set in the Vercel dashboard, never committed.
- Manual "Sync Now" in Channels admin: calls a **separate route** `/api/admin/sync`, protected by `requireAdminSession()`. Both `/api/cron/sync` and `/api/admin/sync` invoke the same underlying `syncAllProducts()` service function — the routes differ only in their auth mechanism. This keeps the cron endpoint non-browser-callable and the admin endpoint non-cron-callable.

### 10.4 Square OAuth

- OAuth 2.0 flow initiated from Channels admin
- Tokens stored encrypted in `settings` table
- Auto-refresh on expiry

---

## 11. Multi-Channel Architecture

The sync layer is channel-agnostic. Each channel is an adapter implementing:

```typescript
interface ChannelAdapter {
  push(product: Product): Promise<SyncResult>
  handleWebhook(payload: unknown): Promise<void>
  fullSync(products: Product[]): Promise<SyncResult[]>
}
```

Square and Pinterest are Phase 1 adapters. Etsy slots in as a Phase 3 adapter with no architectural changes required. The `channel_sync_log` table and Channels admin UI already support `channel = 'etsy'`.

**Note on Etsy:** Etsy's data model differs — "sections" not categories, mandatory "who made it / when made / materials" fields, $0.20 listing fee per publish. The Etsy adapter will need fee-aware sync logic (don't auto-publish; require admin confirmation per listing).

---

## 12. Security

- All admin inventory and channel routes protected by `requireAdminSession()`
- Square webhook endpoint validates HMAC signature (`square-signature` header)
- Pinterest webhook endpoint validates signature header
- OAuth tokens stored encrypted at rest in `settings` table
- Square payment processing: card data never touches this server — Square SDK handles card fields in iframes
- Product images validated via existing `ImageUploader` (type + size checks)
- Rate limiting applied to `/api/shop/checkout` and webhook endpoints

---

## 13. Accessibility

- Cart drawer: focus-trapped (Tab cycle), restores focus on close (follows `ConfirmDialog` pattern)
- Heart button: `aria-label="Save [product name]"` / `aria-label="Remove [product name] from saved items"` toggled on state change
- Pinterest Save button: `aria-label="Save to Pinterest"`
- Product cards: keyboard navigable, image alt text required (enforced by `ImageUploader`)
- "Sold out" stock status communicated via text, not colour alone

---

## 14. Migration from Iframe

Strict cutover order prevents any homepage blank-state window:

1. Run DB migration: create `products`, `channel_sync_log`; add `product_id` to `gallery`; add new `settings` columns (do NOT drop `square_store_url` yet)
2. Migrate `featured_products` data → `products` rows with `gallery_featured = true` (via admin script or one-off migration)
3. Verify parity: confirm all `featured_products` rows appear correctly in `products`
4. Switch `FeaturedPieces` component to read from `products` — only after step 3 is confirmed
5. First Square sync: push all `products` to Square catalog, reconcile with any existing Square items
6. Replace Square.site iframe on `/shop` with native product grid
7. Connect Pinterest channel, trigger initial catalog sync
8. Confirm all layers working end-to-end in production
9. Drop `settings.square_store_url` column + remove `IntegrationsEditor` Square URL field
10. `featured_products` table retained as-is in Phase 1 (dropped in a future cleanup migration)

---

## 15. Open Questions (deferred to Phase 2)

- Shipping + tax calculation during checkout (Square supports this; needs configuration)
- Product variants (e.g. ring sizes, colour options) — `CatalogItemVariation` supports this, deferred
- Discount codes / promotions
- Order history for returning customers
- Etsy channel implementation
- AI photo identification for inventory cataloguing
