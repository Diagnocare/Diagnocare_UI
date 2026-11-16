export interface DcActionConfig {
  icon: string;
  label: string;
  tone: 'normal' | 'primary' | 'danger';
}

/** One option in a <dc-choice>. */
export interface DcChoiceOption {
  /** The value written to the form control. */
  value: any;
  /** What the user reads. Keep it to one or two words. */
  label: string;
  /** Optional second line: when to pick this one. */
  hint?: string;
  /** Optional Font Awesome glyph, e.g. 'fa-mars'. Decoration only — never the
   *  only way to tell two options apart. */
  icon?: string;
  /** Greys the option out and blocks selection. */
  disabled?: boolean;
}

/** What the operator decided. Emitted on every change, and on confirm. */
export interface DcPaymentDecision {
  /** 'Full' | 'Partial' | 'No Payment' — matches the app's paymentType enum values. */
  type: string;
  /** Amount taken now. */
  amountPaid: number;
  /** Net minus paid. */
  amountPending: number;
  /** 'Cash' | 'Card' | 'UPI' | 'Cheque' | 'TPA' — matches the paymentMode enum. */
  mode: string;
  /** Cash the patient handed over, when known. Null unless paying by cash. */
  cashGiven: number | null;
  /** Change to hand back. 0 when not applicable. */
  changeDue: number;
  /** True when everything needed to save is present. */
  complete: boolean;
}

/** One tile: a queue, how many are in it, and what you do about them. */
export interface DcQueueTab {
  /** Stable key emitted on select — the WorkQueue value. */
  key: string;
  /** The state, in the user's words: "Awaiting results". */
  label: string;
  /** The action, imperative: "Enter results". Printed under the count. */
  hint?: string;
  /** How many items are in this queue right now. */
  count?: number | null;
  /** One of the five kit tones. Colours the top rule and the active state. */
  tone?: 'ok' | 'wait' | 'info' | 'danger' | 'idle';
  icon?: string;
}

/** A secondary detail shown under a record's title. */
export interface DcRecordFact {
  /** Short caption, e.g. 'Age / Sex'. */
  label: string;
  /** The value. Blanks render as '—' rather than collapsing the layout. */
  value: any;
}

/** One label/value line in a <dc-summary>. */
export interface DcSummaryRow {
  label: string;
  /** Anything printable. null/undefined/'' renders as a visible "Not entered". */
  value: any;
  /** Optional: highlight this line (an amount, a warning). */
  tone?: 'normal' | 'strong' | 'warn';
}

/**
 * One test as the picker needs it. Deliberately not `TestItem` — the picker
 * knows nothing about the API, which is what lets it be previewed with sample
 * data and unit-tested without a backend.
 */
export interface DcPickableTest {
  /** Unique code — the identity used everywhere in this component. */
  code: string;
  name: string;
  price: number;
  /** False when the test has no parameters configured, so it cannot be booked. */
  bookable: boolean;
  /** Group name, shown as context on a search result. */
  group?: string;
}

/** A sub-group and the tests inside it. */
export interface DcTestSubGroup {
  id: string;
  name: string;
  tests: DcPickableTest[];
}

/** A top-level group and its sub-groups. */
export interface DcTestGroup {
  id: string;
  name: string;
  subGroups: DcTestSubGroup[];
}

/** One step in a <dc-wizard>. */
export interface DcWizardStep {
  /** Shown in the progress rail and as the heading. Name the task, not the data:
   *  "Who is the patient?" beats "Demographics". */
  title: string;
  /** One line under the heading explaining what to do on this step. */
  hint?: string;
}

/** The actions a row or card can offer. */
export type DcActionType =
  | 'view' | 'edit' | 'print' | 'download' | 'add'
  | 'delete' | 'restore' | 'cancel' | 'pay' | 'results';

/** The five meanings a status can carry. Everything maps onto one of these. */
export type DcTone = 'ok' | 'wait' | 'info' | 'danger' | 'idle';
