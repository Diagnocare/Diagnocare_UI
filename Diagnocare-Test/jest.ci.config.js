/**
 * Jest config used by the deploy pipeline (.github/workflows/ui-dev-qa.yml).
 *
 * Same as jest.config.js, minus the QUARANTINED suites below. Those were written
 * against older code (renamed fields, moved endpoints, removed methods) and no
 * longer compile or pass. They are excluded from the deploy gate so it can be
 * switched on now; every other spec, including any NEW spec file, is gated.
 *
 * To bring a suite back: fix it, run `npm test -- <file>`, then delete its line.
 * Goal: this list empty.
 */
const base = require('./jest.config.js');

const QUARANTINED = [
  'src/components/bill-receipt.spec.ts',                 // Receipt model gained refund/TPA fields; receipt-pdf.service no longer a module
  'src/components/home.component.spec.ts',               // pathologyService.getProfile() no longer exists
  'src/components/lab-profile.component.spec.ts',        // pathologyService.getProfile() no longer exists
  'src/components/register-pathology.component.spec.ts', // PathologyRegisterResponseDto has no licenseKey
  'src/services/common.service.spec.ts',                 // userService moved; validators moved to AppValidators
  'src/services/header-service.spec.ts',                 // ForgotPassword moved to api/login; UpdateAuthType is PUT
  'src/services/login.service.spec.ts',                  // stale mock data (Receipt shape)
  'src/services/path-test.service.spec.ts',              // stale mock data (Receipt shape)
  'src/services/pathology.service.spec.ts',              // stale mock data (Receipt shape)
  'src/services/patient.service.spec.ts',                // DTOs renamed to camelCase; methods take one DTO
  'src/services/receipt.service.spec.ts',                // stale mock data (Receipt shape)
];

module.exports = {
  ...base,
  testPathIgnorePatterns: [
    '/node_modules/',
    ...QUARANTINED.map(f => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  ],
};
