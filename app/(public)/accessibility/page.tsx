import { getSettings } from '@/lib/theme'

export const metadata = { title: 'Accessibility' }

export default async function AccessibilityPage() {
  const settings = await getSettings()
  const businessName = settings.business_name || 'Purple Acorns Creations'

  return (
    <article style={{ maxWidth: '760px', margin: '0 auto', padding: '80px 24px' }}>
      <style>{`
        .a11y-section { margin-bottom: 40px; }
        .a11y-section h2 {
          font-family: 'Jost', sans-serif;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--color-primary);
          margin: 0 0 12px;
        }
        .a11y-section p, .a11y-section li {
          font-family: 'Jost', sans-serif;
          font-size: 16px;
          line-height: 1.8;
          color: var(--color-text);
        }
        .a11y-section ul {
          margin: 8px 0 0 20px;
          padding: 0;
        }
        .a11y-section li { margin-bottom: 6px; }
        .a11y-demo-notice {
          background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface) 92%);
          border-left: 3px solid var(--color-primary);
          border-radius: 4px;
          padding: 16px 20px;
          margin-bottom: 48px;
          font-family: 'Jost', sans-serif;
          font-size: 14px;
          line-height: 1.6;
          color: var(--color-text);
        }
        .a11y-demo-notice strong { color: var(--color-primary); }
      `}</style>

      <h1 style={{
        fontFamily: 'var(--font-display)',
        fontSize: 'clamp(28px, 4vw, 42px)',
        color: 'var(--color-primary)',
        marginBottom: '16px',
        textAlign: 'center',
      }}>
        Accessibility
      </h1>
      <p style={{
        fontFamily: 'Jost, sans-serif',
        fontSize: '14px',
        color: 'var(--color-text-muted)',
        textAlign: 'center',
        marginBottom: '48px',
      }}>
        Last updated: March 2026
      </p>

      {/* Demo notice */}
      <div className="a11y-demo-notice">
        <strong>Demo site notice:</strong> This website is currently a work in progress. Some images, product listings, and content are placeholders and do not represent the final site. We are actively building out the full experience and appreciate your patience.
      </div>

      <div className="a11y-section">
        <h2>Our commitment</h2>
        <p>
          {businessName} is committed to ensuring that our website is accessible to everyone, including people with disabilities. We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.1, Level AA as a target standard, and we are continually working to improve the experience for all visitors.
        </p>
      </div>

      <div className="a11y-section">
        <h2>Conformance status</h2>
        <p>
          This site is <em>partially conformant</em> with WCAG 2.1 Level AA. We are actively working toward fuller compliance as the site is developed.
        </p>
      </div>

      <div className="a11y-section">
        <h2>Accessibility features</h2>
        <p>We have implemented the following features to improve accessibility:</p>
        <ul>
          <li>Skip-to-main-content link at the top of every page</li>
          <li>Minimum 48px touch targets on all interactive elements</li>
          <li>Descriptive <code>aria-label</code> attributes on buttons and icons</li>
          <li>Keyboard navigation support throughout the site</li>
          <li>Text size and high-contrast toggle via the accessibility button (bottom right)</li>
          <li>Animations respect the <code>prefers-reduced-motion</code> system setting</li>
          <li>Colour contrast ratios targeting WCAG AA on all text</li>
          <li>Semantic HTML landmarks (<code>header</code>, <code>main</code>, <code>nav</code>, <code>footer</code>)</li>
        </ul>
      </div>

      <div className="a11y-section">
        <h2>Known limitations</h2>
        <p>
          As this site is in active development, some areas may not yet meet full WCAG 2.1 AA requirements. Product images currently use placeholder content and may have incomplete alternative text. We are addressing these as the site is built out.
        </p>
      </div>

      <div className="a11y-section">
        <h2>Feedback & contact</h2>
        <p>
          If you experience any difficulty accessing content on this site, or have suggestions for improvement, please get in touch via our <a href="/contact" style={{ color: 'var(--color-primary)' }}>contact page</a>. We aim to respond within 3 business days.
        </p>
      </div>

      <div className="a11y-section">
        <h2>Technical approach</h2>
        <p>
          This site is built with Next.js and uses semantic HTML5, CSS custom properties for theming, and progressive enhancement. No accessibility overlay or third-party widget is used — accessibility is built into the markup directly.
        </p>
      </div>
    </article>
  )
}
