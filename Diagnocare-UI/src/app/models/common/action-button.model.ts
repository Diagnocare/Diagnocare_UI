export interface ActionConfig {
  cssClass: string;
  icon: string;
  defaultTitle: string;
}

/**
 * Supported action-button types.
 * Each type has a fixed icon and colour — only the click handler and optional
 * title override change per usage site.
 */
export type ActionButtonType = 'view' | 'edit' | 'delete' | 'print' | 'download' | 'reactivate' | 'hard-delete';
