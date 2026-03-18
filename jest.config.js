const nextJest = require('next/jest')
const createJestConfig = nextJest({ dir: './' })
module.exports = createJestConfig({
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  testEnvironmentOptions: {
    env: { ADMIN_EMAILS: 'purpleacornzcreations@gmail.com,write2spica@gmail.com' },
  },
})
