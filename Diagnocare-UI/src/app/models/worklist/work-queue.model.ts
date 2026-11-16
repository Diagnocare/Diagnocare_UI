/** Tones reuse the five meanings the dc- kit already defines, so nothing new is learnt. */
export type WorkQueueTone = 'ok' | 'wait' | 'info' | 'danger' | 'idle';

export interface WorkQueueMeta {
  /** What the queue is called. A state, in the user's words. */
  readonly label: string;
  /** What you do to an item in it. Imperative. This is the row's button label. */
  readonly verb: string;
  /** One line under the count, so a tile explains itself without a tooltip. */
  readonly hint: string;
  readonly tone: WorkQueueTone;
  readonly icon: string;
  /**
   * Which roles own this queue day to day. Used to pick the queue a person
   * lands on at login — a technician should open on their own work, not on
   * somebody else's. Role IDs mirror constant/enums.ts.
   */
  readonly ownedByRoleIds: readonly number[];
}

/** The minimum an item must expose for the queue rules to run over it. */
export interface QueueDerivationInput {
  /** 'Cancelled' puts the item in needs-attention regardless of everything else. */
  bookingStatus?: string | null;
  /** Blank until a phlebotomist records collection. */
  samplingDoneAt?: string | null;
  /** How many parameters this test defines. */
  parameterCount?: number | null;
  /** How many of those have a value saved in the database — not typed on screen. */
  savedResultCount?: number | null;
  /** Set once a pathologist signs the report off. */
  verifiedAt?: string | null;
  /** Anything actively blocking: 'Unpaid', 'Render failed', 'Critical value'. */
  blockedReason?: string | null;
  /** Collection boy the sample was sent out with; null when drawn at the lab. */
  collectionAssignedTo?: number | null;
  /** Set when the sample was collected (collection boy or lab). */
  sampleCollectedAt?: string | null;
  /** Set when the lab received a sample brought in by a collection boy. */
  sampleReceivedAt?: string | null;
}

/**
 * The queues, in the order work flows through them.
 *
 * `needs-attention` is deliberately last and deliberately outside the flow: it
 * is not a stage, it is the drawer for anything stuck. An item lands there when
 * something blocks it — unpaid and the report is held, the booking was
 * cancelled, a critical value wants a second opinion, a render failed. It
 * carries its own reason rather than a generic "error", because "unpaid" and
 * "render failed" need different people to do different things.
 */
export type WorkQueue =
  | 'to-collect'
  | 'to-receive'
  | 'awaiting-results'
  | 'partly-entered'
  | 'returned'
  | 'to-verify'
  | 'ready-to-print'
  | 'needs-attention';
