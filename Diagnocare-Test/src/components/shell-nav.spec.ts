import { Role } from 'src/app/constant/enums';
import { resolveModuleAccess } from 'src/app/constant/module-access';
import { adminOptions, profileMenu, summaryReportMenu, userOptions } from 'src/app/constant/constants';
import {
  NavContext, NavSection, activeNavKey, activeSectionId, buildNavSections,
} from 'src/app/component/layout/shell/shell-nav';

/** Mirrors what HeaderComponent hands the shell for a given role. */
function ctxFor(roleId: number | null, isDoctor = false): NavContext {
  const access = resolveModuleAccess(roleId as any, isDoctor);
  return {
    access,
    roleId,
    isDoctor,
    isSuperAdmin: roleId === Role.Super_Admin.id,
    adminOptions: Object.values(adminOptions),
    userOptions: Object.values(userOptions).filter(o => access[o.access]),
    reports: Object.values(summaryReportMenu),
    accountItems: Object.values(profileMenu).filter(p => p.id === 'profile' || p.id === 'changePassword'),
  };
}

const build = (roleId: number | null, isDoctor = false) => buildNavSections(ctxFor(roleId, isDoctor));
const labels = (s: NavSection[], id: string) => s.find(x => x.id === id)?.items.map(i => i.label) ?? [];
const allKeys = (s: NavSection[]) => s.flatMap(x => x.items.map(i => i.key));

describe('buildNavSections()', () => {

  it('gives a Receptionist the front-desk tasks first, most-used at the top', () => {
    const s = build(Role.Receptionist.id);
    expect(labels(s, 'daily')).toEqual([
      'Home', 'Register patient', 'Patients', 'Work queue', 'Bills & Receipts', 'Test reports', 'Test reminders',
    ]);
    expect(s.find(x => x.id === 'reports')).toBeUndefined();   // no summary reports for this role
    expect(s.find(x => x.id === 'team')).toBeUndefined();
    expect(s.find(x => x.id === 'lab')?.items.map(i => i.label)).toEqual(['Tests & Prices', 'Doctors & Contacts']);
  });

  it('gives a Doctor the sign-off list before anything else and no lab-operations links', () => {
    const s = build(Role.Doctor.id, true);
    expect(labels(s, 'daily')).toEqual(['Home', 'Reports to verify', 'Test reports']);
    expect(s.find(x => x.id === 'lab')).toBeUndefined();
    expect(s.find(x => x.id === 'team')).toBeUndefined();
    expect(labels(s, 'reports').length).toBeGreaterThan(0);
  });

  it('gives a Collection Boy "My pickups" first and never the work queue', () => {
    const s = build(Role.Collection_Boy.id);
    expect(labels(s, 'daily')).toEqual(['Home', 'My pickups', 'Patients']);
    expect(allKeys(s)).not.toContain('work');
  });

  it('gives a Lab Assistant lab operations plus reports, but no setup or team', () => {
    const s = build(Role.Assistant.id);
    expect(labels(s, 'daily')[1]).toBe('Register patient');
    expect(labels(s, 'reports').length).toBeGreaterThan(0);
    expect(s.find(x => x.id === 'team')).toBeUndefined();
    expect(labels(s, 'lab')).not.toContain('Lab settings');
  });

  it('gives an Admin the Work queue first and the team tools, but not owner-only items', () => {
    const s = build(Role.Admin.id);
    expect(labels(s, 'daily').slice(0, 4)).toEqual(['Home', 'Work queue', 'Patients', 'Test reports']);
    const team = labels(s, 'team');
    expect(team).toContain('Staff');
    expect(team).not.toContain('Salary');
    expect(team).not.toContain('Discount Approvals');
    expect(labels(s, 'lab')).not.toContain('Lab settings');
  });

  it('gives a Super Admin the owner-only items', () => {
    const s = build(Role.Super_Admin.id);
    expect(labels(s, 'team')).toEqual(expect.arrayContaining(['Salary', 'Discount Approvals']));
    expect(labels(s, 'lab')).toEqual(expect.arrayContaining(['Lab profile', 'Lab settings']));
  });

  it('adds only "Reports to verify" for a Super Admin who also practises, and removes nothing', () => {
    const plain = build(Role.Super_Admin.id, false);
    const both = build(Role.Super_Admin.id, true);
    const added = allKeys(both).filter(k => !allKeys(plain).includes(k));
    expect(added).toEqual(['work?queue=to-verify']);
    expect(allKeys(plain).every(k => allKeys(both).includes(k))).toBe(true);
  });

  it('ends every signed-in role with My Profile and Change Password in "My things"', () => {
    for (const id of [1, 2, 3, 4, 5, 6]) {
      const mine = labels(build(id), 'mine');
      expect(mine.slice(-2)).toEqual(['My Profile', 'Change Password']);
    }
  });

  it('files attendance requests by what the role does with them', () => {
    expect(labels(build(Role.Admin.id), 'team')).toContain('Attendance requests');
    expect(labels(build(Role.Receptionist.id), 'mine')).toContain('My attendance requests');
  });

  it('degrades safely for a missing, unknown or unmapped role', () => {
    for (const id of [null, 0, 99, 7]) {
      const s = build(id as any);
      // Nothing granted by flags — only the account pages every signed-in person has.
      expect(s.map(x => x.id)).toEqual(['mine']);
      expect(labels(s, 'mine')).toEqual(['My Profile', 'Change Password']);
    }
  });

  it('never repeats a destination, and never emits an empty section', () => {
    for (const id of [1, 2, 3, 4, 5, 6]) {
      for (const doc of [false, true]) {
        const s = build(id, doc);
        const keys = allKeys(s);
        expect(new Set(keys).size).toBe(keys.length);
        expect(s.every(x => x.items.length + x.groups.length > 0)).toBe(true);
      }
    }
  });

  it('drops a duplicate destination supplied twice', () => {
    const ctx = ctxFor(Role.Admin.id);
    ctx.adminOptions = [...ctx.adminOptions, ...ctx.adminOptions];
    const keys = allKeys(buildNavSections(ctx));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('shows only what the access flags allow, whatever the role id says', () => {
    // A Receptionist id with every flag off sees no lab links: the role never grants.
    const ctx = ctxFor(Role.Receptionist.id);
    ctx.access = { ...ctx.access, labOps: false, summaryReports: false, attendanceRequests: false };
    ctx.userOptions = [];
    const s = buildNavSections(ctx);
    expect(labels(s, 'daily')).toEqual(['Home']);
    expect(s.find(x => x.id === 'lab')).toBeUndefined();
  });
});

describe('activeNavKey()', () => {
  const s = build(Role.Super_Admin.id, true);

  it('highlights exactly one row per URL', () => {
    expect(activeNavKey('/pathology', s)).toBe('pathology');
    expect(activeNavKey('/work', s)).toBe('work');
    expect(activeNavKey('/patients', s)).toBe('patients');
  });

  it('prefers the queue-specific row over Work queue when the queue matches', () => {
    expect(activeNavKey('/work?queue=to-verify', s)).toBe('work?queue=to-verify');
    expect(activeNavKey('/work?queue=to-collect', s)).toBe('work');
  });

  it('does not light Patients on the register page, but does on a patient page', () => {
    expect(activeNavKey('/patients/add', s)).toBe('patients/add');
    expect(activeNavKey('/patients/123', s)).toBe('patients');
    expect(activeNavKey('/patients?search=ram', s)).toBe('patients');
  });

  it('lights a report row and returns null for an unknown page', () => {
    expect(activeNavKey('/reports/worksheet', s)).toBe('reports/worksheet');
    expect(activeNavKey('/nowhere', s)).toBeNull();
    expect(activeNavKey('/', s)).toBeNull();
  });

  it('names the section that holds the active page, for the collapsed rail', () => {
    expect(activeSectionId('/receipt', s)).toBe('daily');
    expect(activeSectionId('/reports/worksheet', s)).toBe('reports');
    expect(activeSectionId('/change-password', s)).toBe('mine');
    expect(activeSectionId('/nowhere', s)).toBeNull();
  });
});
