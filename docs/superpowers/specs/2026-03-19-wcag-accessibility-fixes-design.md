# WCAG Accessibility Fixes — Design Spec

**Date:** 2026-03-19
**Scope:** `ModernFAB.tsx`, `FormField.tsx` error element, public-facing forms, `shop/page.tsx`
**Target:** WCAG 2.1 Level AA
**Approach:** Fix-in-place (Option A) — targeted edits, no new abstractions

---

## Problem Statement

The site targets WCAG 2.1 AA conformance (stated on the `/accessibility` page) but has concrete violations in the floating action button system and public-facing form patterns.

---

## Files to Change

| File | Changes |
|------|---------|
| `components/modern/ModernFAB.tsx` | Focus traps, form labels, error role, emoji aria-hidden, touch target, aria-controls, tabIndex |
| `components/ui/FormField.tsx` | Remove redundant `aria-live="polite"` from error element (conflicts with `role="alert"`) |
| `components/layout/ContactForm.tsx` | Add `aria-invalid` + `aria-describedby` to inputs; add error IDs |
| `components/home/NewsletterSignup.tsx` | Add `aria-invalid` + `aria-describedby` to email input; add error ID |
| `app/(public)/shop/page.tsx` | Remove nested `<main>` (replace with `<div>`) — duplicate landmark inside `ModernLayout`'s `<main>` |

**Note on skip link:** `ModernLayout.tsx` already has `id="main-content"` on its `<main>` element. All public pages route through this layout. No skip link changes needed.

---

## Section 1: ModernFAB Fixes

### 1.1 Focus Trap — Chat Panel

**Violation:** WCAG 2.1 SC 2.1.2 (No Keyboard Trap); ARIA Dialog authoring practices
**Fix:**
- Add `id="mfab-chat-dialog"` to the chat panel div
- Add `useRef` for the chat FAB trigger button (`chatTriggerRef`) and panel container (`chatPanelRef`)
- Store `previousFocusRef` (same pattern as `ConfirmDialog.tsx`)
- On `chatOpen → true`: move focus to first focusable element inside the panel
- On `chatOpen → false`: restore focus to `chatTriggerRef`
- Add `keydown` handler on the panel for Tab/Shift+Tab cycling and Escape to close

**Focusable query selector** (must include links and inputs, not just buttons):
```
a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])
```

**Focus targets by step:**
- `chatStep === 'quick'`: first = close button; last = "Write us a message" button (with `<a>` links in between)
- `chatStep === 'compose'`: first = name input (`firstInputRef`); last = back button
- `chatStep === 'sent'`: first = last = Close button

### 1.2 Focus Trap — Accessibility Panel

**Violation:** WCAG 2.1 SC 2.1.2; ARIA Dialog authoring practices
**Fix:**
- Add `id="mfab-a11y-dialog"` to the a11y panel div
- Add `aria-modal="true"` to the a11y panel (already has `role="dialog"`)
- Add `useRef` for Aa trigger (`a11yTriggerRef`) and panel container (`a11yPanelRef`)
- Store `previousFocusRef` (shared with chat panel or separate)
- On `a11yOpen → true`: move focus to first `input[type="checkbox"]` inside the panel
- On `a11yOpen → false`: restore focus to `a11yTriggerRef`
- Trap Tab/Shift+Tab between first checkbox and Close button
- Add Escape key handler that closes the panel (use same `window.addEventListener('keydown', ...)` pattern as chat)

### 1.3 Scroll-to-Top Keyboard Reachability

**Violation:** WCAG 2.1 SC 2.1.1 (Keyboard) — button is in tab order when visually hidden
**Fix:**
- Add `tabIndex={scrollVisible ? 0 : -1}` to the scroll-to-top `<button>`
- `opacity: 0; pointer-events: none` does not remove from tab order; `tabIndex={-1}` does

### 1.4 Chat Form Input Labels

**Violation:** WCAG 1.3.1 (Info and Relationships), WCAG 4.1.2 (Name, Role, Value)
**Fix:** In the compose step, add visually-hidden labels using `.sr-only` (already in `globals.css`):
```tsx
<label htmlFor="mfab-name" className="sr-only">Your name</label>
<input id="mfab-name" ... />

<label htmlFor="mfab-email" className="sr-only">Email address</label>
<input id="mfab-email" ... />

<label htmlFor="mfab-message" className="sr-only">Message</label>
<textarea id="mfab-message" ... />
```
Placeholders remain unchanged visually.

### 1.5 Error Message Announcement

**Violation:** WCAG 4.1.3 (Status Messages)
**Fix:**
```tsx
{error && <p className="mfab-error" role="alert">{error}</p>}
```

### 1.6 Emoji Screen Reader Noise

**Violation:** Emojis are announced verbosely by screen readers
**Fix:** Wrap all decorative emojis in `<span aria-hidden="true">`:
- `👋` in chat header h2
- `✉️`, `✨`, `🛍`, `💬` in quick links
- `🎉` in sent confirmation

### 1.7 Chat Close Button Touch Target

**Violation:** CLAUDE.md 48px rule; WCAG 2.5.5
**Fix:** Increase `.mfab-chat-close` from 28×28px to 48×48px. Adjust `top`/`right` positioning to keep it visually anchored to the header corner.

### 1.8 `aria-controls` on Chat FAB

**Fix:** Add `aria-controls="mfab-chat-dialog"` to the chat toggle button.

---

## Section 2: Site-Wide Page Conformance

### 2.1 Nested `<main>` in Shop Page

**Violation:** WCAG 1.3.1 (Info and Relationships) — `shop/page.tsx` renders its own `<main>` inside `ModernLayout`'s `<main>`, creating two nested landmark elements
**Fix:** Change the `<main>` in `app/(public)/shop/page.tsx` to a `<div>`. No ID change needed — `ModernLayout` already owns the single correct `<main id="main-content">`.

### 2.2 Public Form `aria-invalid` + `aria-describedby`

**Violation:** WCAG 1.3.1, WCAG 3.3.1 (Error Identification)

**Architecture note:** `FormField` renders `{children}` directly without prop injection, so `aria-invalid`/`aria-describedby` must be added at call sites.

**ContactForm.tsx** — three inputs that display a form-level error today but have no field-level error IDs. Add to each input:
```tsx
aria-invalid={!!errors.fieldName || undefined}
aria-describedby={errors.fieldName ? 'contact-name-error' : undefined}
```
Add matching error elements with the appropriate IDs adjacent to each input.

**NewsletterSignup.tsx** — email input shows a status/error message but input isn't linked:
```tsx
aria-invalid={status === 'error' || undefined}
aria-describedby={status === 'error' ? 'newsletter-email-error' : undefined}
```
Add `id="newsletter-email-error"` to the existing error message element.

### 2.3 FormField Error Element — Remove Redundant `aria-live`

**Violation:** `role="alert"` implies `aria-live="assertive"`; having both `role="alert"` and `aria-live="polite"` creates conflicting announcements in some screen readers.
**Fix:** Remove `aria-live="polite"` from the `<p>` error element in `FormField.tsx`. Keep `role="alert"` only.

---

## Out of Scope

- Admin form inputs (`EventsManager`, `BrandingEditor`, `IntegrationsEditor`, etc.) — behind auth, lower WCAG priority; tracked as future work
- Color contrast automated testing — no new test deps
- Image alt text audit — noted as known limitation on `/accessibility` page
- `ConfirmDialog` — already WCAG-conformant; no changes

---

## Success Criteria

- [ ] Tab key cannot escape chat panel or a11y panel while open
- [ ] Escape key closes both chat panel and a11y panel
- [ ] Focus returns to trigger button when each panel closes
- [ ] Scroll-to-top button is not reachable by keyboard when hidden
- [ ] All chat form inputs have associated labels (screen reader announces field name)
- [ ] Chat form errors are announced immediately by screen readers
- [ ] Emojis in chat panel are skipped by screen readers
- [ ] Chat close button meets 48px minimum
- [ ] `shop/page.tsx` has no nested `<main>` elements
- [ ] ContactForm and NewsletterSignup inputs announce their error state and point to error text
- [ ] FormField error element uses only `role="alert"` (no redundant `aria-live`)
