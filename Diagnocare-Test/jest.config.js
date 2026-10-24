/** @type {import('jest').Config} */
module.exports = {
  displayName:    'Diagnocare UI Tests',
  preset:         'jest-preset-angular',
  testEnvironment:'jest-environment-jsdom',

  setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],

  // Pick up all spec files under src/
  testMatch: ['<rootDir>/src/**/*.spec.ts'],

  // Map bare 'src/...' imports → actual UI project source
  moduleNameMapper: {
    '^src/app/(.*)$':          '<rootDir>/../Diagnocare-UI/src/app/$1',
    '^src/environments/(.*)$': '<rootDir>/../Diagnocare-UI/src/environments/$1',
  },

  transform: {
    '^.+\\.(ts|mjs|js|html)$': [
      'jest-preset-angular',
      { tsconfig: '<rootDir>/tsconfig.spec.json', stringifyContentPathRegex: '\\.html$' },
    ],
  },

  // Resolve Angular, rxjs etc. from THIS project's node_modules first. The UI
  // source files live under ../Diagnocare-UI, and if that folder has its own
  // node_modules, a second copy of Angular gets loaded and every TestBed.inject()
  // fails with NG0203.
  moduleDirectories: [require('path').join(__dirname, 'node_modules'), 'node_modules'],

  transformIgnorePatterns: ['node_modules/(?!.*\\.mjs$)'],

  // Coverage — report on UI source, not on the spec files themselves
  collectCoverageFrom: [
    '../Diagnocare-UI/src/app/features/**/services/**/*.ts',
    '../Diagnocare-UI/src/app/core/services/**/*.ts',
    '../Diagnocare-UI/src/app/shared/services/common.service.ts',
    '../Diagnocare-UI/src/app/features/receipts/pages/bill-receipt/bill-receipt.ts',
    '../Diagnocare-UI/src/app/features/auth/pages/home/home.component.ts',
    '../Diagnocare-UI/src/app/features/pathology/pages/register-pathology/register-pathology.component.ts',
    '../Diagnocare-UI/src/app/features/lab/pages/lab-profile/lab-profile.component.ts',
    '!**/*.spec.ts',
    '!**/node_modules/**',
  ],
  coverageReporters: ['text', 'lcov', 'html'],
  coverageDirectory: '<rootDir>/coverage',

  // Silence verbose Angular compiler noise in test output
  globals: {
    'ts-jest': { tsconfig: '<rootDir>/tsconfig.spec.json' },
  },

  // Increase timeout for any async tests
  testTimeout: 10000,
};
