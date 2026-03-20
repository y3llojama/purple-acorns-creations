'use client'
import { useState } from 'react'
import type { Newsletter } from '@/lib/supabase/types'
import BriefStep from './BriefStep'
import DraftStep from './DraftStep'
import EditStep from './EditStep'
import PreviewStep from './PreviewStep'
import SendStep from './SendStep'

interface GalleryItem { id: string; url: string; alt_text: string }
interface UpcomingEvent { name: string; date: string; location: string }

interface Props {
  newsletter: Newsletter
  galleryItems: GalleryItem[]
  upcomingEvents: UpcomingEvent[]
  defaultSendTime: string
  hasAi: boolean
  hasResend: boolean
}

const STEPS = ['Brief', 'Draft', 'Edit & Photos', 'Preview', 'Send']

export default function NewsletterComposer({ newsletter: initial, galleryItems, upcomingEvents, defaultSendTime, hasAi, hasResend }: Props) {
  const [step, setStep] = useState(0)
  const [newsletter, setNewsletter] = useState<Newsletter>(initial)

  function onNext() { setStep((s) => Math.min(s + 1, STEPS.length - 1)) }
  function onBack() { setStep((s) => Math.max(s - 1, 0)) }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '32px 24px' }}>
      {/* Step indicator */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '40px', gap: 0 }}>
        {STEPS.map((label, i) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%',
                background: i === step ? 'var(--color-primary)' : i < step ? 'var(--color-accent)' : 'var(--color-border)',
                color: i <= step ? 'var(--color-bg)' : 'var(--color-text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', fontWeight: 600,
              }}>
                {i + 1}
              </div>
              <span style={{ fontSize: '11px', color: i === step ? 'var(--color-primary)' : 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ flex: 1, height: '2px', background: i < step ? 'var(--color-accent)' : 'var(--color-border)', margin: '0 8px', marginBottom: '18px' }} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      {step === 0 && (
        <BriefStep
          newsletter={newsletter}
          upcomingEvents={upcomingEvents}
          hasAi={hasAi}
          onDraftGenerated={(updated) => setNewsletter(updated)}
          onNext={onNext}
        />
      )}
      {step === 1 && (
        <DraftStep
          newsletter={newsletter}
          onRegenerated={(updated) => setNewsletter(updated)}
          onNext={onNext}
          onBack={onBack}
        />
      )}
      {step === 2 && (
        <EditStep
          newsletter={newsletter}
          galleryItems={galleryItems}
          onChange={(updated) => setNewsletter(updated)}
          onNext={onNext}
          onBack={onBack}
        />
      )}
      {step === 3 && (
        <PreviewStep
          newsletter={newsletter}
          onNext={onNext}
          onBack={onBack}
        />
      )}
      {step === 4 && (
        <SendStep
          newsletter={newsletter}
          defaultSendTime={defaultSendTime}
          hasResend={hasResend}
          onChange={(updated) => setNewsletter(updated)}
          onBack={onBack}
        />
      )}
    </div>
  )
}
