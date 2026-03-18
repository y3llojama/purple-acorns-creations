const nextJest = require('next/jest')
const createJestConfig = nextJest({ dir: './' })
module.exports = createJestConfig({
  // setupFiles runs before the test framework — correct place for process.env injection
  setupFiles: ['<rootDir>/jest.setup.env.js'],
  // setupFilesAfterEnv runs after test framework loads — use for jest-dom matchers
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
})
