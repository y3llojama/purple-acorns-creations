# Events Page — Design Spec

**Date:** 2026-03-21
**Status:** Approved for implementation

---

## 1. Overview

Add a public `/events` page listing all upcoming and past events for Purple Acorns Creations. Events are managed through the existing admin panel. A "Find Events" button in the admin uses Claude API (with web search) to auto-discover events from the web and import them, skipping duplicates.

### Goals
- Capture organic search traffic from people searching for events Purple Acorns has appeared at
- Provide a central record of past and upcoming appearances
- Allow admins to manually add events and auto-discover events from Google
- No new API keys or third-party services required

---

## 2. What Already Exists

| Layer | Status |
|---|---|
| `events` DB table | Done — `id, name, date, time, location, description, link_url, link_label, created_at` |
| `/admin/events` admin page | Done — add and delete only |
| `/api/admin/events` CRUD API | Done — GET, POST, PUT, DELETE |
| `ModernEventSection` (homepage teaser) | Done — shows next upcoming event |
| Public `/events` page | **Missing** |
| Admin edit support | **Missing** (API exists, UI does not) |
| "Find Events" discovery button | **Missing** |

---

## 3. Public `/events` Page

### Route
`app/(public)/events/page.tsx` — server component

### Data Fetching
Single Supabase query: all events ordered by date. Split in-memory by today's date:
- **Upcoming** — `date >= today`, sorted ascending (soonest first)
- **Past** — `date < today`, sorted descending (most recent first)

### Layout
One page, two sections separated by a heading:

**Upcoming Events**
- If none: friendly "Check back soon — we're always finding new markets and fairs to join."
- Event card: name (heading), formatted date, location, external link button if `link_url` is set

**Past Events**
- Same card layout, visually muted (reduced opacity or muted color on date/location)
- Always shown — archive is the SEO value

### Navigation
Update the Header nav link from `/#events` → `/events`.

### SEO
- Page `<title>`: `Events | Purple Acorns Creations`
- Page `<meta name="description">`: `Find Purple Acorns Creations at arts and crafts fairs across Brooklyn and NYC. See our upcoming events and past appearances.`
- Static generation — no `dynamic = 'force-dynamic'` needed; events don't change by the second

---

## 4. Admin EventsManager — Edit Support

The PUT endpoint at `/api/admin/events` already exists. The UI currently only supports add and delete.

### Changes to `EventsManager.tsx`
- Add an **Edit** button to each event list item (alongside Delete)
- Clicking Edit populates the existing add form with that event's data and switches to "update" mode
- Save calls `PUT /api/admin/events` with the event `id` and updated fields
- Cancel restores the form to empty / add mode

---

## 5. "Find Events" Button (Admin)

### Trigger
A **Find Events** button in the admin events page header (next to "+ Add New Event"). User-triggered only — never runs automatically on page load.

### API Route
`POST /api/admin/events/discover`

### Flow
1. Read `ai_provider` and `ai_api_key` from the settings table (same pattern as newsletter generation). Return 503 if not configured.
2. Call Claude API (`claude-sonnet-4-6`) with the `web_search` tool enabled.
3. Prompt asks Claude to search for Purple Acorns Creations events and return a JSON array of `{ name, date, location, link_url }` objects. Both spellings searched: "Purple Acorns Creations" and "Purple Acornz".
4. Parse the returned JSON array.
5. For each found event, query the DB for an existing row where `lower(name)`, `date`, and `lower(location)` all match — skip if found.
6. Insert new events via Supabase.
7. Return `{ added: N, skipped: N }`.

### Deduplication Key
`name + date + location` — all three must match (case-insensitive) to count as a duplicate.

### UI Behavior
- Button shows loading state while the request is in flight
- On success: shows inline message `"3 events added, 2 already in your list"`
- On error: shows inline error message
- List refreshes automatically after import (re-fetches from API)

### Error Handling
- AI not configured → show message directing admin to Admin → Integrations
- Claude API error → show "Discovery failed, try again"
- No events found → show "No new events found"

---

## 6. What Is Not Changing

- The homepage `ModernEventSection` teaser (shows next upcoming event) — untouched
- The `events` DB table schema — no migration needed
- Admin event form fields — unchanged
- Rate limiting on `/api/admin/events/discover` — admin-only route, protected by `requireAdminSession()`

---

## 7. Files to Create / Modify

| Action | File |
|---|---|
| Create | `app/(public)/events/page.tsx` |
| Modify | `components/layout/Header.tsx` — update nav link |
| Modify | `components/admin/EventsManager.tsx` — add edit + find events |
| Create | `app/api/admin/events/discover/route.ts` |
