# Follow Along — Curated Photo Gallery

**Date:** 2026-03-18
**Status:** Approved

## Summary

Add a curated photo gallery mode to the homepage "Follow Along" section. The admin can toggle between the existing Behold.so Instagram widget and a manually uploaded photo gallery displayed as a scrolling film strip with a fixed center CTA overlay.

## Goals

- Let the admin curate up to 10 photos for the Follow Along section
- Provide a toggle to switch between curated gallery and Instagram widget
- Keep the Follow Along photo management completely separate from the main Gallery
- Reuse the existing `gallery` Supabase Storage bucket (path prefix: `follow-along/`)
- No new external dependencies or costs

## Non-Goals

- Instagram API integration (deferred — may add later)
- Photo captions, links, or metadata (simple image list only)
- Drag-and-drop reordering (use arrow buttons like existing Gallery)

## Public-Facing: Film Strip Component

### Layout
- Horizontal strip of photos with a fixed, floating CTA card anchored in the center
- CTA contains: "Follow Along" heading, tagline, and `@handle` button linking to Instagram
- Photos scroll behind the CTA from right to left

### Scroll Behavior
- **≤4 photos**: Static centered row, no scrolling
- **5–10 photos**: Smooth right-to-left CSS animation, seamless infinite loop (photos duplicated offscreen)
- **Hover / touch**: Pauses scroll via `animation-play-state: paused`
- **Mobile**: Auto-scroll continues; manual swipe also supported via `overflow-x: auto` fallback
- **0 photos (gallery mode)**: Falls back to simple Instagram profile link (current behavior)

### Fallback Logic
```
if (follow_along_mode === 'gallery' && photos.length > 0) → film strip
else if (behold_widget_id) → Behold widget
else if (instagram_handle) → simple Instagram link
else → section hidden
```

## Admin: Integrations Page

### Mode Toggle
New "Follow Along Section" area on the existing Integrations admin page with two selectable cards:
- **Curated Gallery** — shows the photo manager below
- **Instagram Widget** — shows the existing Behold widget ID input

Stored as `settings.follow_along_mode`: `'gallery'` | `'widget'` (default: `'widget'`)

### Photo Manager
Visible only when gallery mode is active. Features:
- Grid of thumbnail previews with position numbers
- Upload button (+ icon) — accepts JPG/PNG/WebP, max 5MB
- Delete button (×) per photo with confirmation dialog
- Reorder via arrow buttons (like existing GalleryManager)
- Counter showing `N / 10`
- Uses existing `ImageUploader` component with `bucket="gallery"` and path prefix `follow-along/`

**Note:** The photo manager does NOT require alt text input — these are decorative images in a scrolling strip. The `<img>` tags will use `alt=""` with `role="presentation"`.

## Data Model

### Settings Table (existing — add column)
```sql
ALTER TABLE settings ADD follow_along_mode text DEFAULT 'widget';
```

### Follow Along Photos Table (new)
```sql
CREATE TABLE follow_along_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE follow_along_photos ENABLE ROW LEVEL SECURITY;
-- No public SELECT policy — read via service role on server side
```

### Storage
- Reuse existing `gallery` bucket
- Upload path: `follow-along/{timestamp}.{ext}`
- Public read via Supabase Storage public URL

## API Routes

### POST /api/admin/follow-along
Upload a new photo. Requires `requireAdminSession()`.
- Body: `{ url: string }`
- Validates max 10 photos
- Sets `display_order` to next available position
- Returns the new photo record

### DELETE /api/admin/follow-along
Remove a photo. Requires `requireAdminSession()`.
- Body: `{ id: string }`
- Deletes from table and storage
- Re-normalizes display_order for remaining photos

### PATCH /api/admin/follow-along
Reorder photos. Requires `requireAdminSession()`.
- Body: `{ id: string, display_order: number }`
- Swaps display_order values (same pattern as existing gallery)

### GET /api/admin/follow-along
List all photos ordered by display_order. Requires `requireAdminSession()`.
- Returns array of photo records

## Components

### New Components
- `components/admin/FollowAlongManager.tsx` — Photo upload/reorder/delete manager (client component)
- `components/home/FollowAlongStrip.tsx` — Film strip with scrolling animation and fixed CTA (server component with client wrapper for scroll behavior)

### Modified Components
- `components/home/InstagramFeed.tsx` — Add gallery mode: render `FollowAlongStrip` when `follow_along_mode === 'gallery'` and photos exist
- `app/admin/integrations/page.tsx` — Add mode toggle and embed `FollowAlongManager`

### Reused Components
- `components/admin/ImageUploader.tsx` — For photo uploads
- `components/admin/ConfirmDialog.tsx` — For delete confirmation

## Settings Type Update
Add to `Settings` interface in `lib/supabase/types.ts`:
```typescript
follow_along_mode: 'gallery' | 'widget' | null
```

Add new type:
```typescript
export interface FollowAlongPhoto {
  id: string
  storage_path: string
  display_order: number
  created_at: string
}
```

## Testing

- Unit tests for the API route (CRUD operations, max 10 enforcement, auth check)
- Component test for FollowAlongManager (upload, delete, reorder)
- Component test for FollowAlongStrip (static vs scrolling, fallback behavior)
- Component test for InstagramFeed (mode switching)

## Migration File
`supabase/migrations/008_follow_along_photos.sql`
