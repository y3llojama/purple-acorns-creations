import ContactForm from '@/components/layout/ContactForm'

export const metadata = { title: 'Contact Us' }

export default function ContactPage() {
  return (
    <section style={{ background: 'var(--color-primary)', color: 'var(--color-bg)', padding: '80px 24px', marginTop: 'calc(-1 * var(--logo-overflow, clamp(60px, 7vw, 90px)))' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-accent)', marginBottom: '8px', fontSize: '36px', textAlign: 'center' }}>
          Say Hello
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '18px', marginBottom: '48px', lineHeight: 1.6, textAlign: 'center' }}>
          Questions, custom orders, or just want to chat &mdash; we&apos;d love to hear from you.
        </p>
        <ContactForm />
      </div>
    </section>
  )
}
