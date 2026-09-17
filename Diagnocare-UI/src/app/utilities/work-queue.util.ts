/**
 * Work queue model — the spine of the worklist.
 * ─────────────────────────────────────────────────────────────────────────────
 * The old module asked the user to pick a filter. This asks nothing: every unit
 * of work sits in exactly one queue, and the queue it sits in names the action
 * it needs. "Which filter do I use for this?" stops being a question a person
 * can have, because there are no filters to choose between.
 *
 * Two rules make that hold, and both are load-bearing:
 *
 *   1. The queues are mutually exclusive and exhaustive. Every non-cancelled
 *      test is in exactly one. That is what makes a count of zero trustworthy —
 *      with overlapping filters, an empty list never proves there is no work.
 *
 *   2. Each queue carries a verb, not a noun. "Awaiting results" is a state;
 *      "Enter results" is what you do about it. The UI shows both, so the
 *      status *is* the instruction and nothing has to be memorised.
 *
 * The API derives which queue an item is in (see WorklistService on the server —
 * the same rules, in the same order). This file owns how a queue is *presented*:
 * its words, its colour, its glyph and its verb. One table, so a queue looks and
 * reads identically on the worklist, on a patient's record and on a printed
 * hand-over sheet.
 */

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
  | 'awaiting-results'
  | 'partly-entered'
  | 'returned'
  | 'to-verify'
  | 'ready-to-print'
  | 'needs-attention';

/** Display order — also the order the tiles appear in, left to right. */
export const WORK_QUEUE_ORDER: readonly WorkQueue[] = [
  'to-collect',
  'awaiting-results',
  'partly-entered',
  'returned',
  'to-verify',
  'ready-to-print',
  'needs-attention',
] as const;

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

/**
 * The single source of truth for queue vocabulary.
 *
 * Note what is *not* here: the words "Pending", "Partial" and "Completed". They
 * were doing three jobs at once in the old module — patient status, report
 * status and payment status — so a badge could only be read by knowing which
 * column it sat in. Every word below appears in exactly one place in the app.
 */
export const WORK_QUEUE_META: Readonly<Record<WorkQueue, WorkQueueMeta>> = {
  'to-collect': {
    label: 'To collect',
    verb: 'Mark sample collected',
    hint: 'Take the sample',
    tone: 'idle',
    icon: 'fa-flask',
    ownedByRoleIds: [1, 5],            // Receptionist, Collection Boy
  },
  'awaiting-results': {
    label: 'Awaiting results',
    verb: 'Enter results',
    hint: 'Enter results',
    tone: 'info',
    icon: 'fa-hourglass-half',
    ownedByRoleIds: [2],               // Lab Assistant
  },
  'partly-entered': {
    label: 'Partly entered',
    verb: 'Finish results',
    hint: 'Finish results',
    tone: 'wait',
    icon: 'fa-adjust',
    ownedByRoleIds: [2],               // Lab Assistant
  },
  returned: {
    label: 'Returned',
    verb: 'Redo results',
    hint: 'Sent back — fix it',
    // Amber, not red: this is ordinary bench work with a note attached, and it
    // can be acted on immediately. Red belongs to needs-attention, where nobody
    // can proceed at all — two red tiles would flatten that distinction.
    tone: 'wait',
    icon: 'fa-reply',
    ownedByRoleIds: [2],               // Lab Assistant
  },
  'to-verify': {
    label: 'To verify',
    verb: 'Verify & issue',
    hint: 'Check and sign',
    tone: 'wait',
    icon: 'fa-user-md',
    ownedByRoleIds: [3, 4, 6],         // Admin, Super Admin, Doctor
  },
  'ready-to-print': {
    label: 'Ready to print',
    verb: 'Print',
    hint: 'Hand over',
    tone: 'ok',
    icon: 'fa-print',
    ownedByRoleIds: [1],               // Receptionist
  },
  'needs-attention': {
    label: 'Needs attention',
    verb: 'Resolve',
    hint: 'Something is blocking',
    tone: 'danger',
    icon: 'fa-exclamation-triangle',
    ownedByRoleIds: [1, 2, 3, 4],
  },
};

/** Queue label, or a readable fallback for a value the API adds later. */
export function queueLabel(queue: WorkQueue | string | null | undefined): string {
  return WORK_QUEUE_META[queue as WorkQueue]?.label ?? 'Unknown';
}

/** The imperative a row's primary button should carry. */
export function queueVerb(queue: WorkQueue | string | null | undefined): string {
  return WORK_QUEUE_META[queue as WorkQueue]?.verb ?? 'Open';
}

export function queueTone(queue: WorkQueue | string | null | undefined): WorkQueueTone {
  return WORK_QUEUE_META[queue as WorkQueue]?.tone ?? 'idle';
}

export function queueIcon(queue: WorkQueue | string | null | undefined): string {
  return WORK_QUEUE_META[queue as WorkQueue]?.icon ?? 'fa-circle-o';
}

/**
 * The queue a given role should land on after login.
 *
 * Falls back to 'awaiting-results' — the largest queue in a working lab, and
 * the one where landing wrongly costs least. Never returns 'needs-attention':
 * opening the app on a list of problems is a bad first impression and, more
 * practically, it is usually empty, which makes the app look broken.
 */
export function defaultQueueForRole(roleId: number | null | undefined): WorkQueue {
  if (roleId == null) return 'awaiting-results';
  const match = WORK_QUEUE_ORDER.find(
    q => q !== 'needs-attention' && WORK_QUEUE_META[q].ownedByRoleIds.includes(roleId),
  );
  return match ?? 'awaiting-results';
}

// ─── Client-side derivation ───────────────────────────────────────────────────

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
}

/**
 * Works out which queue an item belongs in.
 *
 * The API is the authority and returns `queue` on every row; this exists so the
 * same rules can be applied client-side to data that came from the older
 * endpoints, and so the rules can be unit-tested without a database. Keep it in
 * step with WorklistService.ResolveQueue on the server — the order of the
 * checks is the specification, not an implementation detail.
 */
export function deriveQueue(item: QueueDerivationInput): WorkQueue {
  // A blocker outranks progress: an unpaid, cancelled or failed item must not
  // sit quietly in a work queue where it looks like ordinary outstanding work.
  if ((item.bookingStatus || '').trim().toLowerCase() === 'cancelled') return 'needs-attention';
  if ((item.blockedReason || '').trim()) return 'needs-attention';

  // Signed off — the report exists and the only thing left is handing it over.
  if ((item.verifiedAt || '').trim()) return 'ready-to-print';

  // Nothing can be entered before there is a sample to run.
  if (!(item.samplingDoneAt || '').trim()) return 'to-collect';

  const total = item.parameterCount ?? 0;
  const saved = item.savedResultCount ?? 0;

  // A test with no parameters configured cannot be progressed by a technician
  // and would otherwise sit in "awaiting results" forever, silently.
  if (total === 0) return 'needs-attention';

  if (saved === 0) return 'awaiting-results';
  if (saved < total) return 'partly-entered';
  return 'to-verify';
}

/**
 * Plain-language progress, e.g. "9 of 21 entered".
 *
 * Deliberately a fraction rather than a word. "Partial" tells someone there is
 * work left but not how much, so they have to open the item to find out; a
 * fraction answers it from the list. It is also the one label that needs no
 * translation into lab vocabulary.
 */
export function progressLabel(saved: number, total: number): string {
  if (total <= 0) return 'No parameters set up';
  if (saved <= 0) return `0 of ${total} entered`;
  if (saved >= total) return `All ${total} entered`;
  return `${saved} of ${total} entered`;
}

/**
 * How long something has been waiting, as a person would say it.
 *
 * Turnaround is the number a lab is judged on, so it belongs on the row rather
 * than behind a hover. Anything under a minute reads as "just now" — a row that
 * appears saying "0m" looks like a bug.
 */
export function waitingLabel(since: string | Date | null | undefined): string {
  if (!since) return '';
  const start = since instanceof Date ? since : new Date(since);
  if (isNaN(start.getTime())) return '';

  const minutes = Math.floor((Date.now() - start.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rem = minutes % 60;
    return rem ? `${hours}h ${rem}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day' : `${days} days`;
}

/**
 * Urgency of the wait, for colouring the elapsed-time chip.
 *
 * Thresholds are deliberately generous: a routine test that has been waiting
 * three hours is not late, and colouring it red teaches people to ignore red.
 * An urgent booking is held to a tighter clock because that is what "urgent"
 * was meant to buy.
 */
export function waitingTone(
  since: string | Date | null | undefined,
  urgent = false,
): WorkQueueTone {
  if (!since) return 'idle';
  const start = since instanceof Date ? since : new Date(since);
  if (isNaN(start.getTime())) return 'idle';

  const hours = (Date.now() - start.getTime()) / 3_600_000;
  const warn = urgent ? 2 : 8;
  const late = urgent ? 4 : 24;

  if (hours >= late) return 'danger';
  if (hours >= warn) return 'wait';
  return 'idle';
}
