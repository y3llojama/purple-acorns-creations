# Purple Acorns Creations — Full Usability Audit

**Date:** 2026-04-01
**Scope:** All public-facing pages, interactive components, CSS/theming, accessibility, performance UX
**Method:** Three parallel audit agents covering (1) page flows & layout, (2) forms & interactions, (3) CSS & accessibility

---

## Executive Summary

The site has a **strong foundation** — generous typography, good use of CSS custom properties, solid ARIA patterns in key components (CartDrawer, ConfirmDialog, ModernFAB), and correct `prefers-reduced-motion` handling in globals.css. However, the **checkout flow has critical accessibility gaps**, several **keyboard navigation paths are broken**, and **color contrast fails** in multiple themes. Below are all findings, deduplicated and ranked.

---

## CRITICAL — Must Fix (Broken or Inaccessible)

### 1. Checkout shipping inputs have no labels
**File:** `components/shop/CheckoutForm.tsx`
All shipping fields use `placeholder` only — no `<label>`, no `aria-label`. Placeholders vanish on typing, leaving users (especially screen reader users) with no field identification. **Fails WCAG 1.3.1 and 3.3.2.** The `PrivateSaleCheckout` has the same issue.

### 2. Pay button is active while shipping cost is still loading
**File:** `components/shop/CheckoutForm.tsx`
`shippingCost` starts as `null` and is fetched async. The button is only disabled for `loading || !sdkReady` — not for `shippingCost === null`. A user can pay the **wrong total** (`shippingCost ?? 0`) before shipping is calculated.

### 3. No checkout client-side validation
**File:** `components/shop/CheckoutForm.tsx`
Unlike `PrivateSaleCheckout`, the main `CheckoutForm` has no pre-submission check that required shipping fields are filled. Users must wait for a network round-trip to see a generic error.

### 4. Mobile header menu has no focus trap or Escape key
**File:** `components/layout/Header.tsx`
When `menuOpen` is true, Tab sends focus past the menu into the page content. No `onKeyDown` handler exists. No focus restoration on close. This makes mobile navigation unusable for keyboard users.

### 5. ModernNavDrawer desktop flyout is keyboard-inaccessible
**File:** `components/modern/ModernNavDrawer.tsx`
Flyout submenus open only on `mouseenter`/`mouseleave` — no `onFocus`/`onBlur` handlers. Keyboard users can never reach flyout items like category links.

### 6. No variation picker on product detail
**File:** `components/shop/ProductDetail.tsx`
"Add to Cart" silently uses `default_variation_id`. If a product has multiple variations (sizes, colors), the user **cannot select between them**.

### 7. Announcement banner white text on lavender fails contrast
**File:** `app/globals.css` (modern theme)
`--color-announce-text: #ffffff` on `--color-announce-bg: #b09dce` = ~2.3:1 ratio. **Fails WCAG AA** (requires 4.5:1).

### 8. Focus ring contrast fails in two themes
**File:** `app/globals.css`
- **warm-artisan:** `#d4a853` focus ring on `#f5ede0` background = ~2.9:1 (needs 3:1)
- **soft-botanical:** `#9b7bb8` focus ring on `#f8f4f0` = ~2.6:1

---

## SIGNIFICANT — Notable UX Gaps

### Navigation & Wayfinding

| # | Issue | File |
|---|-------|------|
| 9 | No `aria-current="page"` or visual active state on any nav link — users can't tell which page they're on | `Header.tsx`, `ModernHeader.tsx` |
| 10 | ModernNavDrawer has hardcoded nav items (e.g., "New Arrivals", "Gift Sets") that all link to `/shop` — placeholder links confuse users | `ModernNavDrawer.tsx` |
| 11 | No back-to-cart link on checkout — only escape is browser back or full site nav | `CheckoutForm.tsx` |
| 12 | Skip-to-content link target `#main-content` missing on `/newsletter`, `/contact`, `/private-sale` pages — skip link silently fails | Various page files |

### Keyboard & Screen Reader Access

| # | Issue | File |
|---|-------|------|
| 13 | HeroCarousel autoplay doesn't pause on keyboard focus — violates WCAG 2.2.2; only pauses on mouse hover | `HeroCarousel.tsx` |
| 14 | EventsTabs lacks arrow key navigation — uses `role="tablist"` but tabs move focus via Tab key, not arrow keys as the ARIA pattern requires | `EventsTabs.tsx` |
| 15 | ImageCarousel dot nav uses `role="tab"` without roving tabindex — same ARIA tab pattern violation | `ImageCarousel.tsx` |
| 16 | Search results `role="listbox"` has no `role="option"` children — invalid ARIA structure | `ModernHeader.tsx` |
| 17 | CartDrawer quantity not announced — bare `<span>{qty}</span>` between +/- buttons has no accessible label | `CartDrawer.tsx` |
| 18 | Image zoom mode has no modal semantics — CSS `transform: scale(1.8)` with no focus trap, no dialog role, no Escape announcement | `ImageCarousel.tsx` |
| 19 | GalleryStrip is not keyboard-scrollable — `overflowX: auto` with no `tabIndex`, hidden scrollbar removes the scrolling affordance | `GalleryStrip.tsx` |
| 20 | FollowAlongStrip infinite scroll ignores `prefers-reduced-motion` — CSS animation runs unconditionally | `FollowAlongStrip.tsx` |

### Form Accessibility

| # | Issue | File |
|---|-------|------|
| 21 | ContactForm missing `aria-invalid` on fields in error state | `ContactForm.tsx` |
| 22 | FormField doesn't inject `aria-describedby` — callers must manually wire it to the error message, which is error-prone | `FormField.tsx` |
| 23 | UnsubscribeForm has no `aria-live` region for state transitions (confirm -> loading -> success/error) | `UnsubscribeForm.tsx` |
| 24 | Country field is free-text defaulting to "US" — no dropdown, no validation | `CheckoutForm.tsx` |

### Touch Targets (below 48px minimum)

| # | Element | Actual Size | File |
|---|---------|-------------|------|
| 25 | Announcement dismiss button | ~22x24 px | `AnnouncementBanner.tsx` |
| 26 | Saved-items heart/copy buttons | 36x36 px | `shop/saved/page.tsx` |
| 27 | Header icon buttons (`.mh-icon-btn`) | 44x44 px | `ModernHeader.tsx` |
| 28 | Footer social icon links | 44x44 px | `ModernFooter.tsx` |

### Color Contrast

| # | Issue | Ratio | Threshold |
|---|-------|-------|-----------|
| 29 | Footer bottom-row links at `opacity: 0.6` on dark primary | ~3.2:1 | 4.5:1 AA |
| 30 | `warm-artisan` `--color-text-muted` on cream bg | ~3.5:1 | 4.5:1 AA |
| 31 | `soft-botanical` `--color-text-muted` on off-white | ~3.9:1 | 4.5:1 AA (borderline) |
| 32 | `.content-link` hardcodes `color: #ffffff` — invisible on light backgrounds | N/A | |
| 33 | Contact form inputs: `rgba(255,255,255,0.08)` bg, very low placeholder contrast | Low | |

### Performance UX

| # | Issue | File |
|---|-------|------|
| 34 | Google Fonts via `@import` in CSS — render-blocking extra round-trip; should be `<link>` in `<head>` | `globals.css` line 1 |
| 35 | Raw `<img>` without `loading="lazy"` on newsletter archive, saved items, Our Story, story mosaic | Multiple files |
| 36 | ModernStoryMosaic raw `<img>` has no size reservation — CLS risk | `ModernStoryMosaic.tsx` |
| 37 | Search has no loading indicator — first search silently fetches the catalog | `ModernHeader.tsx` |
| 38 | Error and loading states visually identical on shop page (both grey centered text) | `ProductGrid.tsx` |

---

## MINOR — Polish Opportunities

| # | Issue | File |
|---|-------|------|
| 39 | Accessibility panel preferences (large text, high contrast) not persisted in localStorage — reset on navigation | `ModernFAB.tsx` |
| 40 | `AnnouncementBanner` `role="region"` lacks accessible name | `AnnouncementBanner.tsx` |
| 41 | Social links have no "(opens in new tab)" indicator | `Footer.tsx`, `ModernFooter.tsx` |
| 42 | Success states on ContactForm and NewsletterSignup offer no "send another" path | `ContactForm.tsx`, `NewsletterSignup.tsx` |
| 43 | Newsletter page title duplicates site name: "Newsletter — Purple Acorns Creations — Purple Acorns Creations" | `newsletter/page.tsx` |
| 44 | HeroCarousel slide 1 uses intrinsic sizing, slides 2+ use `fill`+`contain` — visual inconsistency | `HeroCarousel.tsx` |
| 45 | `Button` component has no disabled visual style (no opacity change or cursor change) | `Button.tsx` |
| 46 | `String(err)` exposed to users on checkout failure (shows raw JS errors) | `CheckoutForm.tsx` |
| 47 | GalleryStrip `figcaption` + `alt` duplicate the same text — screen readers read it twice | `GalleryStrip.tsx` |
| 48 | Chat panel FAB overflows viewport on phones < 300px wide | `ModernFAB.tsx` |
| 49 | No print styles anywhere | `globals.css` |
| 50 | `h6` has no defined font-size — defaults to ~12px | `globals.css` |

---

## Recommended Fix Priority

### Phase 1 — Checkout & Revenue (issues 1-3, 24, 46)
These directly impact whether customers can complete purchases correctly. Add labels, validation, disable the pay button while shipping loads, and friendlize error messages.

### Phase 2 — Keyboard Navigation (issues 4-5, 13-15, 19)
Fix focus traps, add Escape handlers, implement arrow key patterns where ARIA roles demand them. This unlocks the site for keyboard-only and assistive technology users.

### Phase 3 — Contrast & Visual Accessibility (issues 7-8, 25-33)
Fix focus ring colors, announcement banner contrast, footer link opacity, and touch targets. These are measurable with automated tools and affect WCAG compliance.

### Phase 4 — Polish & Performance (issues 34-50)
Move font loading to `<head>`, add lazy loading, persist accessibility preferences, and clean up ARIA patterns.

---

## What Works Well

These areas deserve recognition as strong patterns to preserve:

- **CartDrawer:** Full focus trap, Escape to close, focus restoration, `aria-label` on all quantity buttons, backdrop click close, 48px touch targets throughout
- **ConfirmDialog:** Proper `role="dialog" aria-modal="true"`, focus trap, Escape key, focus restoration, safe default (Cancel focused)
- **ModernFAB:** Full focus traps on both panels, `inert` attribute on hidden panels, proper dialog ARIA, outside-click close
- **EventsTabs:** Correct `role="tablist"`/`role="tab"`/`role="tabpanel"` structure with `aria-selected` and `hidden` on inactive panels
- **NewsletterSignup:** `aria-invalid`, `aria-describedby`, `role="alert"`, `.sr-only` label — nearly perfect form accessibility
- **Typography:** 18px body size, 1.6 line-height, clear heading hierarchy with smooth mobile scaling via `clamp()`
- **Reduced motion:** Global CSS blanket suppression plus runtime checks in HeroCarousel and OurStoryPage
- **Skip-to-content link:** Correctly implemented with offscreen positioning and focus reveal (just needs the `#main-content` target on more pages)
- **Structured data:** Product, Organization, and BreadcrumbList JSON-LD schemas on relevant pages
- **Watermark system:** Consistent application across all product image surfaces with cache-busting via `updated_at`

---

> **REMINDER:** Delete this file once all fixes across all four phases are complete. This audit is a working document, not permanent documentation.
