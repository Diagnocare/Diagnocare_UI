import { Role } from 'src/app/constant/enums';
import { ModuleAccess } from '../../../models/auth/module-access.model';
import { NavContext, NavGroup, NavItem, NavSection } from '../../../models/layout/shell-nav.model';

/**
 * Which Daily-work links come first, per role, after Home.
 *
 * Ordering only: a key listed here that the role cannot see is skipped, and a
 * visible link not listed keeps its default place after the listed ones. So
 * this file cannot grant anything, and an unknown role simply gets the
 * default order.
 */
const PRIORITY: Record<number, string[]> = {
  [Role.Receptionist.id]:   ['register', 'patients', 'work', 'receipt', 'patient-tests', 'reminders'],
  [Role.Assistant.id]:      ['register', 'patients', 'work', 'receipt', 'patient-tests', 'reminders'],
  [Role.Doctor.id]:         ['verify', 'patient-tests', 'patients'],
  [Role.Collection_Boy.id]: ['pickups', 'patients'],
  [Role.Admin.id]:          ['work', 'patients', 'patient-tests', 'receipt', 'verify', 'register', 'reminders'],
  [Role.Super_Admin.id]:    ['work', 'patients', 'patient-tests', 'receipt', 'verify', 'register', 'reminders'],
};

export function navKey(route: string, query?: Record<string, string>): string {
  const q = query ? Object.keys(query).sort().map(k => `${k}=${query[k]}`).join('&') : '';
  return q ? `${route}?${q}` : route;
}

function item(label: string, route: string, icon: string, query?: Record<string, string>): NavItem {
  return query ? { key: navKey(route, query), label, route, icon, query } : { key: navKey(route), label, route, icon };
}

/** Drops a repeated destination. First one wins, so the more specific placement stays. */
function dedupe(items: NavItem[], seen: Set<string>): NavItem[] {
  return items.filter(i => (seen.has(i.key) ? false : (seen.add(i.key), true)));
}

/** Plainer words for the admin items, without touching the shared constants. */
function friendlyAdminLabel(id: string, fallback: string): string {
  switch (id) {
    case 'userDetails': return 'Staff';
    default:            return fallback;
  }
}

export function buildNavSections(ctx: NavContext): NavSection[] {
  const a = ctx.access;
  const isCollectionBoy = ctx.roleId === Role.Collection_Boy.id;

  // Daily work. `tag` is the ordering handle; it is not part of the item.
  const dailyTagged: { tag: string; item: NavItem }[] = [];
  const addDaily = (tag: string, i: NavItem) => dailyTagged.push({ tag, item: i });

  if (a.myPickups)                   addDaily('pickups',       item('My pickups',        'my-pickups',    'fa-motorcycle'));
  if (a.labOps)                      addDaily('register',      item('Register patient',  'patients/add',  'fa-user-plus'));
  if (a.labOps && !isCollectionBoy)  addDaily('work',          item('Work queue',        'work',          'fa-list-check'));
  // The doctor's own sign-off list: same page as Work queue, different queue.
  if (ctx.isDoctor)                  addDaily('verify',        item('Reports to verify', 'work',          'fa-user-doctor', { queue: 'to-verify' }));
  if (a.labOps || a.patientsLink)    addDaily('patients',      item('Patients',          'patients',      'fa-users'));
  if (a.labOps || a.patientTestsLink)
                                     addDaily('patient-tests', item('Test reports',      'patient-tests', 'fa-file-medical'));
  if (a.labOps)                      addDaily('receipt',       item('Bills & Receipts',  'receipt',       'fa-receipt'));
  if (a.labOps)                      addDaily('reminders',     item('Test reminders',    'test-reminders', 'fa-bell'));

  const order = (ctx.roleId !== null ? PRIORITY[ctx.roleId] : undefined) ?? [];
  const rank = (tag: string) => { const r = order.indexOf(tag); return r < 0 ? order.length : r; };
  // Array.sort is stable, so unlisted links keep their default order.
  const ranked = dailyTagged
    .map((d, n) => ({ ...d, n }))
    .sort((x, y) => rank(x.tag) - rank(y.tag) || x.n - y.n)
    .map(d => d.item);

  const daily: NavItem[] = [];
  if (a.home) daily.push(item('Home', 'pathology', 'fa-house'));
  daily.push(...ranked);

  const lab: NavItem[] = [];
  if (a.labOps)   lab.push(item('Tests & Prices',     'manage-tests', 'fa-vials'));
  if (a.labOps)   lab.push(item('Doctors & Contacts', 'contacts',     'fa-address-book'));
  if (a.labSetup) lab.push(item('Lab profile',        'lab-profile',  'fa-hospital'));
  if (a.labSetup) lab.push(item('Lab settings',       'lab-setup',    'fa-sliders'));
  // Same audience as before (Admin + Super Admin, matching the 'template' route guard).
  if (a.adminPanel) lab.push(item('Report Template',  'template',     'fa-file-alt'));

  const team: NavItem[] = [];
  if (a.adminPanel) {
    for (const o of ctx.adminOptions) {
      if (o.superAdminOnly && !ctx.isSuperAdmin) continue;
      team.push(item(friendlyAdminLabel(o.id, o.label), o.route, o.icon ?? 'fa-circle'));
    }
  }

  const mine: NavItem[] = ctx.userOptions.map(o => item(o.label, o.route, o.icon ?? 'fa-circle'));

  // Attendance requests: admins review everyone's, everyone else raises their own.
  if (a.attendanceRequests) {
    (a.adminPanel ? team : mine).push(
      item(a.adminPanel ? 'Attendance requests' : 'My attendance requests', 'attendance-requests', 'fa-calendar-plus'));
  }

  // Account pages close the "My things" section, so it is the same place for every role.
  // Any signed-in user may open them (no role guard on the routes), so they need no flag.
  for (const o of ctx.accountItems) {
    mine.push(item(o.label, o.route, o.icon ? 'fa-' + o.icon : 'fa-circle'));
  }

  const reports: NavItem[] = a.summaryReports
    ? ctx.reports.map(r => item(r.label, 'reports/' + r.id, r.icon ?? 'fa-circle'))
    : [];

  // One shared `seen` set: a destination appears once in the whole sidebar.
  const seen = new Set<string>();
  const sections: NavSection[] = [
    { id: 'daily',   title: 'Daily work', icon: 'fa-bolt',         items: dedupe(daily, seen),   groups: [] },
    { id: 'reports', title: 'Reports',    icon: 'fa-chart-column', items: dedupe(reports, seen), groups: [] },
    { id: 'lab',     title: 'Lab setup',  icon: 'fa-flask',        items: dedupe(lab, seen),     groups: [] },
    { id: 'team',    title: 'Team',       icon: 'fa-users-gear',   items: dedupe(team, seen),    groups: [] },
    { id: 'mine',    title: 'My things',  icon: 'fa-circle-user',  items: dedupe(mine, seen),    groups: [] },
  ];
  return sections.filter(s => s.items.length > 0 || s.groups.length > 0);
}

/**
 * The key of the single item that matches the current URL, or null.
 *
 * Longest path wins, and an item with a query only matches when the URL carries
 * it — so /work?queue=to-verify lights "Reports to verify" and not "Work queue",
 * /patients/add lights "Register patient" and not "Patients", and /patients/123
 * still lights "Patients". Exactly one row is ever highlighted.
 */
export function activeNavKey(url: string, sections: NavSection[]): string | null {
  const [pathPart, queryPart = ''] = url.split('#')[0].split('?');
  const path = pathPart.replace(/^\/+|\/+$/g, '');
  const params = new URLSearchParams(queryPart);

  let best: { key: string; score: number } | null = null;
  for (const s of sections) {
    for (const i of [...s.items, ...s.groups.flatMap(g => g.items)]) {
      // Home is the landing page, not a prefix of anything else.
      const onPath = path === i.route || (i.route !== 'pathology' && path.startsWith(i.route + '/'));
      if (!onPath) continue;
      if (i.query && !Object.entries(i.query).every(([k, v]) => params.get(k) === v)) continue;
      const score = i.route.length * 10 + (i.query ? 1 : 0);
      if (!best || score > best.score) best = { key: i.key, score };
    }
  }
  return best?.key ?? null;
}

/** Id of the section holding the active item — lights the icon in rail mode. */
export function activeSectionId(url: string, sections: NavSection[]): string | null {
  const key = activeNavKey(url, sections);
  if (!key) return null;
  return sections.find(s => s.items.some(i => i.key === key) ||
                            s.groups.some(g => g.items.some(i => i.key === key)))?.id ?? null;
}
