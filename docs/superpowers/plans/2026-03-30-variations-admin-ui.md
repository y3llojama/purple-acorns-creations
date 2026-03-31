# Product Variations Admin UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the admin UI for managing product options and variations, with bidirectional Square sync, incorporating all security/architecture/UX amendments from rev 3.

**Architecture:** Collapsible VariationsEditor component inside ProductForm. Full-replace save via atomic Postgres RPC (`replace_product_variations`). Stock is read-only in the UI — only modified through RPCs. Reusable options shared across products. Square sync imports/exports all variations, not just the default.

**Tech Stack:** Next.js 15, TypeScript, Supabase (PostgreSQL RPCs), Square SDK, Jest

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/049_variations_admin.sql` | Price constraint, replace_product_variations RPC |
| Create | `app/api/admin/inventory/[id]/variations/route.ts` | GET/PUT variations for a product |
| Create | `app/api/admin/options/route.ts` | GET/POST reusable option sets |
| Create | `app/api/admin/options/[id]/route.ts` | PATCH/DELETE a reusable option set |
| Create | `components/admin/VariationsEditor.tsx` | Options picker + variations table/card UI |
| Modify | `components/admin/ProductForm.tsx` | Integrate VariationsEditor, hide price/stock when has_options |
| Modify | `app/api/shop/products/[id]/route.ts` | Return option labels with variations |
| Modify | `app/api/shop/private-sale/[token]/checkout/route.ts` | Use variation_id from sale item |
| Modify | `lib/channels/square/catalog.ts` | Multi-variation push and pull |
| Create | `__tests__/api/admin/variations.test.ts` | Variations PUT endpoint tests |
| Create | `__tests__/api/admin/options.test.ts` | Options CRUD tests |
| Create | `__tests__/lib/channels/square/catalog-variations.test.ts` | Multi-variation sync tests |
| Modify | `__tests__/api/shop/private-sale-checkout.test.ts` | Variation-aware checkout test |

---

### Task 1: Migration — price constraint + replace_product_variations RPC

**Files:**
- Create: `supabase/migrations/049_variations_admin.sql`

This RPC accepts the full desired state of a product's options and variations, and performs the diff atomically in a single transaction. This prevents race conditions from multi-round-trip JS (spec amendment A2).

- [ ] **Step 1: Write the migration SQL**

```sql
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
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/049_variations_admin.sql
git commit -m "feat: add price constraint and replace_product_variations RPC"
```

> **Note:** This migration should be run manually in the Supabase SQL editor before deploying the code, same as migration 048.

---

### Task 2: Options CRUD API

**Files:**
- Create: `app/api/admin/options/route.ts`
- Create: `app/api/admin/options/[id]/route.ts`
- Create: `__tests__/api/admin/options.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/api/admin/options.test.ts`:

```typescript
/**
 * @jest-environment node
 */
jest.mock('@/lib/auth', () => ({ requireAdminSession: jest.fn().mockResolvedValue({ error: null }) }))

const mockFrom = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: jest.fn(() => ({
    from: (...args: unknown[]) => mockFrom(...args),
  })),
}))

function makeBuilder(value: unknown) {
  return {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    single: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => void) => resolve(value),
  }
}

describe('GET /api/admin/options', () => {
  let GET: (req: Request) => Promise<Response>
  beforeAll(async () => {
    const mod = await import('@/app/api/admin/options/route')
    GET = mod.GET
  })
  beforeEach(() => {
    jest.resetAllMocks()
    const { requireAdminSession } = jest.requireMock('@/lib/auth') as { requireAdminSession: jest.Mock }
    requireAdminSession.mockResolvedValue({ error: null })
    const { createServiceRoleClient } = jest.requireMock('@/lib/supabase/server') as { createServiceRoleClient: jest.Mock }
    createServiceRoleClient.mockReturnValue({ from: (...args: unknown[]) => mockFrom(...args) })
  })

  it('returns reusable options with their values', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'item_options') return makeBuilder({
        data: [{ id: 'o1', name: 'Size', values: [{ id: 'v1', name: 'S' }] }],
        error: null,
      })
      return makeBuilder({ data: [], error: null })
    })
    const res = await GET(new Request('http://localhost/api/admin/options'))
    expect(res.status).toBe(200)
  })
})

describe('POST /api/admin/options', () => {
  let POST: (req: Request) => Promise<Response>
  beforeAll(async () => {
    const mod = await import('@/app/api/admin/options/route')
    POST = mod.POST
  })
  beforeEach(() => {
    jest.resetAllMocks()
    const { requireAdminSession } = jest.requireMock('@/lib/auth') as { requireAdminSession: jest.Mock }
    requireAdminSession.mockResolvedValue({ error: null })
    const { createServiceRoleClient } = jest.requireMock('@/lib/supabase/server') as { createServiceRoleClient: jest.Mock }
    createServiceRoleClient.mockReturnValue({ from: (...args: unknown[]) => mockFrom(...args) })
  })

  it('sanitizes option name before insert', async () => {
    const insertMock = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      then: (resolve: (v: unknown) => void) => resolve({ data: { id: 'o1', name: 'Size' }, error: null }),
    })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'item_options') return { insert: insertMock }
      return makeBuilder({ data: null, error: null })
    })
    const req = new Request('http://localhost/api/admin/options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '<script>alert("xss")</script>Size' }),
    })
    await POST(req)
    expect(insertMock).toHaveBeenCalled()
    const insertArg = insertMock.mock.calls[0][0]
    expect(insertArg.name).not.toContain('<script>')
  })

  it('rejects empty name', async () => {
    const req = new Request('http://localhost/api/admin/options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/api/admin/options.test.ts --no-cache`
Expected: FAIL — modules not found

- [ ] **Step 3: Implement options routes**

Create `app/api/admin/options/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { sanitizeText } from '@/lib/sanitize'

export async function GET() {
  const { error } = await requireAdminSession()
  if (error) return error
  const supabase = createServiceRoleClient()
  const { data, error: dbError } = await supabase
    .from('item_options')
    .select('*, values:item_option_values(id,name,sort_order,square_option_value_id)')
    .eq('is_reusable', true)
    .order('name')
  if (dbError) return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const body = await request.json().catch(() => ({}))
  const name = sanitizeText(String(body.name ?? '').trim())
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const supabase = createServiceRoleClient()
  const { data, error: dbError } = await supabase
    .from('item_options')
    .insert({ name, display_name: name, is_reusable: true })
    .select()
    .single()
  if (dbError) return NextResponse.json({ error: 'Failed to create' }, { status: 500 })
  // Insert initial values if provided
  const values = Array.isArray(body.values) ? body.values : []
  for (let i = 0; i < Math.min(values.length, 20); i++) {
    const valName = sanitizeText(String(values[i]?.name ?? values[i] ?? '').trim())
    if (valName) {
      await supabase.from('item_option_values').insert({
        option_id: data.id, name: valName, sort_order: i,
      })
    }
  }
  return NextResponse.json(data, { status: 201 })
}
```

Create `app/api/admin/options/[id]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { sanitizeText } from '@/lib/sanitize'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdminSession()
  if (error) return error
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name !== undefined) {
    const name = sanitizeText(String(body.name).trim())
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
    update.name = name
    update.display_name = name
  }
  const supabase = createServiceRoleClient()
  const { data, error: dbError } = await supabase
    .from('item_options').update(update).eq('id', id).select().single()
  if (dbError || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Sync values if provided: add new, update existing, remove missing
  if (Array.isArray(body.values)) {
    const incomingIds: string[] = []
    for (let i = 0; i < Math.min(body.values.length, 20); i++) {
      const v = body.values[i]
      const valName = sanitizeText(String(v?.name ?? v ?? '').trim())
      if (!valName) continue
      if (v?.id) {
        incomingIds.push(v.id)
        await supabase.from('item_option_values')
          .update({ name: valName, sort_order: i, updated_at: new Date().toISOString() })
          .eq('id', v.id).eq('option_id', id)
      } else {
        const { data: newVal } = await supabase.from('item_option_values')
          .insert({ option_id: id, name: valName, sort_order: i })
          .select('id').single()
        if (newVal) incomingIds.push(newVal.id)
      }
    }
    // Remove values no longer in list (only if no variation references)
    const { data: allVals } = await supabase
      .from('item_option_values').select('id').eq('option_id', id)
    for (const val of (allVals ?? [])) {
      if (!incomingIds.includes(val.id)) {
        const { data: refs } = await supabase
          .from('variation_option_values').select('variation_id').eq('option_value_id', val.id).limit(1)
        if (!refs?.length) {
          await supabase.from('item_option_values').delete().eq('id', val.id)
        }
      }
    }
  }

  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdminSession()
  if (error) return error
  const { id } = await params
  const supabase = createServiceRoleClient()
  // Check if option is in use by any product
  const { data: usage } = await supabase
    .from('product_options').select('product_id').eq('option_id', id).limit(1)
  if (usage?.length) {
    return NextResponse.json({ error: 'Option is in use by products. Remove it from all products first.' }, { status: 409 })
  }
  const { error: dbError } = await supabase.from('item_options').delete().eq('id', id)
  if (dbError) return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/api/admin/options.test.ts --no-cache`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/options/ __tests__/api/admin/options.test.ts
git commit -m "feat: add options CRUD API with sanitization and delete protection"
```

---

### Task 3: Variations GET/PUT API

**Files:**
- Create: `app/api/admin/inventory/[id]/variations/route.ts`
- Create: `__tests__/api/admin/variations.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/api/admin/variations.test.ts`:

```typescript
/**
 * @jest-environment node
 */
jest.mock('@/lib/auth', () => ({ requireAdminSession: jest.fn().mockResolvedValue({ error: null }) }))

const mockFrom = jest.fn()
const mockRpc = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: jest.fn(() => ({
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  })),
}))
jest.mock('@/lib/channels', () => ({ syncProduct: jest.fn().mockResolvedValue([]) }))

function makeBuilder(value: unknown) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    single: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => void) => resolve(value),
  }
}

describe('PUT /api/admin/inventory/[id]/variations', () => {
  let PUT: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>
  beforeAll(async () => {
    const mod = await import('@/app/api/admin/inventory/[id]/variations/route')
    PUT = mod.PUT
  })
  beforeEach(() => {
    jest.resetAllMocks()
    const { requireAdminSession } = jest.requireMock('@/lib/auth') as { requireAdminSession: jest.Mock }
    requireAdminSession.mockResolvedValue({ error: null })
    const { createServiceRoleClient } = jest.requireMock('@/lib/supabase/server') as { createServiceRoleClient: jest.Mock }
    createServiceRoleClient.mockReturnValue({
      from: (...args: unknown[]) => mockFrom(...args),
      rpc: (...args: unknown[]) => mockRpc(...args),
    })
    const { syncProduct } = jest.requireMock('@/lib/channels') as { syncProduct: jest.Mock }
    syncProduct.mockResolvedValue([])
  })

  it('calls replace_product_variations RPC with sanitized payload', async () => {
    mockRpc.mockResolvedValue({ data: { options_count: 1, variations_count: 2 }, error: null })
    mockFrom.mockImplementation(() => makeBuilder({ data: { id: 'p1', name: 'Test' }, error: null }))

    const req = new Request('http://localhost/api/admin/inventory/p1/variations', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        options: [{ name: '<b>Size</b>', values: [{ name: 'S' }, { name: 'M' }] }],
        variations: [
          { option_value_ids: [], price: 25, is_active: true },
          { option_value_ids: [], price: 30, is_active: true },
        ],
      }),
    })

    const res = await PUT(req, { params: Promise.resolve({ id: 'p1' }) })
    expect(res.status).toBe(200)
    expect(mockRpc).toHaveBeenCalledWith('replace_product_variations', expect.objectContaining({
      p_product_id: 'p1',
    }))
    // Verify option name was sanitized
    const rpcArgs = mockRpc.mock.calls[0][1]
    const opts = JSON.parse(rpcArgs.p_options)
    expect(opts[0].name).not.toContain('<b>')
  })

  it('rejects payload with > 3 options', async () => {
    const req = new Request('http://localhost/api/admin/inventory/p1/variations', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        options: [{ name: 'A', values: [] }, { name: 'B', values: [] }, { name: 'C', values: [] }, { name: 'D', values: [] }],
        variations: [],
      }),
    })
    const res = await PUT(req, { params: Promise.resolve({ id: 'p1' }) })
    expect(res.status).toBe(400)
  })

  it('rejects variation with price <= 0', async () => {
    const req = new Request('http://localhost/api/admin/inventory/p1/variations', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        options: [{ name: 'Size', values: [{ name: 'S' }] }],
        variations: [{ option_value_ids: [], price: 0, is_active: true }],
      }),
    })
    const res = await PUT(req, { params: Promise.resolve({ id: 'p1' }) })
    expect(res.status).toBe(400)
  })

  it('does not include stock_count in RPC payload (A1)', async () => {
    mockRpc.mockResolvedValue({ data: { options_count: 1, variations_count: 1 }, error: null })
    mockFrom.mockImplementation(() => makeBuilder({ data: { id: 'p1', name: 'Test' }, error: null }))

    const req = new Request('http://localhost/api/admin/inventory/p1/variations', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        options: [{ name: 'Size', values: [{ name: 'S' }] }],
        variations: [{ option_value_ids: [], price: 25, stock_count: 999, is_active: true }],
      }),
    })

    await PUT(req, { params: Promise.resolve({ id: 'p1' }) })
    const rpcArgs = mockRpc.mock.calls[0][1]
    const vars = JSON.parse(rpcArgs.p_variations)
    expect(vars[0]).not.toHaveProperty('stock_count')
  })

  it('validates SKU format (A10)', async () => {
    mockRpc.mockResolvedValue({ data: { options_count: 1, variations_count: 1 }, error: null })
    mockFrom.mockImplementation(() => makeBuilder({ data: { id: 'p1', name: 'Test' }, error: null }))

    const req = new Request('http://localhost/api/admin/inventory/p1/variations', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        options: [{ name: 'Size', values: [{ name: 'S' }] }],
        variations: [{ option_value_ids: [], price: 25, sku: '<script>alert(1)</script>', is_active: true }],
      }),
    })

    const res = await PUT(req, { params: Promise.resolve({ id: 'p1' }) })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/api/admin/variations.test.ts --no-cache`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the variations route**

Create `app/api/admin/inventory/[id]/variations/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { sanitizeText } from '@/lib/sanitize'
import { syncProduct } from '@/lib/channels'

const SKU_RE = /^[a-zA-Z0-9_-]+$/

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdminSession()
  if (error) return error
  const { id } = await params
  const supabase = createServiceRoleClient()

  const [{ data: options }, { data: variations }] = await Promise.all([
    supabase.from('product_options')
      .select('sort_order, option:item_options(id,name,display_name,values:item_option_values(id,name,sort_order))')
      .eq('product_id', id)
      .order('sort_order'),
    supabase.from('product_variations')
      .select('id,price,sku,stock_count,stock_reserved,is_default,is_active,image_url,updated_at,option_values:variation_option_values(option_value_id)')
      .eq('product_id', id)
      .order('created_at'),
  ])

  return NextResponse.json({ options: options ?? [], variations: variations ?? [] })
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdminSession()
  if (error) return error
  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const options = Array.isArray(body.options) ? body.options : []
  const variations = Array.isArray(body.variations) ? body.variations : []

  // Server-side payload limits (A4)
  if (options.length > 3) {
    return NextResponse.json({ error: 'Max 3 options per product' }, { status: 400 })
  }
  for (const opt of options) {
    const vals = Array.isArray(opt.values) ? opt.values : []
    if (vals.length > 20) {
      return NextResponse.json({ error: 'Max 20 values per option' }, { status: 400 })
    }
  }
  if (variations.length > 60) {
    return NextResponse.json({ error: 'Max 60 variations per product' }, { status: 400 })
  }

  // Sanitize and validate (A5, A10, A11)
  const cleanOptions = options.map((opt: { id?: string; name: string; values: { id?: string; name: string; sort_order?: number }[] }) => {
    const name = sanitizeText(String(opt.name ?? '').trim())
    if (!name) throw new Error('EMPTY_OPTION_NAME')
    return {
      id: opt.id ?? undefined,
      name,
      values: (Array.isArray(opt.values) ? opt.values : []).map((v, i) => ({
        id: v.id ?? undefined,
        name: sanitizeText(String(v.name ?? '').trim()),
        sort_order: v.sort_order ?? i,
      })).filter(v => v.name),
    }
  })

  const cleanVariations = variations.map((v: { id?: string; option_value_ids?: string[]; price: number; sku?: string; is_active?: boolean; stock_count?: number }) => {
    const price = parseFloat(String(v.price))
    if (!Number.isFinite(price) || price <= 0) throw new Error('INVALID_PRICE')
    const sku = v.sku ? sanitizeText(String(v.sku)).slice(0, 100) : null
    if (sku && !SKU_RE.test(sku)) throw new Error('INVALID_SKU')
    // Never include stock_count (A1)
    return {
      id: v.id ?? undefined,
      option_value_ids: Array.isArray(v.option_value_ids) ? v.option_value_ids : [],
      price,
      sku,
      is_active: v.is_active !== false,
    }
  })

  // Catch validation errors
  try {
    // Force evaluation of lazy maps
    cleanOptions.forEach(() => {})
    cleanVariations.forEach(() => {})
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Validation error'
    if (msg === 'INVALID_SKU') return NextResponse.json({ error: 'SKU must be alphanumeric (letters, numbers, hyphens, underscores)' }, { status: 400 })
    if (msg === 'INVALID_PRICE') return NextResponse.json({ error: 'All variation prices must be greater than 0' }, { status: 400 })
    if (msg === 'EMPTY_OPTION_NAME') return NextResponse.json({ error: 'Option name is required' }, { status: 400 })
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const supabase = createServiceRoleClient()

  const { data: result, error: rpcError } = await supabase.rpc('replace_product_variations', {
    p_product_id: id,
    p_options: JSON.stringify(cleanOptions),
    p_variations: JSON.stringify(cleanVariations),
  })

  if (rpcError) {
    const msg = rpcError.message
    if (msg.includes('MAX_OPTIONS')) return NextResponse.json({ error: 'Max 3 options per product' }, { status: 400 })
    if (msg.includes('MAX_VALUES')) return NextResponse.json({ error: 'Max 20 values per option' }, { status: 400 })
    if (msg.includes('MAX_VARIATIONS')) return NextResponse.json({ error: 'Max 60 variations per product' }, { status: 400 })
    if (msg.includes('INVALID_PRICE')) return NextResponse.json({ error: 'All prices must be > 0' }, { status: 400 })
    if (msg.includes('VARIATION_NOT_OWNED')) return NextResponse.json({ error: 'Variation does not belong to this product' }, { status: 403 })
    if (msg.includes('PRODUCT_NOT_FOUND')) return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    console.error('[variations PUT] RPC error:', rpcError.message)
    return NextResponse.json({ error: 'Failed to save variations' }, { status: 500 })
  }

  // Trigger channel sync
  const { data: product } = await supabase.from('products').select('*').eq('id', id).single()
  if (product) syncProduct(product).catch(console.error)

  return NextResponse.json(result)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/api/admin/variations.test.ts --no-cache`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/inventory/[id]/variations/ __tests__/api/admin/variations.test.ts
git commit -m "feat: add variations GET/PUT API with atomic RPC and security validations"
```

---

### Task 4: VariationsEditor component

**Files:**
- Create: `components/admin/VariationsEditor.tsx`

This is the largest UI task. The component handles:
- Option picker dropdown (existing reusable options + "Create New")
- Chip-based value input with Add button (A8)
- Auto-generated variations table (desktop) / card list (mobile)
- Bulk actions: "Set all prices", "Set all stock" (read-only stock removed per A1 — but "Activate/Deactivate all" is useful)
- Live combination preview count (A9)
- Unsaved changes tracking

- [ ] **Step 1: Create the component**

Create `components/admin/VariationsEditor.tsx`:

```typescript
'use client'
import { useState, useEffect, useCallback } from 'react'
import ConfirmDialog from './ConfirmDialog'
import type { ItemOption, ItemOptionValue, ProductVariation } from '@/lib/supabase/types'

interface OptionWithValues extends ItemOption {
  values: ItemOptionValue[]
}

interface VariationRow {
  id?: string
  optionValueIds: string[]
  optionLabels: string[]
  price: number
  sku: string
  stockCount: number
  isActive: boolean
  isDefault: boolean
}

interface Props {
  productId: string
  productPrice: number
  onDirtyChange: (dirty: boolean) => void
}

const inputStyle: React.CSSProperties = {
  padding: '8px', fontSize: '16px', borderRadius: '4px',
  border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'inherit',
}
const chipStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '4px',
  padding: '4px 10px', borderRadius: '16px', fontSize: '14px',
  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
}
const btnSmall: React.CSSProperties = {
  padding: '6px 12px', fontSize: '14px', borderRadius: '4px',
  border: '1px solid var(--color-border)', background: 'transparent',
  color: 'inherit', cursor: 'pointer', minHeight: '48px',
}

export default function VariationsEditor({ productId, productPrice, onDirtyChange }: Props) {
  const [allOptions, setAllOptions] = useState<OptionWithValues[]>([])
  const [attachedOptions, setAttachedOptions] = useState<OptionWithValues[]>([])
  const [variations, setVariations] = useState<VariationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [newValueInputs, setNewValueInputs] = useState<Record<string, string>>({})
  const [confirmRemoveOption, setConfirmRemoveOption] = useState<string | null>(null)
  const [bulkPrice, setBulkPrice] = useState('')

  const markDirty = useCallback(() => {
    if (!dirty) { setDirty(true); onDirtyChange(true) }
  }, [dirty, onDirtyChange])

  // Fetch existing options + current product variations
  useEffect(() => {
    async function load() {
      setLoading(true)
      const [optRes, varRes] = await Promise.all([
        fetch('/api/admin/options'),
        fetch(`/api/admin/inventory/${productId}/variations`),
      ])
      if (optRes.ok) {
        const opts = await optRes.json()
        setAllOptions(opts)
      }
      if (varRes.ok) {
        const { options, variations: vars } = await varRes.json()
        // Reconstruct attached options from product_options response
        const attached: OptionWithValues[] = options.map((po: { option: OptionWithValues }) => po.option)
        setAttachedOptions(attached)
        // Reconstruct variation rows
        const rows: VariationRow[] = vars.map((v: ProductVariation & { option_values?: { option_value_id: string }[] }) => ({
          id: v.id,
          optionValueIds: (v.option_values ?? []).map((ov: { option_value_id: string }) => ov.option_value_id),
          optionLabels: [], // Will be computed from attached options
          price: v.price,
          sku: v.sku ?? '',
          stockCount: v.stock_count,
          isActive: v.is_active,
          isDefault: v.is_default,
        }))
        setVariations(rows)
      }
      setLoading(false)
    }
    load()
  }, [productId])

  // Generate all combinations from attached options
  function generateCombinations(options: OptionWithValues[]): VariationRow[] {
    if (options.length === 0) return []
    const valueSets = options.map(o => o.values.filter(v => v.name))
    if (valueSets.some(vs => vs.length === 0)) return []

    function cross(sets: ItemOptionValue[][], prefix: ItemOptionValue[] = []): ItemOptionValue[][] {
      if (sets.length === 0) return [prefix]
      const [first, ...rest] = sets
      return first.flatMap(v => cross(rest, [...prefix, v]))
    }

    return cross(valueSets).map(combo => ({
      optionValueIds: combo.map(v => v.id),
      optionLabels: combo.map(v => v.name),
      price: productPrice,
      sku: '',
      stockCount: 0,
      isActive: true,
      isDefault: false,
    }))
  }

  function handleAttachOption(optionId: string) {
    const opt = allOptions.find(o => o.id === optionId)
    if (!opt || attachedOptions.some(a => a.id === opt.id)) return
    const newAttached = [...attachedOptions, opt]
    setAttachedOptions(newAttached)
    // Regenerate variations preserving existing ones
    const newCombos = generateCombinations(newAttached)
    const existingKeys = new Set(variations.map(v => v.optionValueIds.sort().join(',')))
    const added = newCombos.filter(c => !existingKeys.has(c.optionValueIds.sort().join(',')))
    setVariations([...variations, ...added])
    markDirty()
  }

  function handleRemoveOption(optionId: string) {
    setConfirmRemoveOption(optionId)
  }

  function confirmRemove() {
    if (!confirmRemoveOption) return
    const newAttached = attachedOptions.filter(o => o.id !== confirmRemoveOption)
    setAttachedOptions(newAttached)
    // Remove variations that used values from this option
    const removedOption = attachedOptions.find(o => o.id === confirmRemoveOption)
    const removedValueIds = new Set(removedOption?.values.map(v => v.id) ?? [])
    setVariations(variations.filter(v => !v.optionValueIds.some(id => removedValueIds.has(id))))
    setConfirmRemoveOption(null)
    markDirty()
  }

  function handleAddValue(optionId: string) {
    const input = newValueInputs[optionId]?.trim()
    if (!input) return
    const opt = attachedOptions.find(o => o.id === optionId)
    if (!opt) return
    const newValue: ItemOptionValue = {
      id: `temp-${Date.now()}-${Math.random()}`,
      option_id: optionId, name: input, sort_order: opt.values.length,
      square_option_value_id: null, created_at: '', updated_at: '',
    }
    const updatedOpt = { ...opt, values: [...opt.values, newValue] }
    setAttachedOptions(attachedOptions.map(o => o.id === optionId ? updatedOpt : o))
    setNewValueInputs({ ...newValueInputs, [optionId]: '' })
    // Add new combination rows
    const newAttached = attachedOptions.map(o => o.id === optionId ? updatedOpt : o)
    const allCombos = generateCombinations(newAttached)
    const existingKeys = new Set(variations.map(v => v.optionValueIds.sort().join(',')))
    const added = allCombos.filter(c => !existingKeys.has(c.optionValueIds.sort().join(',')))
    if (added.length > 0) setVariations([...variations, ...added])
    markDirty()
  }

  function updateVariation(index: number, field: keyof VariationRow, value: unknown) {
    setVariations(variations.map((v, i) => i === index ? { ...v, [field]: value } : v))
    markDirty()
  }

  function handleBulkPrice() {
    const p = parseFloat(bulkPrice)
    if (!Number.isFinite(p) || p <= 0) return
    setVariations(variations.map(v => ({ ...v, price: p })))
    setBulkPrice('')
    markDirty()
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    const payload = {
      options: attachedOptions.map(o => ({
        id: o.id.startsWith('temp-') ? undefined : o.id,
        name: o.name,
        values: o.values.map(v => ({
          id: v.id.startsWith('temp-') ? undefined : v.id,
          name: v.name,
          sort_order: v.sort_order,
        })),
      })),
      variations: variations.filter(v => v.isActive || v.id).map(v => ({
        id: v.id,
        option_value_ids: v.optionValueIds.map(id => id.startsWith('temp-') ? undefined : id).filter(Boolean),
        price: v.price,
        sku: v.sku || undefined,
        is_active: v.isActive,
      })),
    }
    const res = await fetch(`/api/admin/inventory/${productId}/variations`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Failed to save')
    } else {
      setDirty(false)
      onDirtyChange(false)
    }
    setSaving(false)
  }

  // Compute combination preview count
  const previewCount = generateCombinations(attachedOptions).length

  if (loading) return <div style={{ padding: '16px', color: 'var(--color-text-muted)' }}>Loading variations...</div>

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

  return (
    <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '16px', marginTop: '16px' }}>
      <h3 style={{ margin: '0 0 12px', fontSize: '16px' }}>Product Options & Variations</h3>

      {/* Option picker */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' }}>
          Attach Option
        </label>
        <select
          style={{ ...inputStyle, width: '100%', minHeight: '48px' }}
          value=""
          onChange={e => { if (e.target.value) handleAttachOption(e.target.value) }}
        >
          <option value="">Select an option...</option>
          {allOptions.filter(o => !attachedOptions.some(a => a.id === o.id)).map(o => (
            <option key={o.id} value={o.id}>{o.name} ({o.values.length} values)</option>
          ))}
        </select>
      </div>

      {/* Attached options with chip-based values (A8) */}
      {attachedOptions.map(opt => (
        <div key={opt.id} style={{ marginBottom: '16px', padding: '12px', background: 'var(--color-surface)', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <strong>{opt.name}</strong>
            <button style={{ ...btnSmall, color: 'var(--color-error)' }} onClick={() => handleRemoveOption(opt.id)}>
              Remove
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
            {opt.values.map(v => (
              <span key={v.id} style={chipStyle}>
                {v.name}
                <button
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', fontSize: '14px', lineHeight: 1 }}
                  onClick={() => {
                    const updatedOpt = { ...opt, values: opt.values.filter(val => val.id !== v.id) }
                    setAttachedOptions(attachedOptions.map(o => o.id === opt.id ? updatedOpt : o))
                    markDirty()
                  }}
                  aria-label={`Remove ${v.name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              style={{ ...inputStyle, flex: 1, minHeight: '48px' }}
              placeholder={`e.g., "Small"`}
              value={newValueInputs[opt.id] ?? ''}
              onChange={e => setNewValueInputs({ ...newValueInputs, [opt.id]: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddValue(opt.id) } }}
            />
            <button style={{ ...btnSmall }} onClick={() => handleAddValue(opt.id)}>Add</button>
          </div>
        </div>
      ))}

      {/* Combination preview (A9) */}
      {attachedOptions.length > 0 && (
        <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', margin: '0 0 12px' }}>
          {previewCount} variation{previewCount !== 1 ? 's' : ''} ({attachedOptions.map(o => o.name).join(' × ')})
        </p>
      )}

      {/* Bulk actions */}
      {variations.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <input
            style={{ ...inputStyle, width: '120px', minHeight: '48px' }}
            type="number" step="0.01" min="0.01" placeholder="Price"
            value={bulkPrice}
            onChange={e => setBulkPrice(e.target.value)}
          />
          <button style={btnSmall} onClick={handleBulkPrice}>Set all prices</button>
          <button
            style={btnSmall}
            onClick={() => { setVariations(variations.map(v => ({ ...v, isActive: true }))); markDirty() }}
          >
            Activate all
          </button>
          <button
            style={btnSmall}
            onClick={() => { setVariations(variations.map(v => ({ ...v, isActive: false }))); markDirty() }}
          >
            Deactivate all
          </button>
        </div>
      )}

      {/* Variations list — card layout on mobile, table on desktop */}
      {variations.length > 0 && (
        isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {variations.map((v, i) => (
              <div key={v.id ?? i} style={{
                padding: '12px', borderRadius: '8px',
                border: `1px solid ${v.isActive ? 'var(--color-border)' : 'var(--color-error)'}`,
                opacity: v.isActive ? 1 : 0.6,
              }}>
                <div style={{ fontWeight: '500', marginBottom: '8px' }}>{v.optionLabels.join(' / ') || 'Default'}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '14px' }}>
                    Price
                    <input
                      style={{ ...inputStyle, width: '100%', minHeight: '48px' }}
                      type="number" step="0.01" min="0.01"
                      value={v.price}
                      onChange={e => updateVariation(i, 'price', parseFloat(e.target.value) || 0)}
                    />
                  </label>
                  <div style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>
                    Stock: {v.stockCount}
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', minHeight: '48px' }}>
                    <input
                      type="checkbox" checked={v.isActive}
                      onChange={e => updateVariation(i, 'isActive', e.target.checked)}
                    />
                    Active
                  </label>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--color-border)' }}>Variation</th>
                  <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--color-border)' }}>Price</th>
                  <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--color-border)' }}>Stock</th>
                  <th style={{ textAlign: 'center', padding: '8px', borderBottom: '1px solid var(--color-border)' }}>Active</th>
                </tr>
              </thead>
              <tbody>
                {variations.map((v, i) => (
                  <tr key={v.id ?? i} style={{ opacity: v.isActive ? 1 : 0.5 }}>
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--color-border)' }}>
                      {v.optionLabels.join(' / ') || 'Default'}
                    </td>
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--color-border)' }}>
                      <input
                        style={{ ...inputStyle, width: '100px', minHeight: '48px' }}
                        type="number" step="0.01" min="0.01"
                        value={v.price}
                        onChange={e => updateVariation(i, 'price', parseFloat(e.target.value) || 0)}
                      />
                    </td>
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                      {v.stockCount}
                    </td>
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--color-border)', textAlign: 'center' }}>
                      <input
                        type="checkbox" checked={v.isActive}
                        onChange={e => updateVariation(i, 'isActive', e.target.checked)}
                        style={{ width: '20px', height: '20px' }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {error && <p style={{ color: 'var(--color-error)', fontSize: '14px', marginTop: '8px' }}>{error}</p>}

      {/* Save button */}
      {variations.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          <button
            style={{ ...btnSmall, background: 'var(--color-primary)', color: 'var(--color-accent)', fontWeight: '500' }}
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            {saving ? 'Saving variations...' : 'Save Variations'}
          </button>
        </div>
      )}

      {confirmRemoveOption && (
        <ConfirmDialog
          message={`Removing this option will delete associated variations and their price data. This cannot be undone after saving.`}
          confirmLabel="Remove Option"
          onConfirm={confirmRemove}
          onCancel={() => setConfirmRemoveOption(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/admin/VariationsEditor.tsx
git commit -m "feat: add VariationsEditor component with chip input, mobile cards, bulk actions"
```

---

### Task 5: Integrate VariationsEditor into ProductForm

**Files:**
- Modify: `components/admin/ProductForm.tsx`

- [ ] **Step 1: Add VariationsEditor to ProductForm**

Modify `components/admin/ProductForm.tsx`:

1. Add import at top:
```typescript
import VariationsEditor from './VariationsEditor'
```

2. Add state for has_options and dirty tracking after existing state declarations (around line 55):
```typescript
const [hasOptions, setHasOptions] = useState(Boolean((product as any)?.has_options))
const [variationsDirty, setVariationsDirty] = useState(false)
```

3. Conditionally hide price and stock fields when `hasOptions` is true. Wrap the existing price input block (around line 180-190) and stock input block (around line 285-295) with:
```typescript
{!hasOptions && (
  // existing price/stock field JSX
)}
{hasOptions && (
  <p style={{ ...inputStyle, background: 'var(--color-surface)', border: 'none', fontSize: '14px', color: 'var(--color-text-muted)' }}>
    Prices and stock are managed per variation below.
  </p>
)}
```

4. Add the VariationsEditor section before the submit buttons (around line 330):
```typescript
{product?.id && (
  <div style={{ marginTop: '16px' }}>
    {!hasOptions && (
      <button
        type="button"
        style={btnSecondaryStyle}
        onClick={() => setHasOptions(true)}
      >
        Add Options (Size, Color, etc.)
      </button>
    )}
    {hasOptions && (
      <VariationsEditor
        productId={product.id}
        productPrice={parseFloat(price) || 0}
        onDirtyChange={setVariationsDirty}
      />
    )}
  </div>
)}
```

5. Update the cancel handler to check for unsaved variations. In the `onCancel` prop usage, add a guard:
```typescript
const handleCancel = () => {
  if (variationsDirty) {
    if (!confirm('You have unsaved variation changes. Discard them?')) return
  }
  onCancel()
}
```

Replace `onCancel` references in the cancel button with `handleCancel`.

- [ ] **Step 2: Run full test suite**

Run: `npx jest --no-cache`
Expected: All tests pass (existing ProductForm tests don't render VariationsEditor since they don't provide `product.id`)

- [ ] **Step 3: Commit**

```bash
git add components/admin/ProductForm.tsx
git commit -m "feat: integrate VariationsEditor into ProductForm with has_options toggle"
```

---

### Task 6: Shop product API — return option labels

**Files:**
- Modify: `app/api/shop/products/[id]/route.ts`

The public API needs to return option value labels so the cart can display "Size: S / Color: Red" for each variation.

- [ ] **Step 1: Update the query to join option value names**

In `app/api/shop/products/[id]/route.ts`, replace the variations query (line 24):

```typescript
// Before:
supabase.from('product_variations').select('id,price,is_default,is_active,image_url').eq('product_id', id).eq('is_active', true),

// After:
supabase.from('product_variations')
  .select('id,price,is_default,is_active,image_url,option_values:variation_option_values(value:item_option_values(id,name,option:item_options(name)))')
  .eq('product_id', id).eq('is_active', true),
```

Update the `safeVariations` mapping (lines 30-37):

```typescript
const safeVariations = (variations ?? []).map(v => {
  const optVals = (v as any).option_values ?? []
  const label = optVals.map((ov: any) => `${ov.value?.option?.name}: ${ov.value?.name}`).join(' / ')
  return {
    id: v.id,
    price: v.price,
    is_default: v.is_default,
    is_active: v.is_active,
    image_url: v.image_url,
    label: label || undefined,
    in_stock: (v as any).stock_count > 0,
  }
})
```

Also fix the hardcoded `in_stock: true` — it should check actual stock.

- [ ] **Step 2: Commit**

```bash
git add app/api/shop/products/[id]/route.ts
git commit -m "fix: return option labels and real in_stock for public product variations"
```

---

### Task 7: Private sale checkout — use variation_id when present

**Files:**
- Modify: `app/api/shop/private-sale/[token]/checkout/route.ts`
- Modify: `__tests__/api/shop/private-sale-checkout.test.ts` (if exists)

- [ ] **Step 1: Fix the hardcoded is_default lookup**

In `app/api/shop/private-sale/[token]/checkout/route.ts`, replace lines 165-178:

```typescript
// Before:
for (const item of sale.items) {
  const i = item as { product_id: string; quantity: number; custom_price: number }
  const { data: defaultVar } = await supabase
    .from('product_variations')
    .select('id')
    .eq('product_id', i.product_id)
    .eq('is_default', true)
    .maybeSingle()
  if (defaultVar) {
    await supabase.rpc('decrement_variation_stock', { var_id: defaultVar.id, qty: i.quantity })
  }
}

// After:
for (const item of sale.items) {
  const i = item as { product_id: string; quantity: number; custom_price: number; variation_id?: string }
  let varId: string | undefined = i.variation_id ?? undefined
  if (!varId) {
    // Fallback to default variation for legacy sale items without variation_id
    const { data: defaultVar } = await supabase
      .from('product_variations')
      .select('id')
      .eq('product_id', i.product_id)
      .eq('is_default', true)
      .maybeSingle()
    varId = defaultVar?.id
  }
  if (varId) {
    await supabase.rpc('decrement_variation_stock', { var_id: varId, qty: i.quantity })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/shop/private-sale/[token]/checkout/route.ts
git commit -m "fix: use variation_id from sale item when present instead of always default"
```

---

### Task 8: Square multi-variation push

**Files:**
- Modify: `lib/channels/square/catalog.ts`

- [ ] **Step 1: Update pushProduct for multi-variation products**

In `lib/channels/square/catalog.ts`, refactor `pushProduct` (lines 79-186). After the existing default variation lookup (lines 99-108), add a branch:

```typescript
// After line 108, before the delete-then-recreate block:

// Fetch all active variations if has_options
const { data: productRow } = await supabase.from('products').select('has_options').eq('id', product.id).single()
let variationsPayload: Array<{
  type: 'ITEM_VARIATION'
  id: string
  itemVariationData: {
    name: string
    pricingType: 'FIXED_PRICING'
    priceMoney: { amount: bigint; currency: 'USD' }
    sku?: string
    locationOverrides: Array<{ locationId: string; trackInventory: boolean }>
  }
}>

if (productRow?.has_options) {
  // Multi-variation: fetch all active variations with their option labels
  const { data: allVars } = await supabase
    .from('product_variations')
    .select('id,price,sku,stock_count,square_variation_id,option_values:variation_option_values(value:item_option_values(name))')
    .eq('product_id', product.id)
    .eq('is_active', true)

  variationsPayload = (allVars ?? []).map((v: any, idx: number) => {
    const label = (v.option_values ?? []).map((ov: any) => ov.value?.name).filter(Boolean).join(', ') || `Variation ${idx + 1}`
    return {
      type: 'ITEM_VARIATION' as const,
      id: `#VAR-${product.id}-${idx}`,
      itemVariationData: {
        name: label,
        pricingType: 'FIXED_PRICING' as const,
        priceMoney: { amount: BigInt(Math.round(v.price * 100)), currency: 'USD' as const },
        sku: v.sku ?? undefined,
        locationOverrides: [{ locationId, trackInventory: true }],
      },
    }
  })
} else {
  // Simple product: single "Regular" variation
  variationsPayload = [{
    type: 'ITEM_VARIATION' as const,
    id: `#VAR-${product.id}`,
    itemVariationData: {
      name: 'Regular',
      pricingType: 'FIXED_PRICING' as const,
      priceMoney: { amount: BigInt(Math.round(variationPrice * 100)), currency: 'USD' as const },
      locationOverrides: [{ locationId, trackInventory: true }],
    },
  }]
}
```

Then update the `client.catalog.object.upsert` call to use `variationsPayload` instead of the hardcoded single variation. After the upsert, map back all Square variation IDs:

```typescript
// After upsert result
const resultVariations = (result.catalogObject as any)?.itemData?.variations ?? []
for (let i = 0; i < resultVariations.length; i++) {
  const sqVarId = resultVariations[i]?.id
  if (sqVarId && productRow?.has_options) {
    const { data: allVars } = await supabase
      .from('product_variations')
      .select('id')
      .eq('product_id', product.id)
      .eq('is_active', true)
      .order('created_at')
    if (allVars?.[i]) {
      await supabase.from('product_variations')
        .update({ square_variation_id: sqVarId })
        .eq('id', allVars[i].id)
    }
  }
}
```

- [ ] **Step 2: Run tests**

Run: `npx jest --no-cache`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add lib/channels/square/catalog.ts
git commit -m "feat: push all active variations to Square for multi-option products"
```

---

### Task 9: Square multi-variation pull

**Files:**
- Modify: `lib/channels/square/catalog.ts`

- [ ] **Step 1: Update pullProductsFromSquare to import all variations**

In `pullProductsFromSquare` (line 368+), after iterating items:

Replace the single-variation read (lines 394-398):
```typescript
// Before:
const variation = itemData.variations?.[0] as any
const variationId: string | null = variation?.id ?? null
const priceCents = variation?.itemVariationData?.priceMoney?.amount
const price = priceCents != null ? Number(priceCents) / 100 : 0
```

With multi-variation handling:
```typescript
const squareVariations = (itemData.variations ?? []) as any[]
const firstVariation = squareVariations[0]
const firstVariationId: string | null = firstVariation?.id ?? null
const firstPriceCents = firstVariation?.itemVariationData?.priceMoney?.amount
const price = firstPriceCents != null ? Number(firstPriceCents) / 100 : 0
const hasMultipleVariations = squareVariations.length > 1
```

After the product upsert/insert block, add multi-variation handling:
```typescript
if (hasMultipleVariations) {
  const productId = existing?.id ?? newProductId // capture from insert above
  if (productId) {
    // Import ITEM_OPTION references (if present on the item)
    // Note: Square item options are fetched separately — this maps existing option IDs
    for (let vi = 0; vi < squareVariations.length; vi++) {
      const sqVar = squareVariations[vi]
      const sqVarId = sqVar?.id
      const varPrice = sqVar?.itemVariationData?.priceMoney?.amount
        ? Number(sqVar.itemVariationData.priceMoney.amount) / 100 : price
      const varSku = sqVar?.itemVariationData?.sku ?? null
      const varName = sanitizeText(sqVar?.itemVariationData?.name ?? `Variation ${vi + 1}`)

      try {
        const { data: existingVar } = await supabase
          .from('product_variations')
          .select('id')
          .eq('product_id', productId)
          .eq('square_variation_id', sqVarId)
          .maybeSingle()

        if (existingVar) {
          await supabase.from('product_variations')
            .update({ price: varPrice, sku: varSku, updated_at: new Date().toISOString() })
            .eq('id', existingVar.id)
        } else {
          await supabase.from('product_variations').insert({
            product_id: productId,
            price: varPrice,
            sku: varSku,
            square_variation_id: sqVarId,
            is_default: vi === 0,
            is_active: true,
            stock_count: 0,
          })
        }
      } catch {
        // Non-blocking — don't fail the whole pull
      }
    }
    // Set has_options on product
    await supabase.from('products').update({ has_options: true }).eq('id', productId)
  }
}
```

- [ ] **Step 2: Run tests**

Run: `npx jest --no-cache`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add lib/channels/square/catalog.ts
git commit -m "feat: pull all variations from Square catalog, not just first"
```

---

### Task 10: Regression tests for Square catalog sync

**Files:**
- Create: `__tests__/lib/channels/square/catalog-variations.test.ts`

- [ ] **Step 1: Write catalog variation tests**

Create `__tests__/lib/channels/square/catalog-variations.test.ts`:

```typescript
/**
 * @jest-environment node
 */

const mockFrom = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}))

const mockCatalogUpsert = jest.fn()
const mockCatalogList = jest.fn()
const mockInventoryBatch = jest.fn()
jest.mock('@/lib/channels/square/client', () => ({
  getSquareClient: jest.fn().mockResolvedValue({
    client: {
      catalog: {
        object: { upsert: (...args: unknown[]) => mockCatalogUpsert(...args), delete: jest.fn() },
        list: (...args: unknown[]) => mockCatalogList(...args),
      },
      inventory: { batchCreateChanges: (...args: unknown[]) => mockInventoryBatch(...args), batchGetCounts: jest.fn().mockResolvedValue({ data: [] }) },
    },
    locationId: 'loc-1',
  }),
}))

function makeBuilder(value: unknown) {
  return {
    select: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    single: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => void) => resolve(value),
  }
}

describe('pushProduct — multi-variation', () => {
  beforeEach(() => jest.resetAllMocks())

  it('sends all active variations to Square when has_options is true', async () => {
    jest.resetModules()
    const { pushProduct } = await import('@/lib/channels/square/catalog')

    mockFrom.mockImplementation((table: string) => {
      if (table === 'product_variations' && mockFrom.mock.calls.length <= 2) {
        return makeBuilder({
          data: { price: 25, stock_count: 3, square_variation_id: null },
          error: null,
        })
      }
      if (table === 'products') {
        return makeBuilder({ data: { has_options: true }, error: null })
      }
      if (table === 'product_variations') {
        return makeBuilder({
          data: [
            { id: 'v1', price: 25, sku: 'SM', stock_count: 3, square_variation_id: null, option_values: [{ value: { name: 'Small' } }] },
            { id: 'v2', price: 30, sku: 'LG', stock_count: 1, square_variation_id: null, option_values: [{ value: { name: 'Large' } }] },
          ],
          error: null,
        })
      }
      if (table === 'categories') return makeBuilder({ data: null, error: null })
      return makeBuilder({ data: null, error: null })
    })

    mockCatalogUpsert.mockResolvedValue({
      catalogObject: {
        id: 'cat-1',
        itemData: {
          variations: [{ id: 'sq-v1' }, { id: 'sq-v2' }],
        },
      },
    })

    await pushProduct({ id: 'p1', name: 'Jacket', price: 25, square_catalog_id: null } as any)

    expect(mockCatalogUpsert).toHaveBeenCalled()
    const upsertArg = mockCatalogUpsert.mock.calls[0][0]
    const variations = upsertArg.object.itemData.variations
    expect(variations.length).toBe(2)
    expect(variations[0].itemVariationData.name).toBe('Small')
    expect(variations[1].itemVariationData.name).toBe('Large')
  })
})

describe('pullProductsFromSquare — multi-variation', () => {
  it('creates product_variations for all Square item variations', async () => {
    jest.resetModules()
    jest.resetAllMocks()

    const insertCalls: unknown[] = []
    mockFrom.mockImplementation((table: string) => {
      const builder = makeBuilder({ data: null, error: null })
      if (table === 'product_variations') {
        return {
          ...builder,
          insert: jest.fn().mockImplementation((row: unknown) => {
            insertCalls.push(row)
            return makeBuilder({ data: { id: `new-${insertCalls.length}` }, error: null })
          }),
        }
      }
      if (table === 'products') {
        return {
          ...builder,
          insert: jest.fn().mockReturnValue({
            ...builder,
            then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
          }),
        }
      }
      return builder
    })

    mockCatalogList.mockResolvedValue({
      [Symbol.asyncIterator]: async function* () {
        yield {
          type: 'ITEM', id: 'sq-item-1',
          itemData: {
            name: 'Jacket',
            variations: [
              { id: 'sq-v1', itemVariationData: { name: 'Small', priceMoney: { amount: 2500n, currency: 'USD' } } },
              { id: 'sq-v2', itemVariationData: { name: 'Large', priceMoney: { amount: 3000n, currency: 'USD' } } },
            ],
          },
        }
      },
    })

    const { pullProductsFromSquare } = await import('@/lib/channels/square/catalog')
    await pullProductsFromSquare()

    // Should have created variations for both Square variations
    const variationInserts = insertCalls.filter((c: any) => c.square_variation_id)
    expect(variationInserts.length).toBeGreaterThanOrEqual(2)
  })
})
```

- [ ] **Step 2: Run tests**

Run: `npx jest __tests__/lib/channels/square/catalog-variations.test.ts --no-cache`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add __tests__/lib/channels/square/catalog-variations.test.ts
git commit -m "test: add multi-variation Square catalog push/pull regression tests"
```

---

### Task 11: Full test suite verification + build check

- [ ] **Step 1: Run full test suite**

Run: `npx jest --no-cache`
Expected: All tests pass, zero failures

- [ ] **Step 2: Run build**

Run: `npx next build`
Expected: Build succeeds with no TypeScript errors

- [ ] **Step 3: Fix any issues found**

If tests fail or build errors occur, fix them before proceeding.

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: resolve test/build issues from variations admin UI"
```

---

## Deployment Notes

1. **Run migration 049 first** in Supabase SQL editor (same as 048)
2. **Deploy code** — Vercel auto-deploys from main
3. **Test the flow:** Create a product → Add Options → Generate variations → Save → Verify in Square
4. **Test Square pull:** If you have multi-variation items in Square, run "Sync from Square" and verify they appear with all variations

## Post-Deploy Verification

- Admin can add options to a product and see auto-generated variations
- Stock is read-only in the variations table
- Removing an option shows confirmation dialog
- Mobile shows card layout, not table
- Square push sends all active variations
- Square pull imports all variations from multi-variation items
- Private sale checkout uses variation_id when present
