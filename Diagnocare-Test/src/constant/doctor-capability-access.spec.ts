import { Role } from 'src/app/constant/enums';
import { DEFAULT_ACCESS, MODULE_ACCESS, resolveModuleAccess } from 'src/app/constant/module-access';

/**
 * What a Super Admin who is ALSO a Doctor can see in the nav.
 *
 * `resolveModuleAccess` is the single place the two are combined, and the requirement it
 * has to meet is one-directional: the Doctor capability ADDS to a role, and must never
 * take anything away. A plain `{ ...doctorAccess }` or a wholesale swap to
 * MODULE_ACCESS[Doctor] would read as "give them the doctor menu" and would quietly
 * strip the owner of Lab Setup and the Admin Panel — the lab locked out of its own
 * settings because its owner happens to practise.
 */
describe('resolveModuleAccess() — the Doctor capability', () => {

  const superAdmin = MODULE_ACCESS[Role.Super_Admin.id];
  const doctor     = MODULE_ACCESS[Role.Doctor.id];

  // ── Case 1: Super Admin, capability off ────────────────────────────────────

  it('leaves a Super Admin exactly as they were when the capability is off', () => {
    expect(resolveModuleAccess(Role.Super_Admin.id, false)).toEqual(superAdmin);
    // Default argument: a caller that knows nothing about doctors gets the role's row.
    expect(resolveModuleAccess(Role.Super_Admin.id)).toEqual(superAdmin);
  });

  // ── Case 2: plain Doctor ───────────────────────────────────────────────────

  it('leaves a Doctor exactly as they were', () => {
    // Their role already grants the doctor flags, so the merge is a no-op for them.
    expect(resolveModuleAccess(Role.Doctor.id, true)).toEqual(doctor);
  });

  // ── Case 3: Super Admin + Doctor ───────────────────────────────────────────

  it('keeps every Super Admin flag when the capability is on', () => {
    const merged = resolveModuleAccess(Role.Super_Admin.id, true);

    // Spelled out rather than looped, because these four are the owner-level surfaces
    // whose loss is the failure this guards against.
    expect(merged.labSetup).toBe(true);
    expect(merged.adminPanel).toBe(true);
    expect(merged.labOps).toBe(true);
    expect(merged.landingRoute).toBe(superAdmin.landingRoute);
  });

  it('never switches off a flag the role had', () => {
    const merged = resolveModuleAccess(Role.Super_Admin.id, true);

    for (const [flag, value] of Object.entries(superAdmin)) {
      if (value === true) {
        expect(merged[flag as keyof typeof merged]).toBe(true);
      }
    }
  });

  it('adds the doctor-specific flags', () => {
    const merged = resolveModuleAccess(Role.Super_Admin.id, true);

    expect(merged.patientTestsLink).toBe(true);
    expect(merged.summaryReports).toBe(true);
  });

  it('does not hand the Super Admin a duplicate self-service User Panel', () => {
    const merged = resolveModuleAccess(Role.Super_Admin.id, true);

    // A Doctor has these on; a Super Admin has them off on purpose, because the Admin
    // Panel already carries the same modules for all staff. Turning them on would give
    // the owner a second copy of four screens they already have.
    expect(doctor.userPanel).toBe(true);
    expect(merged.userPanel).toBe(false);
    expect(merged.myAttendance).toBe(false);
    expect(merged.mySalary).toBe(false);
    expect(merged.myHolidays).toBe(false);
    expect(merged.myVisits).toBe(false);
  });

  it('does not grant the Super Admin the collection boy links', () => {
    const merged = resolveModuleAccess(Role.Super_Admin.id, true);

    expect(merged.myPickups).toBe(false);
    expect(merged.patientsLink).toBe(false);
  });

  // ── Other roles ────────────────────────────────────────────────────────────

  it('leaves the other roles untouched when the capability is off', () => {
    for (const role of Object.values(Role)) {
      expect(resolveModuleAccess(role.id, false)).toEqual(MODULE_ACCESS[role.id]);
    }
  });

  it('falls back to no access for an unknown or absent role', () => {
    expect(resolveModuleAccess(null)).toEqual(DEFAULT_ACCESS);
    // A token carrying a role this build does not know must not be upgraded by also
    // claiming the capability.
    const merged = resolveModuleAccess(99 as never, true);
    expect(merged.labSetup).toBe(false);
    expect(merged.adminPanel).toBe(false);
    expect(merged.labOps).toBe(false);
  });

  it('does not mutate the shared MODULE_ACCESS rows', () => {
    // The rows are module-level constants shared by every consumer; merging into one in
    // place would permanently promote every Super Admin in the session.
    resolveModuleAccess(Role.Super_Admin.id, true);

    expect(MODULE_ACCESS[Role.Super_Admin.id].patientTestsLink).toBe(false);
  });
});
