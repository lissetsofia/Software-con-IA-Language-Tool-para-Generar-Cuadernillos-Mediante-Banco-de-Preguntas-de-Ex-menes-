module.exports = {
  testEnvironment: 'jsdom',
  rootDir: '.',
  setupFilesAfterEnv: ['<rootDir>/__tests__/helpers/setupFrontendTests.js'],
  testMatch: ['<rootDir>/__tests__/**/*.test.js'],
  collectCoverage: true,
  collectCoverageFrom: [
    '<rootDir>/**/*.js',
    '!<rootDir>/__tests__/**',
    '!<rootDir>/libs/**',
    '!<rootDir>/coverage/**',
    '!<rootDir>/../coverage/**'
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/coverage/',
    '/lcov-report/'
  ],
  coverageDirectory: '<rootDir>/../coverage/frontend',
  coverageReporters: ['text', 'lcov', 'cobertura'],
  testTimeout: 20000,
  maxWorkers: 1,
  verbose: false
};
