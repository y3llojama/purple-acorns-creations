// Environment variables injected before each test suite.
// Use placeholders here — real values come from .env.local or Vercel env vars.

// jsdom does not include TextEncoder/TextDecoder; Next.js server modules require them
const { TextEncoder, TextDecoder } = require('util')
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder
process.env.ADMIN_EMAILS = 'admin@example.com,owner@example.com'
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
process.env.OAUTH_ENCRYPTION_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' // 32-byte base64 key for tests
process.env.CRON_SECRET = 'test-cron-secret'
process.env.SQUARE_APPLICATION_ID = 'sandbox-sq0idb-test'
process.env.SQUARE_APPLICATION_SECRET = 'sandbox-sq0csb-test'
process.env.SQUARE_ENVIRONMENT = 'sandbox'
process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = 'test-webhook-key'
process.env.PINTEREST_APP_ID = 'test-pinterest-app-id'
process.env.PINTEREST_APP_SECRET = 'test-pinterest-app-secret'
process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID = 'sandbox-sq0idb-test'
process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID = 'test-location-id'
