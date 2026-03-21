# Category Management — Design Spec
_Date: 2026-03-20_

## Overview

Replace the hardcoded category list with a fully dynamic, database-driven category system manageable from the admin UI, with bidirectional Square sync.

---

## Data Model

### `categories` table (new)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK DEFAULT gen_random_uuid()` | |
| `name` | `text NOT NULL` | display name |
| `slug` | `text NOT NULL UNIQUE` | URL-safe, auto-derived from name (lowercased, hyphenated) |
| `parent_id` | `uuid FK → categories.id NULL` | null = top-level; max 1 level deep enforced in API |
| `sort_order` | `integer NOT NULL DEFAULT 9999` | local display order only, not synced to Square; column DEFAULT 9999 is a safety net for direct DB writes — the POST API always computes `MAX(sort_order) + 1` among siblings at runtime |
| `category_type` | `text NOT NULL DEFAULT 'REGULAR_CATEGORY' CHECK (category_type IN ('REGULAR_CATEGORY', 'MENU_CATEGORY'))` | |
| `online_visibility` | `boolean NOT NULL DEFAULT true` | synced to Square `onlineVisibility` |
| `seo_title` | `text` | synced to Square `ecomSeoData.pageTitle` |
| `seo_description` | `text` | synced to Square `ecomSeoData.pageDescription` |
| `seo_permalink` | `text` | synced to Square `ecomSeoData.permalink` |
| `square_category_id` | `text` | cached Square object ID |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `updated_at` | `timestamptz NOT NULL DEFAULT now()` | set explicitly to `now()` on every PATCH |

### `products` table (modified)

- Add `category_id uuid REFERENCES categories(id) NULL`
- Backfill: `UPDATE products SET category_id = c.id FROM categories c WHERE c.slug = products.category` (join on slug, which matches the existing lowercase values)
- Drop the `CHECK` constraint on `category` text column
- Drop the `category` text column after backfill

### `gallery` table (modified)

- Same treatment as `products`: add `category_id FK`, backfill via slug join, drop old `category` text column and its CHECK constraint

### `settings` table (modified)

- Drop `square_category_ids JSONB` (migration 019 column — superseded by `categories.square_category_id`)

---

## API Routes

All routes call `requireAdminSession()` first.

### `GET /api/admin/categories`
Returns all categories ordered by `sort_order`, with `product_count` per row via a single `LEFT JOIN … GROUP BY` query (no N+1). Top-level categories include their children nested in a `children` array. No pagination needed — category counts will always be small.

### `GET /api/admin/categories/[id]`
Returns a single category by ID. Used by the edit form to reflect latest state when the user clicks Edit.

### `POST /api/admin/categories`
Create a category. Validates:
- `name` required, sanitized with `sanitizeText()`
- `parent_id` must reference a top-level category (no grandchildren — API returns 400 if the referenced parent itself has a `parent_id`)
- Auto-generates `slug` from name; checks for slug collision and returns 409 if taken
- `category_type` must be `REGULAR_CATEGORY` or `MENU_CATEGORY`
- Sets `sort_order` to `MAX(sort_order) + 1` among siblings (or 0 if first)
- Syncs to Square if `square_sync_enabled`; sync failure is non-fatal (logged to `channel_sync_log`, API still returns 201)

### `PATCH /api/admin/categories/[id]`
Update a category. Same validations as POST. Sets `updated_at = now()`. On slug change, checks for collision and returns 409 if taken. Re-syncs to Square on save (delete-then-recreate pattern); sync failure non-fatal.

### `DELETE /api/admin/categories/[id]`
- Counts `products.category_id = id` AND `gallery.category_id = id`
- If total > 0: returns 400 with `{ error, productCount, productNames: string[], galleryCount }` (first 5 product names). UI error message: _"Cannot delete — blocked by N products and M gallery items. Reassign them first."_ (omits zero counts)
- If 0: deletes from DB, then awaits Square delete and logs any failure to `channel_sync_log` (non-fatal, but not fire-and-forget — the admin sees a warning if Square delete fails)

### `PATCH /api/admin/categories/reorder`
Calls `requireAdminSession()` (this is a separate route file from `[id]` — the auth check must be explicit here too). Accepts `{ items: [{ id: string, sort_order: number }] }`. Validates:
- Array length ≤ 100
- Each `id` is a valid UUID
- Each `sort_order` is an integer 0–9999
- Bulk-updates `sort_order` and `updated_at` in a single transaction

---

## Square Sync

Uses the same **delete-then-recreate** pattern as products (avoids `VERSION_MISMATCH`).

**`pushCategory(category)`** in `lib/channels/square/catalog.ts`:
1. If `square_category_id` exists, delete from Square — catch and log 404s, re-throw other errors
2. Upsert as new `CATEGORY` object with temp ID `#CAT-{category.id}`
3. Payload:
```ts
{
  type: 'CATEGORY',
  id: `#CAT-${category.id}`,
  categoryData: {
    name: category.name,
    categoryType: category.category_type,
    onlineVisibility: category.online_visibility,
    parentCategory: parentSquareCategoryId ? { id: parentSquareCategoryId } : undefined,
    ecomSeoData: (category.seo_title || category.seo_description || category.seo_permalink) ? {
      pageTitle: category.seo_title ?? undefined,
      pageDescription: category.seo_description ?? undefined,  // Square field: pageDescription not metaDescription
      permalink: category.seo_permalink ?? undefined,
    } : undefined,
  },
}
```
4. Store returned real ID to `categories.square_category_id`

**`deleteSquareCategory(squareCategoryId)`**: awaited, 404 treated as success, other errors logged.

**`pushProduct()` category lookup:** The function joins to the `categories` table via `product.category_id` to retrieve `square_category_id`. If `category_id` is null or the category has no `square_category_id` yet (Square sync never ran for it), the product is synced without a category link — a warning is logged to `channel_sync_log` but the sync proceeds. This prevents a missing category from blocking all product syncs.

**Removed:**
- `ensureSquareCategories()` function — deleted entirely
- `app/api/admin/inventory/sync-categories/route.ts` — deleted
- `fullSync()` in `catalog.ts` — updated to remove the `ensureSquareCategories()` call; product sync now looks up `square_category_id` by joining to `categories` via `product.category_id`
- `settings.square_category_ids` select in `InventoryPage` — removed; `squareCategoryIds` prop removed from `InventoryManager`

---

## Admin UI

### Inventory page — tabs

`InventoryPage` gains a `tab` query param (`?tab=products` default, `?tab=categories`). The page passes `squareSyncEnabled` only (no category ID map) to `InventoryManager`.

### Categories tab — list view

- Categories grouped: top-level rows with sub-categories indented beneath
- Per row: drag handle (⠿), name, product count badge, Square sync badge (● synced / ○ not synced), Edit button, Delete button
- Delete with products assigned: inline error row beneath the category — _"Cannot delete — 8 products assigned. Reassign them first."_ — no modal
- `+ Add Category` button top-right

### Edit / create form

- **Desktop**: inline panel slides open on the right of the list
- **Mobile**: full-screen pushed view with Back + Save in a top bar
- **Fields**: Name, Parent category (dropdown of top-level categories only, plus "— None (top-level) —"), Sort order (number), Category type (Regular / Menu), Visible on Square Online (checkbox)
- **SEO section**: collapsed `<details>` by default — Title, Description, Permalink slug
- Save triggers Square sync; success/error shown inline beneath the Save button
- Slug collision error returns 409 and is surfaced as _"A category with this name already exists."_

### Drag to reorder

- HTML5 drag-and-drop, no external library
- Drag handle (⠿) on each row; sub-categories only reorder within their parent group
- On drop calls `PATCH /api/admin/categories/reorder`

### Product form update

`ProductForm.tsx` currently renders a hardcoded `<select>` of category strings. Updated to:
- Accept `categories: Category[]` prop (fetched alongside product in the inventory page)
- Render dynamic options grouped by top-level / sub-category
- Submit `category_id` (UUID) instead of `category` (string)

---

## Migration 020 — `020_dynamic_categories.sql`

1. Create `categories` table (schema above)
2. Seed 6 rows with slugs matching existing `products.category` values:
   ```sql
   INSERT INTO categories (name, slug, sort_order) VALUES
     ('Rings',     'rings',     0),
     ('Necklaces', 'necklaces', 1),
     ('Earrings',  'earrings',  2),
     ('Bracelets', 'bracelets', 3),
     ('Crochet',   'crochet',   4),
     ('Other',     'other',     5);
   ```
3. Add `category_id uuid REFERENCES categories(id) NULL` to `products`
4. Backfill via slug: `UPDATE products SET category_id = c.id FROM categories c WHERE c.slug = products.category`
5. Drop `products.category` CHECK constraint, then drop column
6. Add `category_id uuid REFERENCES categories(id) NULL` to `gallery`
7. Backfill gallery: `UPDATE gallery SET category_id = c.id FROM categories c WHERE c.slug = gallery.category`
8. Drop `gallery.category` CHECK constraint, then drop column
9. Drop `settings.square_category_ids` column

---

## Out of Scope

- Category images (requires Square catalog image upload API — separate feature)
- Availability periods, channels (Square Online-specific, Square-generated IDs)
- Deeper than 2-level hierarchy
- Public storefront category pages
