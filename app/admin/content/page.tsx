import { getAllContent } from '@/lib/content'
import ContentEditor from '@/components/admin/ContentEditor'
import SiteMap from '@/components/admin/SiteMap'

export const metadata = { title: 'Admin — Content' }

const HERO_FIELDS = [
  { key: 'hero_tagline', label: 'Hero Tagline', rows: 2 },
  { key: 'hero_subtext', label: 'Hero Subtext', rows: 3 },
] as const

const STORY_TEASER_FIELDS = [
  { key: 'story_teaser', label: 'Story Teaser', rows: 4 },
] as const

const FULL_STORY_FIELDS = [
  { key: 'story_full', label: 'Full Story (HTML)', rows: 12 },
] as const

const LEGAL_FIELDS = [
  { key: 'privacy_policy',   label: 'Privacy Policy (HTML)',   rows: 20 },
  { key: 'terms_of_service', label: 'Terms of Service (HTML)', rows: 20 },
] as const

export default async function ContentAdminPage() {
  const content = await getAllContent()
  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', color: 'var(--color-primary)', marginBottom: '32px' }}>Content</h1>

      <SiteMap highlight="hero" label="Hero Section" description="The large opening section every visitor sees first on the homepage." />
      {HERO_FIELDS.map(({ key, label, rows }) => (
        <ContentEditor key={key} contentKey={key} label={label} initialValue={content[key] ?? ''} rows={rows} />
      ))}

      <SiteMap highlight="story" label="Story Teaser" description="Short excerpt on the homepage that links to your full story." />
      {STORY_TEASER_FIELDS.map(({ key, label, rows }) => (
        <ContentEditor key={key} contentKey={key} label={label} initialValue={content[key] ?? ''} rows={rows} />
      ))}

      <SiteMap highlight="our-story" label="Our Story Page" description="The full story shown on the /our-story page, not the homepage." />
      {FULL_STORY_FIELDS.map(({ key, label, rows }) => (
        <ContentEditor key={key} contentKey={key} label={label} initialValue={content[key] ?? ''} rows={rows} />
      ))}

      {LEGAL_FIELDS.map(({ key, label, rows }) => (
        <ContentEditor key={key} contentKey={key} label={label} initialValue={content[key] ?? ''} rows={rows} />
      ))}
    </div>
  )
}
