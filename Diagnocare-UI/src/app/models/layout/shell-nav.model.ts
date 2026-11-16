import { ModuleAccess } from '../auth/module-access.model';

/** One link in the sidebar. */
export interface NavItem {
  /** Stable identity (route + query). Used to drop duplicates and to find the active row. */
  key: string;
  label: string;
  /** Absolute app route, without the leading slash. */
  route: string;
  icon: string;
  /** Optional query string, e.g. a pre-selected work queue. */
  query?: Record<string, string>;
}

/**
 * A collapsible submenu inside a section. Nothing builds one any more — see the
 * note in AppShellComponent; the type stays because the template still renders them.
 */
export interface NavGroup {
  id: string;
  label: string;
  icon: string;
  items: NavItem[];
  activePrefix: string;
}

/** A titled block of the sidebar. */
export interface NavSection {
  id: string;
  title: string;
  icon: string;
  items: NavItem[];
  groups: NavGroup[];
}

/**
 * Everything the sidebar's contents depend on. Plain data, so the builder below
 * is a pure function: the same context always gives the same menu, and a test
 * can cover every role without standing up Angular.
 *
 * Visibility comes ONLY from `access` (the ModuleAccess flags the route guards
 * and the API policies are kept in step with) plus the doctor capability. The
 * role id is used for ordering and for the one case ModuleAccess cannot express
 * — never to grant a link.
 */
export interface NavContext {
  access: ModuleAccess;
  roleId: number | null;
  isDoctor: boolean;
  isSuperAdmin: boolean;
  /** Admin Panel entries, already in display order. */
  adminOptions: { id: string; label: string; route: string; icon?: string; superAdminOnly?: boolean }[];
  /** User Panel entries the role is allowed (already filtered by their access flag). */
  userOptions: { label: string; route: string; icon?: string }[];
  /** Summary report entries. */
  reports: { id: string; label: string; icon?: string }[];
  /** Account pages every signed-in person has: My Profile, Change Password. */
  accountItems: { id: string; label: string; route: string; icon?: string }[];
}
