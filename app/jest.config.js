/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo/android',
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/index.ts'],
  coverageThreshold: {
    global: { statements: 70, branches: 60, functions: 70, lines: 70 },
    './src/domain/': { statements: 90, branches: 90, functions: 90, lines: 90 },
  },
};
