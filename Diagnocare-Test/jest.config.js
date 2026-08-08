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
    '^src/app/(.*)$':          '<rootDir>/../Diagnocare_UI/src/app/$1',
    '^src/environments/(.*)$': '<rootDir>/../Diagnocare_UI/src/environments/$1',
  },

  transform: {
    '^.+\\.(ts|mjs|js|html)$': [
      'jest-preset-angular',
      { tsconfig: '<rootDir>/tsconfig.spec.json', stringifyContentPathRegex: '\\.html$' },
    ],
  },

  transformIgnorePatterns: ['node_modules/(?!.*\\.mjs$)'],

  // Coverage — report on UI source, not on the spec files themselves
  collectCoverageFrom: [
    '../Diagnocare_UI/src/app/services/**/*.ts',
    '../Diagnocare_UI/src/app/shared/common.service.ts',
    '../Diagnocare_UI/src/app/component/receipt/bill-receipt.ts',
    '../Diagnocare_UI/src/app/component/login/home.component.ts',
    '../Diagnocare_UI/src/app/component/pathology/register-pathology/register-pathology.component.ts',
    '../Diagnocare_UI/src/app/component/lab-profile/lab-profile.component.ts',
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
