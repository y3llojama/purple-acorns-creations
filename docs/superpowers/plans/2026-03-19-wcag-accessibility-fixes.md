# WCAG Accessibility Fixes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all identified WCAG 2.1 AA violations in ModernFAB (chat panel, a11y panel, form inputs, emojis, touch targets) and site-wide (FormField error element, ContactForm, NewsletterSignup, shop page nested landmark).

**Architecture:** Fix-in-place — targeted edits across 5 files, no new abstractions. Focus trap pattern mirrors the existing `ConfirmDialog.tsx` (store trigger ref → trap Tab → restore on close). The `getFocusable` DOM utility is defined at module scope (outside the component) to avoid react-hooks/exhaustive-deps lint errors. All changes are isolated to individual files with no cross-file dependencies.

**Tech Stack:** Next.js 15 App Router, TypeScript, React 18.

**Spec:** `docs/superpowers/specs/2026-03-19-wcag-accessibility-fixes-design.md`

---

## File Map

| File | What Changes |
|------|-------------|
| `components/modern/ModernFAB.tsx` | Focus traps on chat + a11y panels, sr-only labels on compose form, `role="alert"` on error, emoji `aria-hidden`, 48px close button, `aria-controls`, `tabIndex` on scroll-to-top |
| `components/ui/FormField.tsx` | Remove `aria-live="polite"` from error `<p>` (conflicts with `role="alert"`) |
| `components/layout/ContactForm.tsx` | Add `id` to form error `<p>`; add `aria-invalid` + `aria-describedby` to inputs when error state |
| `components/home/NewsletterSignup.tsx` | Add `id="newsletter-email-error"` to error `<p>`; add `aria-invalid` + `aria-describedby` to email input |
| `app/(public)/shop/page.tsx` | Replace `<main>` with `<div>` (duplicate landmark — `ModernLayout` already owns `<main id="main-content">`) |

---

## Task 1: Fix FormField, ContactForm, NewsletterSignup, and shop page

These four files have small, independent changes with no focus-trap logic. Do them together in one commit.

**Files:**
- Modify: `components/ui/FormField.tsx:12`
- Modify: `components/layout/ContactForm.tsx:56,60,65,67`
- Modify: `components/home/NewsletterSignup.tsx:54-62,70`
- Modify: `app/(public)/shop/page.tsx:11,27`

- [ ] **Step 1: Fix FormField — remove redundant `aria-live`**

`role="alert"` already implies `aria-live="assertive"`. The `aria-live="polite"` on the same element creates conflicting behaviour in some screen readers.

In `components/ui/FormField.tsx`, line 12, change:
```tsx
<p id={`${id}-error`} role="alert" aria-live="polite" style={{ color: '#c05050', marginTop: '4px', fontSize: '16px' }}>
```
To:
```tsx
<p id={`${id}-error`} role="alert" style={{ color: '#c05050', marginTop: '4px', fontSize: '16px' }}>
```

- [ ] **Step 2: Fix ContactForm — add `aria-invalid` and wire error to inputs**

The form has a single submission-level `error` string. Add `aria-invalid` and `aria-describedby` to each input so screen readers can programmatically identify the error state. Add `id="contact-form-error"` to the error paragraph so the `aria-describedby` reference resolves.

In `components/layout/ContactForm.tsx`:

Line 56 (name input) — add two props:
```tsx
<input id="contact-name" name="name" required maxLength={100} placeholder="Your name" style={fieldStyle}
  aria-invalid={!!error || undefined}
  aria-describedby={error ? 'contact-form-error' : undefined} />
```

Line 60 (email input) — add two props:
```tsx
<input id="contact-email" name="email" type="email" required maxLength={254} placeholder="you@example.com" style={fieldStyle}
  aria-invalid={!!error || undefined}
  aria-describedby={error ? 'contact-form-error' : undefined} />
```

Line 65 (textarea) — add two props:
```tsx
<textarea id="contact-message" name="message" required maxLength={2000} rows={4} placeholder="Tell us what's on your mind…"
  style={{ ...fieldStyle, resize: 'vertical', fontFamily: 'inherit' }}
  aria-invalid={!!error || undefined}
  aria-describedby={error ? 'contact-form-error' : undefined} />
```

Line 67 (error paragraph) — add `id` and remove redundant `aria-live`:
```tsx
{error && <p id="contact-form-error" role="alert" style={{ color: '#ffb3b3', marginBottom: '16px', fontSize: '15px' }}>{error}</p>}
```

- [ ] **Step 3: Fix NewsletterSignup — wire error to email input**

The `<input>` at lines 54-62 already has `id="newsletter-email"` and a `<label>`. Add `aria-invalid` + `aria-describedby`, and add `id` to the error paragraph.

Replace the `<input>` element (lines 54-62) with:
```tsx
<input
  id="newsletter-email"
  type="email"
  value={email}
  onChange={e => setEmail(e.target.value)}
  placeholder="your@email.com"
  required
  maxLength={254}
  aria-invalid={status === 'error' || undefined}
  aria-describedby={status === 'error' ? 'newsletter-email-error' : undefined}
  style={{ padding: '12px 16px', fontSize: '18px', borderRadius: '4px', border: '1px solid var(--color-border)', flex: '1', minWidth: '200px' }}
/>
```

Change the error `<p>` at line 70 — add `id` and remove redundant `aria-live`:
```tsx
<p id="newsletter-email-error" role="alert" style={{ color: '#c05050', marginTop: '8px', fontSize: '16px' }}>{message}</p>
```

- [ ] **Step 4: Fix shop page — remove nested `<main>`**

`ModernLayout` already renders `<main id="main-content">`. The `<main>` inside `shop/page.tsx` creates an invalid nested landmark.

In `app/(public)/shop/page.tsx`, change line 11 from:
```tsx
<main style={{ maxWidth: '1200px', margin: '0 auto', padding: '60px 24px' }}>
```
To:
```tsx
<div style={{ maxWidth: '1200px', margin: '0 auto', padding: '60px 24px' }}>
```
And change the closing `</main>` (line 27) to `</div>`.

- [ ] **Step 5: Run tests**

```bash
cd /Users/gautamzalpuri/Dev/experiments/code/purple-acorns-creations && bash scripts/test.sh
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/gautamzalpuri/Dev/experiments/code/purple-acorns-creations
git add components/ui/FormField.tsx components/layout/ContactForm.tsx components/home/NewsletterSignup.tsx "app/(public)/shop/page.tsx"
git commit -m "fix(a11y): wire form error announcements and remove nested main landmark"
```

---

## Task 2: ModernFAB — simple fixes (emojis, labels, error role, touch target, scroll tabIndex, aria-controls)

These are attribute and CSS-only changes — no focus trap logic. Do them all in one pass, then commit.

**Files:**
- Modify: `components/modern/ModernFAB.tsx`

- [ ] **Step 1: Wrap decorative emojis with `aria-hidden`**

Screen readers announce raw emoji characters verbosely. Wrap each in `<span aria-hidden="true">`.

Line 271 (chat header h2):
```tsx
<h2><span aria-hidden="true">👋</span> Chat with us</h2>
```

Lines 279-284 (quick links):
```tsx
<a href="/contact" className="mfab-quick-btn"><span aria-hidden="true">✉️</span> Send us a message</a>
<a href="/our-story" className="mfab-quick-btn"><span aria-hidden="true">✨</span> Our story</a>
<a href="/shop" className="mfab-quick-btn"><span aria-hidden="true">🛍</span> Browse the shop</a>
<button className="mfab-quick-btn" onClick={() => setChatStep('compose')} style={{ fontWeight: 600, borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}>
  <span aria-hidden="true">💬</span> Write us a message
</button>
```

Line 299 (sent confirmation):
```tsx
<span style={{ fontSize: '36px' }} aria-hidden="true">🎉</span>
```

- [ ] **Step 2: Add sr-only labels to chat compose form inputs and `role="alert"` to error**

In the `chatStep === 'compose'` block (around line 288), add `<label>` elements using `.sr-only` and add `id` attributes to inputs. Also add `role="alert"` to the error paragraph. Replace the entire `<form>` block with:

```tsx
<form onSubmit={handleSend} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
  <label htmlFor="mfab-name" className="sr-only">Your name</label>
  <input ref={firstInputRef} id="mfab-name" className="mfab-input" type="text" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} required maxLength={100} />
  <label htmlFor="mfab-email" className="sr-only">Email address</label>
  <input id="mfab-email" className="mfab-input" type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} required />
  <label htmlFor="mfab-message" className="sr-only">Message</label>
  <textarea id="mfab-message" className="mfab-input mfab-textarea" placeholder="Write your message…" value={message} onChange={e => setMessage(e.target.value)} required maxLength={2000} />
  {error && <p className="mfab-error" role="alert">{error}</p>}
  <button className="mfab-send-btn" type="submit" disabled={sending}>{sending ? 'Sending…' : 'Send message'}</button>
  <button type="button" className="mfab-back-btn" onClick={() => { setChatStep('quick'); setError('') }}>← Back</button>
</form>
```

- [ ] **Step 3: Fix scroll-to-top `tabIndex`**

`opacity: 0; pointer-events: none` does not remove an element from the tab order. Add `tabIndex` to the scroll-to-top button (line 339):

```tsx
<button aria-label="Back to top" onClick={scrollToTop} tabIndex={scrollVisible ? 0 : -1} style={fabStyle}>
```

- [ ] **Step 4: Fix chat close button touch target**

In the `<style>` block (lines 152-161), change `.mfab-chat-close` from 28×28px to 48×48px:

```css
.mfab-chat-close {
  position: absolute;
  top: 4px; right: 4px;
  background: rgba(255,255,255,0.2);
  border: none; color: #fff;
  width: 48px; height: 48px;
  border-radius: 50%; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; line-height: 1;
}
```

- [ ] **Step 5: Add IDs and `aria-controls` to both FAB dialogs and triggers**

Chat panel div (line 269) — add `id`:
```tsx
<div id="mfab-chat-dialog" className={`mfab-chat-panel${chatOpen ? ' open' : ''}`} role="dialog" aria-label="Chat with us" aria-modal="true">
```

Chat toggle button (line 317) — add `aria-controls`:
```tsx
<button
  aria-label={chatOpen ? 'Close chat' : 'Chat with us'}
  aria-expanded={chatOpen}
  aria-controls="mfab-chat-dialog"
  onClick={chatOpen ? closeChat : openChat}
  style={fabStyle}
>
```

A11y panel div (around line 347) — add `id` and `aria-modal`:
```tsx
<div
  className="mfab-a11y-panel"
  id="mfab-a11y-dialog"
  role="dialog"
  aria-label="Accessibility options"
  aria-modal="true"
>
```

Aa trigger button (around line 359) — add `aria-controls`:
```tsx
<button
  aria-label="Accessibility options"
  aria-expanded={a11yOpen}
  aria-controls="mfab-a11y-dialog"
  onClick={() => setA11yOpen(o => !o)}
  style={{ ...fabStyle, fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: '15px', letterSpacing: '-0.5px' }}
>
```

- [ ] **Step 6: Commit**

```bash
cd /Users/gautamzalpuri/Dev/experiments/code/purple-acorns-creations
git add components/modern/ModernFAB.tsx
git commit -m "fix(a11y): ModernFAB emoji aria-hidden, sr-only labels, error role, touch target, scroll tabIndex, aria-controls"
```

---

## Task 3: ModernFAB — focus trap on chat panel

The chat panel has `role="dialog"` + `aria-modal="true"` but no focus trap. Keyboard users can Tab out of it. This task adds full focus management.

**Read first:** `components/admin/ConfirmDialog.tsx` — reference for the focus trap pattern used in this project.

**Key decisions (informed by code review):**
- `getFocusable` is defined at **module scope** (outside the component) — it takes no React state, so placing it inside would trigger `react-hooks/exhaustive-deps` lint errors.
- The existing Escape handler at lines 40-45 and the existing compose-step focus effect at lines 36-38 **must be deleted** — the new effects replace both.
- `chatStep` is **not** in the keydown effect's dependency array — `getFocusable` reads live DOM at event time so step-transitions are handled automatically without re-registering the listener.
- Focus is restored directly to `chatTriggerRef` on close (not via a `previousFocusRef`) since the chat FAB is always the trigger.

**Files:**
- Modify: `components/modern/ModernFAB.tsx`

- [ ] **Step 1: Add `getFocusable` at module scope**

At the very top of `ModernFAB.tsx`, after the imports and before `export default function ModernFAB()`, add:

```tsx
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function getFocusable(container: HTMLElement | null): HTMLElement[] {
  if (!container) return []
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
}
```

- [ ] **Step 2: Add chat focus refs**

In the refs block (around line 33-34), add alongside the existing refs:
```tsx
const chatTriggerRef = useRef<HTMLButtonElement>(null)
const chatPanelRef = useRef<HTMLDivElement>(null)
```

- [ ] **Step 3: Delete the two existing effects that the new ones replace**

**Delete** the `useEffect` at lines 36-38 (focuses `firstInputRef` on compose step open):
```tsx
// DELETE THIS ENTIRE BLOCK:
useEffect(() => {
  if (chatOpen && chatStep === 'compose') firstInputRef.current?.focus()
}, [chatOpen, chatStep])
```

**Delete** the `useEffect` at lines 40-45 (Escape handler):
```tsx
// DELETE THIS ENTIRE BLOCK:
useEffect(() => {
  if (!chatOpen) return
  function onKey(e: KeyboardEvent) { if (e.key === 'Escape') closeChat() }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}, [chatOpen])
```

- [ ] **Step 4: Add focus-management effect for chat open/close**

In place of the two deleted effects, add:

```tsx
// Focus management: move focus in on open, restore on close
useEffect(() => {
  if (chatOpen) {
    const focusable = getFocusable(chatPanelRef.current)
    focusable[0]?.focus()
  } else {
    chatTriggerRef.current?.focus()
  }
}, [chatOpen])
```

- [ ] **Step 5: Add Tab-trap + Escape keydown effect**

Add immediately after the effect from Step 4:

```tsx
// Keyboard trap: Tab cycles within panel, Escape closes
useEffect(() => {
  if (!chatOpen) return
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      closeChat()
      return
    }
    if (e.key === 'Tab') {
      const focusable = getFocusable(chatPanelRef.current)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}, [chatOpen]) // no chatStep — getFocusable reads live DOM at event time
```

- [ ] **Step 6: Attach refs to DOM elements**

Attach `chatPanelRef` to the chat panel div (updated in Task 2):
```tsx
<div ref={chatPanelRef} id="mfab-chat-dialog" className={`mfab-chat-panel${chatOpen ? ' open' : ''}`} role="dialog" aria-label="Chat with us" aria-modal="true">
```

Attach `chatTriggerRef` to the non-contact-page chat button (around line 317, line numbers approximate after Task 2 edits):
```tsx
<button
  ref={chatTriggerRef}
  aria-label={chatOpen ? 'Close chat' : 'Chat with us'}
  aria-expanded={chatOpen}
  aria-controls="mfab-chat-dialog"
  onClick={chatOpen ? closeChat : openChat}
  style={fabStyle}
>
```

- [ ] **Step 7: Verify focus behavior manually**

Start the dev server (`bash scripts/dev.sh`). On any public page:
1. Tab to the chat FAB (bottom left) — press Enter to open
2. Verify focus moves into the panel (first element should receive focus)
3. Tab through all interactive elements — verify Tab wraps back to the first from the last
4. Shift+Tab from the first element — verify it wraps to the last
5. Press Escape — verify panel closes and focus returns to the chat FAB

- [ ] **Step 8: Commit**

```bash
cd /Users/gautamzalpuri/Dev/experiments/code/purple-acorns-creations
git add components/modern/ModernFAB.tsx
git commit -m "fix(a11y): add keyboard focus trap to ModernFAB chat panel"
```

---

## Task 4: ModernFAB — focus trap on accessibility panel

The a11y panel mirrors the chat panel fix. Now that `getFocusable` is already at module scope (Task 3), this task is just refs + two effects.

**Files:**
- Modify: `components/modern/ModernFAB.tsx`

- [ ] **Step 1: Add a11y focus refs**

Add alongside the chat refs from Task 3:
```tsx
const a11yTriggerRef = useRef<HTMLButtonElement>(null)
const a11yPanelRef = useRef<HTMLDivElement>(null)
```

- [ ] **Step 2: Add focus-management effect for a11y open/close**

```tsx
useEffect(() => {
  if (a11yOpen) {
    const firstCheckbox = a11yPanelRef.current?.querySelector<HTMLElement>('input[type="checkbox"]')
    firstCheckbox?.focus()
  } else {
    a11yTriggerRef.current?.focus()
  }
}, [a11yOpen])
```

- [ ] **Step 3: Add Tab-trap + Escape keydown effect**

```tsx
useEffect(() => {
  if (!a11yOpen) return
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      setA11yOpen(false)
      return
    }
    if (e.key === 'Tab') {
      const focusable = getFocusable(a11yPanelRef.current)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}, [a11yOpen])
```

- [ ] **Step 4: Attach refs to DOM elements**

Attach `a11yPanelRef` to the a11y panel div (updated in Task 2):
```tsx
<div
  ref={a11yPanelRef}
  className="mfab-a11y-panel"
  id="mfab-a11y-dialog"
  role="dialog"
  aria-label="Accessibility options"
  aria-modal="true"
>
```

Attach `a11yTriggerRef` to the Aa button (line numbers approximate after prior tasks):
```tsx
<button
  ref={a11yTriggerRef}
  aria-label="Accessibility options"
  aria-expanded={a11yOpen}
  aria-controls="mfab-a11y-dialog"
  onClick={() => setA11yOpen(o => !o)}
  style={{ ...fabStyle, fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: '15px', letterSpacing: '-0.5px' }}
>
```

- [ ] **Step 5: Verify focus behavior manually**

1. Tab to the Aa FAB (bottom right) — press Enter to open
2. Verify focus moves to the "Larger text" checkbox
3. Tab through both checkboxes and Close button — verify Tab wraps to first checkbox from Close
4. Shift+Tab from first checkbox — verify it wraps to Close button
5. Press Escape — verify panel closes and focus returns to the Aa button
6. Click Aa to reopen, then click Close button — verify focus returns to Aa button

- [ ] **Step 6: Run tests**

```bash
cd /Users/gautamzalpuri/Dev/experiments/code/purple-acorns-creations && bash scripts/test.sh
```
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/gautamzalpuri/Dev/experiments/code/purple-acorns-creations
git add components/modern/ModernFAB.tsx
git commit -m "fix(a11y): add keyboard focus trap and aria-modal to ModernFAB a11y panel"
```

---

## Final Verification Checklist

After all tasks are committed, verify every success criterion:

- [ ] Tab key cannot escape chat panel or a11y panel while open
- [ ] Escape key closes both chat panel and a11y panel
- [ ] Focus returns to trigger button when each panel closes
- [ ] Scroll-to-top button is not reachable by keyboard when hidden (`tabIndex={-1}`)
- [ ] Chat compose inputs have associated labels (inspect with browser devtools accessibility tab)
- [ ] Chat form error is announced immediately when it appears (`role="alert"`)
- [ ] Emojis in chat panel are skipped by screen readers (`aria-hidden="true"` on each span)
- [ ] Chat close button is 48×48px (inspect element)
- [ ] `shop/page.tsx` DOM has a single `<main>` (from ModernLayout), `<div>` inside
- [ ] ContactForm inputs have `aria-invalid` and `aria-describedby` when form error is set
- [ ] NewsletterSignup email input has `aria-invalid` + `aria-describedby` when `status === 'error'`
- [ ] FormField error `<p>` has `role="alert"` only — no `aria-live` attribute
