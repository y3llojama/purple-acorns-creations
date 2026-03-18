import { getSettings } from '@/lib/theme'
import { sanitizeText } from '@/lib/sanitize'
import ContactForm from '@/components/layout/ContactForm'

export const metadata = { title: 'Contact Us' }

export default async function ContactPage() {
  const settings = await getSettings()
  const contactEmail = settings.contact_email ? sanitizeText(settings.contact_email) : null

  return (
    <section style={{ background: 'var(--color-primary)', color: 'var(--color-bg)', padding: '80px 24px' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-accent)', marginBottom: '8px', fontSize: '36px', textAlign: 'center' }}>
          Say Hello
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '18px', marginBottom: '48px', lineHeight: 1.6, textAlign: 'center' }}>
          Questions, custom orders, or just want to chat &mdash; we&apos;d love to hear from you.
        </p>
        <ContactForm />
        {contactEmail && (
          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: '15px', marginTop: '32px', lineHeight: 1.6 }}>
            You can also email us directly at{' '}
            <a
              href={`mailto:${contactEmail}`}
              style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}
            >
              {contactEmail}
            </a>
          </p>
        )}
      </div>
    </section>
  )
}
