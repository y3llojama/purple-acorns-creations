const MAX_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

function validateFile(file: { type: string; size: number }): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) return 'Only JPEG, PNG, WebP, and GIF images are allowed.'
  if (file.size > MAX_SIZE) return 'Image must be under 5MB.'
  return null
}

describe('Image upload validation', () => {
  it('rejects non-image files', () => {
    expect(validateFile({ type: 'application/pdf', size: 100 })).not.toBeNull()
  })
  it('rejects oversized files', () => {
    expect(validateFile({ type: 'image/jpeg', size: 6 * 1024 * 1024 })).not.toBeNull()
  })
  it('accepts valid small image', () => {
    expect(validateFile({ type: 'image/jpeg', size: 1 * 1024 * 1024 })).toBeNull()
  })
})
