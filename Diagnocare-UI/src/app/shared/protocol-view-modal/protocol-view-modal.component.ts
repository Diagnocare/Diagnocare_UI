import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { PathTestService } from 'src/app/services/pathTestServices/path-test-service';
import { TestBookingProtocolsDto } from 'src/app/models/path-test/protocol/test-protocol.model';
import { TestProtocolPanelComponent } from 'src/app/shared/test-protocol-panel/test-protocol-panel.component';

/**
 * Read-only viewer for the sample-collection protocols of one or more tests.
 *
 * The booking screens show protocols while a test is being chosen; this shows the same
 * content *after* the booking exists, from the patient's test history — for the collector
 * who has the patient in front of them, and for anyone answering "was this one fasting?"
 * the day after it was booked. It only reads: nothing here links, edits or clears a
 * protocol, which is what keeps it safe to open from a completed booking.
 *
 * Fetches by test code, in one request for the whole set, so a booking with eight tests
 * costs one call rather than eight. The fasting and missing-protocol summaries are hoisted
 * to the top for the same reason they are on the booking screen: they are the two facts
 * that change what someone does next, and they must not be buried under eight panels.
 */
@Component({
  selector: 'app-protocol-view-modal',
  standalone: true,
  imports: [CommonModule, TestProtocolPanelComponent],
  templateUrl: './protocol-view-modal.component.html',
  styleUrls: ['./protocol-view-modal.component.css'],
})
export class ProtocolViewModalComponent implements OnChanges, OnDestroy {
  /** Shows or hides the modal. Loading starts when this turns true. */
  @Input() visible = false;

  /** Test codes to show protocols for, in the order they should be read. */
  @Input() testCodes: string[] = [];

  /** Heading. Kept generic so the modal reads the same wherever it is opened from. */
  @Input() title = 'Sample Collection Protocol';

  /** Context line under the heading — the booking id, or the test's name. */
  @Input() subtitle = '';

  @Output() closed = new EventEmitter<void>();

  groups: TestBookingProtocolsDto[] = [];
  loading = false;
  /** Set when the request itself failed, as opposed to returning nothing. */
  errorMessage = '';

  private readonly destroy$ = new Subject<void>();
  /** Guards against a slower earlier response landing after a newer one. */
  private requestSeq = 0;

  constructor(private pathTestService: PathTestService) {}

  ngOnChanges(changes: SimpleChanges): void {
    // Reload whenever the modal is opened, or the set of tests changes while open. The
    // protocols could have been re-linked since the booking was made, so what is shown is
    // the current instruction, not a snapshot from booking time.
    if (!this.visible) return;
    if (changes['visible'] || changes['testCodes']) {
      this.load();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  close(): void {
    this.closed.emit();
  }

  /** Unique, non-empty codes in the order given. */
  private get codes(): string[] {
    const seen = new Set<string>();
    return (this.testCodes ?? [])
      .filter(c => !!c && c.trim().length > 0)
      .map(c => c.trim())
      .filter(c => (seen.has(c) ? false : (seen.add(c), true)));
  }

  private load(): void {
    const codes = this.codes;
    this.errorMessage = '';

    if (codes.length === 0) {
      this.groups = [];
      this.loading = false;
      return;
    }

    const seq = ++this.requestSeq;
    this.loading = true;

    this.pathTestService
      .getTestProtocolsByCodes(codes)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: groups => {
          if (seq !== this.requestSeq) return;
          this.groups = groups ?? [];
          this.loading = false;
        },
        // A transport failure is not the same as "no protocol linked", and must not be
        // shown as one — a collector reading "no special requirements" when the server
        // simply could not be reached is the failure mode this whole panel exists to avoid.
        error: () => {
          if (seq !== this.requestSeq) return;
          this.groups = [];
          this.loading = false;
          this.errorMessage =
            'Could not load the sample collection protocol. Check with the laboratory before collecting.';
        },
      });
  }

  get hasGroups(): boolean {
    return this.groups.length > 0;
  }

  /** Tests in this set with no protocol linked at all. */
  get testsMissingProtocol(): TestBookingProtocolsDto[] {
    return this.groups.filter(g => !g.protocols?.length);
  }

  /**
   * Tests requiring fasting, with the longest fast each one demands.
   *
   * The longest, not the first: a test collected under two protocols of 8 and 12 hours is
   * a 12-hour fast, and telling the patient 8 would waste their trip.
   */
  get fastingTests(): { testName: string; hours: number | null }[] {
    return this.groups
      .map(g => {
        const fasting = (g.protocols ?? []).filter(p => p.fastingRequired);
        if (fasting.length === 0) return null;
        const hours = fasting.reduce<number | null>(
          (max, p) => (p.fastingHours != null && (max == null || p.fastingHours > max) ? p.fastingHours : max),
          null,
        );
        return { testName: g.testName, hours };
      })
      .filter((x): x is { testName: string; hours: number | null } => x !== null);
  }

  fastingText(t: { testName: string; hours: number | null }): string {
    return t.hours && t.hours > 0 ? `${t.testName} — ${t.hours} h` : t.testName;
  }

  trackByGroup(_i: number, g: TestBookingProtocolsDto): string {
    return g.testCode;
  }
}
