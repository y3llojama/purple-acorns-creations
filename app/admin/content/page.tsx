import { getAllContent } from '@/lib/content'
import ContentEditor from '@/components/admin/ContentEditor'

export const metadata = { title: 'Admin — Content' }

const FIELDS = [
  { key: 'hero_tagline', label: 'Hero Tagline', rows: 2 },
  { key: 'hero_subtext', label: 'Hero Subtext', rows: 3 },
  { key: 'story_teaser', label: 'Story Teaser', rows: 4 },
  { key: 'story_full', label: 'Full Story (HTML)', rows: 12 },
  { key: 'privacy_policy', label: 'Privacy Policy (HTML)', rows: 20 },
  { key: 'terms_of_service', label: 'Terms of Service (HTML)', rows: 20 },
] as const

export default async function ContentAdminPage() {
  const content = await getAllContent()
  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', color: 'var(--color-primary)', marginBottom: '32px' }}>Content</h1>
      {FIELDS.map(({ key, label, rows }) => (
        <ContentEditor key={key} contentKey={key} label={label} initialValue={content[key] ?? ''} rows={rows} />
      ))}
    </div>
  )
}
