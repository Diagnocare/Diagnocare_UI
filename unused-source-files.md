# Unused source files — decide per file

Re-verified 2026-11-06 against the current code, after the interface-to-models refactor (the same set of files is still unused). Generated from `Diagnocare_UI/Diagnocare-UI/src`. A file is listed when no other `.ts` file in the UI or the test project imports it by filename. Nothing has been deleted.

**How to use:** tick the box (`[x]`) for every file you want removed, then tell me. Models marked *duplicate* declare an interface whose name is also declared in another file that is the one actually used.

## 1. Services, components and config (5 files)

| Delete? | File | Lines | Modified | Suggestion | Notes |
|---|---|---|---|---|---|
| [ ] | `app/component/addressManager/contact-components.ts` | 10 | 2026-10-24 | Check | Array of components for the contact feature. Not imported. |
| [ ] | `app/constant/staff.config.ts` | 41 | 2026-10-24 | Check | STAFF_CONFIGS for doctor / collection-boy. Not imported. It also holds the StaffConfig interface, one of the three interfaces still outside models/ after the interface refactor (the others are the Window global and AppEnvironment); deleting this file removes that exception. |
| [ ] | `app/core/services/session-broadcast.service.ts` | 53 | 2026-10-24 | Check | Cross-tab session coordination via BroadcastChannel. Never injected. Delete unless you plan to use it for logout-on-other-tab. |
| [ ] | `app/services/pathologyServices/pathology-logo.service.ts` | 44 | 2026-10-24 | Check | Stores the logo as base64 in localStorage. Unused; the logo likely comes from the API now. |
| [ ] | `app/shared/required-asterisk.component.ts` | 23 | 2026-10-24 | Check | Small shared <required-asterisk> component. Not used in any template. |

## 2. Models and DTOs (35 files)

No file imports these. Deleting a model file cannot break a build unless something imports it, and the build will tell us immediately.

| Delete? | File | Lines | Modified | Exports | Notes |
|---|---|---|---|---|---|
| [ ] | `app/models/address/addressModel.ts` | 9 | 2026-10-24 | AddressModel |  |
| [ ] | `app/models/address/stateCityModel.ts` | 7 | 2026-10-24 | stateCityModel |  |
| [ ] | `app/models/auth/otp-cache.dto.ts` | 37 | 2026-10-31 | OtpRequest, OtpVerificationRequest, OtpResponse, OtpCacheEntry | *duplicate* of a type declared elsewhere |
| [ ] | `app/models/collectionBoys/collectionBoy-create.dto.ts` | 8 | 2026-10-24 | CollectionBoyCreateDto |  |
| [ ] | `app/models/collectionBoys/collectionBoy-edit.dto.ts` | 9 | 2026-10-24 | CollectionBoyEditDto |  |
| [ ] | `app/models/collectionBoys/collectionBoy-list.dto.ts` | 9 | 2026-10-24 | CollectionBoyListDto |  |
| [ ] | `app/models/collectionBoys/collectionBoyModel.ts` | 9 | 2026-10-24 | collectionBoyModel |  |
| [ ] | `app/models/doctor/doctor-create.dto.ts` | 9 | 2026-10-24 | DoctorCreateDto |  |
| [ ] | `app/models/doctor/doctor-edit.dto.ts` | 10 | 2026-10-24 | DoctorEditDto |  |
| [ ] | `app/models/doctor/doctor-list.dto.ts` | 10 | 2026-10-24 | DoctorListDto |  |
| [ ] | `app/models/doctor/doctorModel.ts` | 10 | 2026-10-24 | doctorModel |  |
| [ ] | `app/models/holiday/holiday-create.dto.ts` | 7 | 2026-10-24 | CreateHolidayDTO | *duplicate* of a type declared elsewhere |
| [ ] | `app/models/holiday/holiday-list.dto.ts` | 10 | 2026-10-24 | HolidayDTO | *duplicate* of a type declared elsewhere |
| [ ] | `app/models/holiday/holiday-update.dto.ts` | 8 | 2026-10-24 | UpdateHolidayDTO | *duplicate* of a type declared elsewhere |
| [ ] | `app/models/member/staff-capacity.dto.ts` | 21 | 2026-10-24 | StaffCapacityDto |  |
| [ ] | `app/models/path-test/group/group-create.dto.ts` | 7 | 2026-10-24 | GroupSubGroupCreateDto |  |
| [ ] | `app/models/path-test/group/group-list.dto.ts` | 8 | 2026-10-24 | GroupSubGroupListDto |  |
| [ ] | `app/models/path-test/group/group-update.dto.ts` | 8 | 2026-10-24 | GroupSubGroupUpdateDto |  |
| [ ] | `app/models/path-test/parameter/parameter-create.dto.ts` | 11 | 2026-10-24 | TestItemParameterCreateDto |  |
| [ ] | `app/models/path-test/parameter/parameter-list.dto.ts` | 12 | 2026-10-24 | TestItemParameterListDto |  |
| [ ] | `app/models/path-test/parameter/parameter-update.dto.ts` | 12 | 2026-10-24 | TestItemParameterUpdateDto |  |
| [ ] | `app/models/path-test/test/test-create.dto.ts` | 8 | 2026-10-24 | TestItemCreateDto |  |
| [ ] | `app/models/path-test/test/test-list.dto.ts` | 12 | 2026-10-24 | TestItemListDto |  |
| [ ] | `app/models/path-test/test/test-update.dto.ts` | 10 | 2026-10-24 | TestItemUpdateDto |  |
| [ ] | `app/models/pathology/pathology-extend-license.dto.ts` | 4 | 2026-10-24 | — |  |
| [ ] | `app/models/patient/booked-test-count.ts` | 10 | 2026-10-24 | — |  |
| [ ] | `app/models/patient/patientModel.ts` | 25 | 2026-10-24 | patientModel |  |
| [ ] | `app/models/patientTest/patientTest-list.dto.ts` | 19 | 2026-10-24 | PatientTestListDto |  |
| [ ] | `app/models/receipt/receipt-edit.dto.ts` | 13 | 2026-10-24 | ReceiptEditDto |  |
| [ ] | `app/models/receipt/receipt-list.dto.ts` | 13 | 2026-10-24 | ReceiptListDto |  |
| [ ] | `app/models/staff/staff-member.dto.ts` | 3 | 2026-10-24 | — |  |
| [ ] | `app/models/user/user-create.dto.ts` | 3 | 2026-10-24 | — |  |
| [ ] | `app/models/user/user-edit.dto.ts` | 3 | 2026-10-24 | — |  |
| [ ] | `app/models/user/user-list.dto.ts` | 3 | 2026-10-24 | — |  |
| [ ] | `app/models/user/userModel.ts` | 13 | 2026-10-24 | userModel |  |

## Removed 2026-11-06 (the four rows suggested "Delete")
- `app/okta.configure.ts`, `app/services/auth-service.ts`, `app/services/sessionSignalR/session-signalr.service.ts`, `app/services/receiptServices/receipt-pdf.service.ts`.
- `bill-receipt.spec.ts`: removed the `ReceiptPdfService` import, its mock and provider.
- `@auth0/auth0-spa-js` uninstalled from Diagnocare-UI and Diagnocare-Test (package.json, package-lock.json, and the path mapping in Diagnocare-Test/tsconfig.spec.json).
- Verified: app tsc clean, production build passes, Jest unchanged from the baseline (no new failures).

## Still to do by hand
- Retire or rotate the Auth0 clientId that was in `okta.configure.ts` if it is a real tenant; it has been in source control.
- "Check" rows above: all five have no references anywhere. `session-broadcast.service.ts` is redundant, because app.component.ts already does cross-tab logout with its own BroadcastChannel code.
