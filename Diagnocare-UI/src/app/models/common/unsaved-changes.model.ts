export interface UnsavedChangesOptions {
  /** Number of dirty changes — shown in the dialog body. */
  changeCount: number;
  /** Optional extra context line, e.g. "for this week". */
  context?: string;
}

/** What the user chose in the unsaved-changes dialog. */
export type UnsavedChangesResult = 'save' | 'discard' | 'cancel';
