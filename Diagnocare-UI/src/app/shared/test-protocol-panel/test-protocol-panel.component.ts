import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

import { TestProtocolDto } from 'src/app/models/path-test/protocol/test-protocol.model';

/**
 * Renders the sample-collection protocols for one test — sample type, patient preparation,
 * procedure, quantity, storage and rejection criteria, for each protocol the test is
 * collected under.
 *
 * Takes a list rather than a single protocol because a test can genuinely need several: a
 * profile spanning blood and urine, a tolerance test repeating a draw, a culture needing two
 * sets. They are numbered and shown in the order the lab put them in, so the collector works
 * through a sequence rather than guessing which parts of one long block apply to them.
 *
 * Presentational only. Every screen that shows protocols uses this component, so the fasting
 * badge, the numbering and the wording of the empty state are decided once. It never fetches
 * and never writes.
 *
 * The empty state is the point of the whole component. A protocol section that renders
 * nothing reads as "nothing special is required", which is exactly the wrong conclusion for
 * a test whose requirements were simply never linked — so an absent protocol is stated in
 * words instead of left blank.
 */
@Component({
  selector: 'app-test-protocol-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './test-protocol-panel.component.html',
  styleUrls: ['./test-protocol-panel.component.css'],
})
export class TestProtocolPanelComponent {
  /**
   * The protocols to render, in collection order. An empty array means "none linked" and
   * shows the fallback; null means nothing has been asked for yet.
   */
  @Input() protocols: TestProtocolDto[] | null = null;

  /** The test these protocols belong to. Shown in the heading. */
  @Input() testName = '';
  @Input() testCode = '';

  /** Shows the loading state instead of the panel body. */
  @Input() loading = false;

  /** Renders the test's name and code as a heading. Off where the caller already shows it. */
  @Input() showHeading = true;

  /**
   * Collapses each protocol to sample type, container, quantity and the fasting badge.
   * Used in the multi-test summary, where the full procedure for eight tests at once would
   * bury the one line the operator actually needs before the patient leaves.
   */
  @Input() compact = false;

  /** Shown in place of the panel when no test is selected yet. */
  @Input() emptySelectionMessage = 'Select a test to see its sample collection protocol.';

  /** True once a fetch has completed, whatever it returned. */
  get hasAnswer(): boolean {
    return this.protocols !== null;
  }

  get hasProtocols(): boolean {
    return (this.protocols?.length ?? 0) > 0;
  }

  /** Numbered only when there is more than one — "1 of 1" is noise. */
  get showSequence(): boolean {
    return (this.protocols?.length ?? 0) > 1;
  }

  fastingLabel(p: TestProtocolDto): string {
    if (!p.fastingRequired) return 'No fasting required';
    return p.fastingHours && p.fastingHours > 0
      ? `Fasting required — ${p.fastingHours} hours`
      : 'Fasting required';
  }

  /** True when at least one of a protocol's detail sections has something to show. */
  hasDetailSections(p: TestProtocolDto): boolean {
    return !!(
      p.patientPreparation ||
      p.collectionProcedure ||
      p.storageTransport ||
      p.precautions ||
      p.rejectionCriteria
    );
  }

  /** Keeps the *ngFor stable while a protocol's content is being re-fetched. */
  trackByProtocol(_index: number, p: TestProtocolDto): number {
    return p.protocolId;
  }
}
