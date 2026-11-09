import { WorkQueueTone } from '../worklist/work-queue.model';

/** A big "what do you want to do" button. */
export interface TaskTile {
  label: string;
  hint: string;
  icon: string;
  route: string;
  query?: Record<string, string>;
  /** Items waiting. Null hides the count (unknown, or not a queue). */
  count: number | null;
  tone: 'primary' | 'blue' | 'amber' | 'purple' | 'green';
}

/** One stage of the pipeline strip — a read-out, so there is no route on it. */
export interface PipeStage {
  label: string;
  hint: string;
  icon: string;
  tone: WorkQueueTone;
  count: number | null;
}

export interface BookingRow {
  name: string;
  patientId: string;
  label: string;
  tone: 'ok' | 'info' | 'wait';
}

export interface WeekBar {
  label: string;
  count: number;
  pct: number;
  future: boolean;
  today: boolean;
}
