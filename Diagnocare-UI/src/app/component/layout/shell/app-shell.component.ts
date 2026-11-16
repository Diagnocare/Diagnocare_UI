import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { HeaderComponent } from '../../header/header-menu/header.component';
import { TokenService } from 'src/app/core/interceptors/token.service';
import { ConfirmModalComponent } from 'src/app/shared/confirm-modal/confirm-modal.component';
import { activeNavKey, activeSectionId, buildNavSections } from './shell-nav';
import { NavItem, NavSection } from '../../../models/layout/shell-nav.model';

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
const FOOT_STATE_KEY = 'dc.sidebar.foot';

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
 *   Footer fold    the footer's own rows fold down to one compact row of
 *                  icons, handing the menu back ~56px. The smallest of the
 *                  four and the only one that is not about the menu at all.
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
 * The last two are independent of the first two in both directions, and of
 * each other. In particular the footer fold is NOT the rail: one folds a
 * couple of rows at the bottom vertically, the other narrows the whole
 * sidebar horizontally, and `toggleFoot` and `toggleRail` never write each
 * other's field. The rail also deliberately does not read the fold state: it
 * is one icon per section, a function of `sections` alone, so it is the same
 * column before and after every navigation. The route only moves the
 * highlight inside the flyout.
 *
 * LAYOUT
 * ──────
 * The sidebar is a 100vh flex column of three parts and only the middle one
 * scrolls: a fixed brand row, the nav (`min-height: 0; overflow-y: auto`) and
 * a fixed footer. Nothing here measures or sets a height for any of them —
 * flexbox divides the viewport, so a menu of any length, with any number of
 * sections expanded, scrolls instead of pushing the footer out of sight.
 *
 * It extends HeaderComponent, the shared base for access rules, badges, the
 * notification bell, licence banners and logout. HeaderComponent has no template
 * of its own.
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

  /** Key of the one highlighted item, and the section holding it (lights the rail icon). */
  activeKey: string | null = null;
  activeSection: string | null = null;

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

  /**
   * Whether the sidebar footer shows its rows in full.
   *
   * The fourth and narrowest fold: it collapses the footer's own rows and
   * nothing else. Deliberately not the rail — see the class comment. Folded,
   * the footer keeps its actions as icon-only tiles (full sidebar) or leaves
   * the chevron that brings them back (rail), so the fold buys height without
   * ever becoming the thing that hid Help or "Show all sections".
   *
   * Open by default, like the sections: a frame shows too much before it
   * shows too little.
   */
  footOpen = true;

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
        this.updateActive();
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
   * lands on Access Denied. The rules live in shell-nav.ts as a pure function.
   */
  private buildNav(): void {
    const a = this.access;
    this.canRegister = a.labOps;
    this.canFind = a.labOps || a.patientsLink;

    this.sections = buildNavSections({
      access: a,
      roleId: this.tokenRoleId(),
      // The capability, not the role: see HeaderComponent.checkAdminPanelAccess().
      isDoctor: this.isDoctor,
      isSuperAdmin: this.isSuperAdmin,
      adminOptions: this.adminOptions,
      userOptions: this.visibleUserOptions,
      reports: this.summaryReportMenu,
      accountItems: this.profileMenu.filter(p => p.id === 'profile' || p.id === 'changePassword'),
    });
    this.updateActive();
  }

  /** Recomputed on every navigation; the template just compares keys. */
  private updateActive(): void {
    const url = this.router.url;
    this.activeKey = activeNavKey(url, this.sections);
    this.activeSection = activeSectionId(url, this.sections);
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

  /**
   * Fold every section shut — the mirror of expandAll(), and the quick way to
   * a sidebar that is five headings and nothing else.
   *
   * Sections only, not the groups inside them. A group's fold is a preference
   * about one list, and shutting the section around it already hides that
   * list, so there is nothing to gain by overwriting it — and re-opening the
   * section afterwards would otherwise hand back a submenu the person had
   * chosen to keep open.
   *
   * Nothing here fights revealActive(): fold everything, open a page, and the
   * section that page lives in comes back by itself. That is the sidebar's
   * standing rule — folds only ever open themselves, never close themselves —
   * and it is what keeps "hide everything" from being a way to lose the
   * highlighted row.
   */
  collapseAll(): void {
    for (const section of this.sections) this.collapsed.add(section.id);
    this.saveNavState();
  }

  get hasCollapsed(): boolean {
    return this.collapsed.size > 0;
  }

  /**
   * Whether any section is still open — i.e. whether collapseAll() has
   * anything left to do. Each footer button appears only while its own action
   * would change something, so neither is ever a row that does nothing: open
   * everything and only "Hide all" is there, fold everything and only "Show
   * all" is, and in between both are.
   */
  get hasExpanded(): boolean {
    return this.sections.some(s => this.isOpen(s.id));
  }

  /**
   * Folds the sidebar footer.
   *
   * Touches `footOpen` and nothing else — not `railed`, not `collapsed`. The
   * screenshot's footer chevron and the header's `<<` are two controls over
   * two different axes, and either one doing the other's job would be a bug,
   * not a convenience.
   */
  toggleFoot(): void {
    this.footOpen = !this.footOpen;
    try {
      localStorage.setItem(FOOT_STATE_KEY, this.footOpen ? '1' : '0');
    } catch {
      /* See toggleRail(). */
    }
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
      // Read the other way round from the rail: anything but a stored '0' —
      // including a missing key — leaves the footer open, so a first visit
      // and an unreadable store both land on the fuller sidebar.
      this.footOpen = localStorage.getItem(FOOT_STATE_KEY) !== '0';
    } catch {
      // Unreadable or corrupt — fall back to everything expanded, which is the
      // safe end of the range: a sidebar that shows too much, never too little.
      this.collapsed = new Set();
      this.railed = false;
      this.footOpen = true;
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
