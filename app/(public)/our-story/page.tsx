// SECURITY: dangerouslySetInnerHTML is safe here.
// All content passes through sanitizeContent() or markdownToHtml() which use
// an allowlist-based sanitizer (sanitize-html) before rendering. No raw user
// input is ever injected directly.
import { getContentWithFormat } from '@/lib/content'
import { sanitizeContent, markdownToHtml } from '@/lib/sanitize'
import { getSettings } from '@/lib/theme'
import { interpolate, buildVars } from '@/lib/variables'

export const metadata = {
  title: 'Our Story',
  description: 'Meet the mother-daughter duo behind Purple Acornz Creations — handcrafted jewelry made with heart, creativity, and a love of artisan craft.',
}

export default async function OurStoryPage() {
  const [{ value, format }, settings] = await Promise.all([
    getContentWithFormat('story_full'),
    getSettings(),
  ])
  const vars = buildVars(settings.business_name)
  const interpolated = interpolate(value, vars)
  const html = format === 'markdown' ? await markdownToHtml(interpolated) : sanitizeContent(interpolated)

  return (
    <>
      <style>{`
        @keyframes ks-zoom {
          0%   { transform: scale(1.0) translate(0%, 0%); }
          50%  { transform: scale(1.06) translate(-1%, 0.5%); }
          100% { transform: scale(1.0) translate(0%, 0%); }
        }

        .os-hero {
          position: relative;
          width: 100%;
          height: clamp(120px, 14vw, 180px);
          overflow: hidden;
          background: #2a1845;
        }

        .os-hero-img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: contain;
          object-position: center center;
          animation: ks-zoom 14s ease-in-out infinite;
          will-change: transform;
        }

        .os-hero::after {
          content: '';
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(20,8,40,0.55) 100%),
            linear-gradient(to bottom, rgba(20,8,40,0.25) 0%, transparent 35%, transparent 65%, rgba(20,8,40,0.35) 100%);
          pointer-events: none;
        }

        .os-hero-caption {
          position: absolute;
          bottom: clamp(24px, 4vw, 48px);
          left: clamp(24px, 6vw, 80px);
          z-index: 2;
          color: rgba(255,255,255,0.75);
          font-family: 'Jost', sans-serif;
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }

        .os-split {
          display: grid;
          grid-template-columns: 1fr 1fr;
          min-height: 600px;
          align-items: stretch;
        }

        @media (max-width: 768px) {
          .os-split { grid-template-columns: 1fr; }
          .os-split-img-wrap { min-height: 360px; }
        }

        .os-split-img-wrap {
          position: relative;
          overflow: hidden;
        }

        .os-split-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center 20%;
          display: block;
          transition: transform 0.8s cubic-bezier(0.46, 0.01, 0.32, 1);
        }

        .os-split-img-wrap:hover .os-split-img {
          transform: scale(1.04);
        }

        .os-split-img-wrap::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(123,94,167,0.12) 0%, transparent 60%);
          pointer-events: none;
        }

        .os-split-text {
          padding: clamp(48px, 6vw, 80px) clamp(32px, 5vw, 72px);
          background: var(--color-surface);
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .os-split-label {
          font-family: 'Jost', sans-serif;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--color-primary);
          opacity: 0.7;
          margin-bottom: 20px;
        }

        .os-split-content {
          font-family: 'Jost', sans-serif;
          font-size: clamp(15px, 1.4vw, 17px);
          line-height: 1.9;
          color: var(--color-text);
        }

        .os-split-content h1,
        .os-split-content h2 {
          font-family: var(--font-display, Georgia, serif);
          font-size: clamp(22px, 2.8vw, 34px);
          color: var(--color-primary);
          line-height: 1.3;
          margin-bottom: 24px;
          font-weight: 400;
          font-style: italic;
        }

        .os-split-content p { margin: 0 0 16px; }
        .os-split-content p:last-child { margin-bottom: 0; }

@media (prefers-reduced-motion: reduce) {
          .os-hero-img { animation: none; }
          .os-split-img-wrap:hover .os-split-img { transform: none; }
        }
      `}</style>

      <div className="os-hero" style={{ marginTop: 'calc(-1 * var(--logo-overflow, clamp(60px, 7vw, 90px)))' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="os-hero-img"
          src="/craft/craft-crochet-wip.jpg"
          alt="Crochet pieces in progress — behind the craft"
        />
        <span className="os-hero-caption">Behind the craft</span>
      </div>

      <div className="os-split">
        <div className="os-split-img-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="os-split-img"
            src="/craft/craft-pansies-hand.jpg"
            alt="Handcrafted crochet pansy flowers held in hand"
          />
        </div>

        <div className="os-split-text">
          <div className="os-split-label">Our Story</div>
          <div className="os-split-content" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>

    </>
  )
}
