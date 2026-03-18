const nextJest = require('next/jest')
const createJestConfig = nextJest({ dir: './' })
module.exports = createJestConfig({
  // setupFiles runs before the test framework — correct place for process.env injection
  setupFiles: ['<rootDir>/jest.setup.env.js'],
  // setupFilesAfterEnv runs after test framework loads — use for jest-dom matchers
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  // Ensure @/ path alias is resolvable by Jest's module resolver (needed for jest.mock())
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  // Exclude git worktrees — they have their own node_modules which causes duplicate React
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.worktrees/'],
})
