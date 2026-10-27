import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { Role } from 'src/app/constant/enums';
import { HeaderComponent } from '../../header/header-menu/header.component';
import { TokenService } from 'src/app/core/interceptors/token.service';
import { ConfirmModalComponent } from 'src/app/shared/confirm-modal/confirm-modal.component';

/** One link in the sidebar. */
interface NavItem {
  label: string;
  /** Absolute app route, without the leading slash. */
  route: string;
  icon: string;
  /** Optional query string, e.g. a pre-selected work queue. */
  query?: Record<string, string>;
}

/**
 * A collapsible submenu inside a section — the second level of folding.
 *
 * NOTHING BUILDS ONE ANY MORE. Business reports was the only group, and its
 * twelve entries are now direct items of the Reports section, so every
 * section ships `groups: []` and the group row, the .sh-subnav list and the
 * flyout's group headings are all unreachable. The type and the code paths
 * are kept for the next list long enough to want a fold of its own; delete
 * them with the template and CSS that serve them if that never comes.
 */
interface NavGroup {
  /** Stable key. Used for the open/closed memory, so it must not change. */
  id: string;
  label: string;
  icon: string;
  items: NavItem[];
  /**
   * Route prefix that means "the active page is inside this group", e.g.
   * 'reports'. Used to open the group automatically on a deep link.
   */
  activePrefix: string;
}

/**
 * A titled block of the sidebar — the first level of folding.
 *
 * A section holds direct links and/or submenu groups. Both levels fold
 * independently and both remember their state, so someone who never touches
 * payroll can shut "Team" once and keep it shut.
 */
interface NavSection {
  /** Stable key. Used for the open/closed memory, so it must not change. */
  id: string;
  title: string;
  /**
   * The section's own icon. In the full sidebar it sits beside the heading;
   * in rail mode it IS the section — the only thing left of it — and clicking
   * it opens the section's links as a flyout. So this must read clearly at
   * 16px with no text beside it.
   */
  icon: string;
  items: NavItem[];
  groups: NavGroup[];
}

/**
 * Where the sidebar's open/closed state is remembered.
 *
 * Deliberately localStorage and not the server: this is a per-person, per-
 * device preference about a frame, not lab data, and it must survive a reload
 * without waiting on a request. Everything that reads it tolerates it being
 * missing or unreadable (private windows, cleared site data), in which case
 * the sidebar opens with every section expanded — see loadNavState().
 */
const NAV_STATE_KEY = 'dc.sidebar.collapsed';
const RAIL_STATE_KEY = 'dc.sidebar.rail';

/**
 * AppShellComponent — the sidebar frame around every signed-in screen.
 * ─────────────────────────────────────────────────────────────────────────────
 * Replaces the top header's hover dropdowns with a persistent left sidebar.
 *
 * Why: the old header hid 30+ screens inside five hover menus. A hover menu
 * closes the moment the pointer drifts off it, does nothing on a touch screen,
 * and makes people remember which heading a screen lives under. The sidebar
 * shows every place the person may go, all the time, grouped by the job it
 * belongs to ("Daily work", "Lab setup", "Team"), with live counts beside the
 * ones that have something waiting.
 *
 * FOLDING
 * ───────
 * Three independent controls, because they solve three different problems:
 *
 *   Section fold   a whole heading shuts. For the person who never touches
 *                  payroll and wants those five rows gone for good.
 *   Submenu fold   a long list inside a section shuts (business reports is
 *                  twelve entries, enough to push "Team" off a laptop screen).
 *   Rail           the entire sidebar narrows to its icons, giving the page
 *                  back ~176px. For wide tables on a small screen. Every
 *                  section keeps its own icon there, and clicking one opens
 *                  that section's links as a flyout beside the rail — so the
 *                  rail compacts the menu rather than taking it away.
 *
 * The first two are remembered per person per device, and only ever open
 * themselves — never close themselves — so the sidebar does not appear to
 * fight the person using it. See revealActive().
 *
 * The third is independent of the other two in both directions, and the rail
 * deliberately does not read their state: it is one icon per section, a
 * function of `sections` alone, so it is the same column before and after
 * every navigation. The route only moves the highlight inside the flyout.
 *
 * It extends HeaderComponent rather than copying it, so access rules, badges,
 * the notification bell, licence banners and logout behave identically in both
 * frames. Only the template differs. Toggle with USE_SIDEBAR_SHELL.
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ConfirmModalComponent],
  templateUrl: './app-shell.component.html',
  styleUrls: ['./app-shell.component.css'],
})
export class AppShellComponent extends HeaderComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly tokens = inject(TokenService);
  private navSub?: Subscription;

  sections: NavSection[] = [];

  /**
   * Ids of the sections and groups the person has folded shut.
   *
   * Collapsed-not-expanded is the right way round to store this: a new section
   * added in a later release is open by default, which is what someone wants
   * from something they have never seen. Storing the expanded set instead would
   * hide every new section until it was found and clicked.
   */
  private collapsed = new Set<string>();

  /**
   * Rail mode — the whole sidebar narrowed to its icons. Independent of the
   * two folding levels: the rail is about horizontal room for the page,
   * folding is about vertical room in the menu.
   */
  railed = false;

  /**
   * Which section's rail flyout is open, if any.
   *
   * Rail mode leaves a column of section icons and nothing else, so the icon
   * has to be able to give its section back on demand — otherwise narrowing
   * the sidebar would mean losing the menu rather than compacting it. Clicking
   * an icon opens that section's links in a panel beside the rail.
   *
   * Only ever one at a time, and never while the sidebar is full width, where
   * the links are already on screen.
   */
  flyoutId: string | null = null;

  /**
   * Viewport y of the open flyout, in px.
   *
   * The flyout has to be `position: fixed` rather than absolute: the nav it
   * lives in scrolls (`overflow-y: auto`), and an absolutely positioned panel
   * hanging off its right edge would be clipped by that scroll container.
   * Fixed escapes the clip, but then it needs a y of its own, which is the
   * section button's own y — captured on click and clamped so a section near
   * the bottom of a short window still opens a flyout that fits on screen.
   */
  flyoutTop = 0;

  /**
   * True below the drawer breakpoint, where the sidebar is an overlay and the
   * rail does not apply. Tracked rather than read from window.innerWidth on
   * demand, so change detection is not measuring the viewport on every pass.
   */
  narrow = false;

  /**
   * Whether the rail is actually in effect — the stored preference AND a wide
   * enough window. The two have to be separate: `railed` must survive a visit
   * on a phone, but every rail behaviour (icon click opens a flyout rather
   * than folding) must be off there, or a section heading would appear to do
   * nothing. The CSS makes the same distinction at the same breakpoint.
   */
  get railActive(): boolean {
    return this.railed && !this.narrow;
  }

  profileOpen = false;
  /** Below 980px the sidebar becomes a drawer. */
  drawerOpen = false;

  findTerm = '';

  /** Front-desk shortcut — shown to every role allowed to register a patient. */
  canRegister = false;
  canFind = false;

  /** Matches the @media breakpoint in app-shell.component.css. */
  private static readonly DRAWER_BREAKPOINT = 980;

  override ngOnInit(): void {
    super.ngOnInit();
    this.onResize();
    this.loadNavState();
    this.buildNav();
    this.revealActive();
    this.navSub = this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => {
        // A deep link or a jump from a banner can land on a page whose section
        // the person had folded shut. Open it, so the sidebar always shows
        // where you are rather than hiding the highlighted row.
        this.revealActive();
        this.drawerOpen = false;
        this.profileOpen = false;
        // A rail flyout is how you got here; it has done its job.
        this.flyoutId = null;
      });
  }

  override ngOnDestroy(): void {
    super.ngOnDestroy();
    this.navSub?.unsubscribe();
  }

  // ── Navigation model ──────────────────────────────────────────────────────

  /**
   * Builds the sidebar from the same ModuleAccess flags the old header used, so
   * a role sees exactly the screens its route guards allow — never a link that
   * lands on Access Denied.
   */
  private buildNav(): void {
    const a = this.access;
    const roleId = this.tokenRoleId();
    const isCollectionBoy = roleId === Role.Collection_Boy.id;
    const isDoctor = roleId === Role.Doctor.id;

    this.canRegister = a.labOps;
    this.canFind = a.labOps || a.patientsLink;

    const daily: NavItem[] = [];
    if (a.home)                    daily.push({ label: 'Home',             route: 'pathology',     icon: 'fa-house' });
    if (a.labOps && !isCollectionBoy)
                                   daily.push({ label: 'Work queue',       route: 'work',          icon: 'fa-list-check' });
    if (isDoctor)                  daily.push({ label: 'Reports to verify', route: 'work',         icon: 'fa-user-doctor', query: { queue: 'to-verify' } });
    if (a.labOps || a.patientsLink) daily.push({ label: 'Patients',        route: 'patients',      icon: 'fa-users' });
    if (a.labOps || a.patientTestsLink)
                                   daily.push({ label: 'Test reports',     route: 'patient-tests', icon: 'fa-file-medical' });
    if (a.labOps)                  daily.push({ label: 'Bills & receipts', route: 'receipt',       icon: 'fa-receipt' });
    if (a.labOps)                  daily.push({ label: 'Test reminders',   route: 'test-reminders', icon: 'fa-bell' });

    const lab: NavItem[] = [];
    if (a.labOps)    lab.push({ label: 'Tests & prices',    route: 'manage-tests', icon: 'fa-vials' });
    if (a.labOps)    lab.push({ label: 'Doctors & Contacts', route: 'contacts',    icon: 'fa-address-book' });
    if (a.labSetup)  lab.push({ label: 'Lab profile',       route: 'lab-profile',  icon: 'fa-hospital' });
    if (a.labSetup)  lab.push({ label: 'Lab settings',      route: 'lab-setup',    icon: 'fa-sliders' });

    const team: NavItem[] = [];
    if (a.adminPanel) {
      for (const item of this.adminOptions) {
        if (item.superAdminOnly && !this.isSuperAdmin) continue;
        team.push({
          label: this.friendlyAdminLabel(item.id, item.label),
          route: item.route,
          icon: item.icon ?? 'fa-circle',
        });
      }
    }

    const mine: NavItem[] = this.visibleUserOptions.map(item => ({
      label: item.label,
      route: item.route,
      icon: item.icon ?? 'fa-circle',
    }));

    // Attendance requests. ModuleAccess has carried an `attendanceRequests`
    // flag — true for all six roles — since the feature was built, but nothing
    // ever read it, so /attendance-requests had no nav entry in either frame.
    // It was reachable only by typing the URL, or from a button on the admin
    // Attendance page that the staff who actually raise requests cannot open.
    //
    // One surface, two jobs, so it is filed by what the role does with it
    // rather than duplicated: admins review everyone's, everyone else raises
    // and tracks their own.
    if (a.attendanceRequests) {
      const requests: NavItem = {
        label: a.adminPanel ? 'Attendance requests' : 'My attendance requests',
        route: 'attendance-requests',
        icon: 'fa-calendar-plus',
      };
      (a.adminPanel ? team : mine).push(requests);
    }

    // The reports themselves, straight into the Reports section.
    //
    // These used to sit behind a "Business reports" submenu inside it, which
    // meant two clicks and two disclosure levels to reach a report, and a
    // heading whose name said no more than the section's own. The section
    // already folds as one, so the submenu was buying nothing the fold did
    // not already do.
    const reports: NavItem[] = a.summaryReports
      ? this.summaryReportMenu.map(r => ({
          label: r.label,
          route: 'reports/' + r.id,
          icon: r.icon ?? 'fa-circle',
        }))
      : [];

    this.sections = [
      { id: 'daily',   title: 'Daily work', icon: 'fa-bolt',         items: daily, groups: [] },
      { id: 'reports', title: 'Reports',    icon: 'fa-chart-column', items: reports, groups: [] },
      { id: 'lab',     title: 'Lab setup',  icon: 'fa-flask',        items: lab,   groups: [] },
      { id: 'team',    title: 'Team',       icon: 'fa-users-gear',   items: team,  groups: [] },
      { id: 'mine',    title: 'My things',  icon: 'fa-circle-user',  items: mine,  groups: [] },
    ].filter(s => s.items.length > 0 || s.groups.length > 0);
  }

  // ── Folding ───────────────────────────────────────────────────────────────
  // Two independent levels, one mechanism. A section and a group can never
  // collide in `collapsed` because section ids and group ids are drawn from
  // different, fixed lists above.

  isOpen(id: string): boolean {
    return !this.collapsed.has(id);
  }

  toggle(id: string): void {
    if (this.collapsed.has(id)) this.collapsed.delete(id);
    else this.collapsed.add(id);
    this.saveNavState();
  }

  /**
   * What the section heading does when clicked, which depends on the mode:
   *
   *   full sidebar — fold the section shut or open, in place.
   *   rail         — open the section's links as a flyout beside the rail.
   *
   * Folding in rail mode would be meaningless (the links are already hidden)
   * and would quietly change what the person sees when they widen the sidebar
   * again, so the rail deliberately does not touch the fold state.
   */
  onSectionClick(section: NavSection, event: Event): void {
    if (!this.railActive) {
      this.toggle(section.id);
      return;
    }
    // Keep the document:click handler below from closing this in the same tick.
    event.stopPropagation();

    if (this.flyoutId === section.id) {
      this.flyoutId = null;
      return;
    }

    // Line the panel up with the icon that opened it, then pull it back up if
    // it would run off the bottom. ESTIMATED_HEIGHT is a ceiling, not a
    // measurement: the panel is not in the DOM yet at this point, and the
    // longest section (business reports) is about this tall.
    const ESTIMATED_HEIGHT = 420;
    const MARGIN = 8;
    const top = (event.currentTarget as HTMLElement).getBoundingClientRect().top;
    const lowest = window.innerHeight - ESTIMATED_HEIGHT - MARGIN;
    this.flyoutTop = Math.max(MARGIN, Math.min(top, lowest));

    this.flyoutId = section.id;
    this.profileOpen = false;
    this.bellOpen = false;
  }

  closeFlyout(): void {
    this.flyoutId = null;
  }

  /** Expand everything. Offered in the sidebar footer as a way back from a
   *  menu someone has folded into uselessness. */
  expandAll(): void {
    this.collapsed.clear();
    this.saveNavState();
  }

  get hasCollapsed(): boolean {
    return this.collapsed.size > 0;
  }

  toggleRail(): void {
    this.railed = !this.railed;
    // A flyout belongs to the rail, so it cannot outlive it; and widening the
    // sidebar already shows what the flyout was showing.
    this.flyoutId = null;
    if (this.railed) this.profileOpen = false;
    try {
      localStorage.setItem(RAIL_STATE_KEY, this.railed ? '1' : '0');
    } catch {
      /* Private window or blocked site data — the rail still works for this
         session, it just will not be remembered. Not worth telling anyone. */
    }
  }

  /**
   * Opens whatever section or group contains the page now showing.
   *
   * Only ever expands. If someone deliberately folded "Team" and then opened a
   * Team page from a notification, they want to see where they are; when they
   * navigate away the section stays open, because silently re-folding it would
   * make the sidebar feel like it was fighting them.
   *
   * This is a full-width-sidebar behaviour only, and it is the reason the rail
   * must not read the fold state: this runs on every NavigationEnd, so a rail
   * built from `collapsed` gained a section's items the moment you opened a
   * page inside it — the icon column restructuring itself as a side effect of
   * being used. The rail renders no section bodies at all (see the template),
   * so this stays invisible until the sidebar is widened again, which is
   * exactly when it is wanted.
   */
  private revealActive(): void {
    const first = this.router.url.split(/[/?#]/).filter(Boolean)[0] ?? '';
    if (!first) return;

    for (const section of this.sections) {
      const inItems  = section.items.some(i => i.route.split('/')[0] === first);
      const inGroups = section.groups.filter(g => g.activePrefix === first);

      if (inItems || inGroups.length > 0) this.collapsed.delete(section.id);
      for (const g of inGroups) this.collapsed.delete(g.id);
    }
    this.saveNavState();
  }

  private loadNavState(): void {
    try {
      const raw = localStorage.getItem(NAV_STATE_KEY);
      if (raw) {
        const ids: unknown = JSON.parse(raw);
        if (Array.isArray(ids)) {
          this.collapsed = new Set(ids.filter((v): v is string => typeof v === 'string'));
        }
      }
      this.railed = localStorage.getItem(RAIL_STATE_KEY) === '1';
    } catch {
      // Unreadable or corrupt — fall back to everything expanded, which is the
      // safe end of the range: a sidebar that shows too much, never too little.
      this.collapsed = new Set();
      this.railed = false;
    }
  }

  private saveNavState(): void {
    try {
      localStorage.setItem(NAV_STATE_KEY, JSON.stringify([...this.collapsed]));
    } catch {
      /* See toggleRail(). */
    }
  }

  /** Badges change every minute; re-read them on each change-detection pass. */
  liveBadge(item: NavItem): number {
    const admin = this.adminOptions.find(o => o.route === item.route);
    if (admin) return this.badgeFor(admin);
    const user = this.visibleUserOptions.find(o => o.route === item.route);
    return user ? this.badgeFor(user) : 0;
  }

  /** Plainer words for the admin items, without touching the shared constants. */
  private friendlyAdminLabel(id: string, fallback: string): string {
    switch (id) {
      case 'userDetails': return 'Staff';
      case 'template':    return 'Report layouts';
      default:            return fallback;
    }
  }

  private tokenRoleId(): number | null {
    return this.tokens.getUserRole();
  }

  // ── Top bar actions ───────────────────────────────────────────────────────

  findPatient(): void {
    const term = this.findTerm.trim();
    if (!term) return;
    this.router.navigate(['/patients'], { queryParams: { search: term } });
  }

  routeFor(item: NavItem): string {
    return this.isLicenceExpired ? '/licence-expired' : '/' + item.route;
  }

  /** Two initials for the avatar tile when there is no photo. */
  get initials(): string {
    const name = (this.userName ?? 'U').replace(/[^A-Za-z ]/g, ' ').trim();
    const parts = name.split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? 'U') + (parts[1]?.[0] ?? '')).toUpperCase();
  }

  get hasPhoto(): boolean {
    return !!this.profilePhotoUrl && this.profilePhotoUrl !== '/assets/defaultPic.jpg';
  }

  toggleProfile(event: Event): void {
    event.stopPropagation();
    this.profileOpen = !this.profileOpen;
    this.bellOpen = false;
  }

  override toggleBell(event: Event): void {
    this.profileOpen = false;
    super.toggleBell(event);
  }

  @HostListener('window:resize')
  onResize(): void {
    const narrow = window.innerWidth <= AppShellComponent.DRAWER_BREAKPOINT;
    if (narrow === this.narrow) return;
    this.narrow = narrow;
    // Crossing into drawer territory takes the rail away, and with it the
    // thing the flyout was anchored to.
    if (narrow) this.flyoutId = null;
  }

  @HostListener('document:click')
  closeProfile(): void {
    this.profileOpen = false;
    this.flyoutId = null;
  }

  @HostListener('document:keydown.escape')
  closeOverlays(): void {
    this.profileOpen = false;
    this.drawerOpen = false;
    this.flyoutId = null;
  }
}
