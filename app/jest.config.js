/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo/android',
  setupFiles: ['@shopify/flash-list/jestSetup'],
  // jest-expo's list plus @shopify/flash-list, which ships ES modules.
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|@shopify/flash-list))',
    '/node_modules/react-native-reanimated/plugin/',
    '/node_modules/@react-native/babel-preset/',
  ],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/index.ts'],
  coverageThreshold: {
    global: { statements: 70, branches: 60, functions: 70, lines: 70 },
    './src/domain/': { statements: 90, branches: 90, functions: 90, lines: 90 },
  },
};
