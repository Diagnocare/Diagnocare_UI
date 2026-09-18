/**
 * Diagnocare — Simple UI kit
 * ─────────────────────────────────────────────────────────────────────────────
 * Building blocks for screens used by people who are not comfortable with
 * computers. Import from this barrel:
 *
 *   import { DcFieldComponent, DcChoiceComponent } from '../../shared/simple';
 *
 *   @Component({
 *     standalone: true,
 *     imports: [CommonModule, ReactiveFormsModule, DcFieldComponent, DcChoiceComponent],
 *     …
 *   })
 *
 * Every component here is standalone, so you add exactly the ones a screen
 * uses and nothing else is bundled.
 *
 * See README.md in this folder for what each one is for and when NOT to use it.
 */

export * from './dc-field.component';
export * from './dc-choice.component';
export * from './dc-number.component';
export * from './dc-search.component';
export * from './dc-task-tile.component';
export * from './dc-wizard.component';
export * from './dc-status.component';
export * from './dc-action.component';
export * from './dc-record.component';
export * from './dc-summary.component';
export * from './dc-empty.component';
export * from './dc-note.component';
export * from './dc-save-bar.component';
export * from './dc-test-picker.component';
export * from './dc-payment-panel.component';
export * from './simple-ui.flags';

import { DcFieldComponent } from './dc-field.component';
import { DcChoiceComponent } from './dc-choice.component';
import { DcNumberComponent } from './dc-number.component';
import { DcSearchComponent } from './dc-search.component';
import { DcTaskTileComponent } from './dc-task-tile.component';
import { DcWizardComponent } from './dc-wizard.component';
import { DcStatusComponent } from './dc-status.component';
import { DcActionComponent } from './dc-action.component';
import { DcRecordComponent } from './dc-record.component';
import { DcSummaryComponent } from './dc-summary.component';
import { DcEmptyComponent } from './dc-empty.component';
import { DcNoteComponent } from './dc-note.component';
import { DcSaveBarComponent } from './dc-save-bar.component';
import { DcTestPickerComponent } from './dc-test-picker.component';
import { DcPaymentPanelComponent } from './dc-payment-panel.component';

/**
 * Convenience bundle for a screen that uses most of the kit. Prefer importing
 * the individual components you need — this exists so a quick prototype does
 * not stall on an import list.
 *
 *   imports: [CommonModule, ReactiveFormsModule, ...SIMPLE_UI]
 */
export const SIMPLE_UI = [
  DcFieldComponent,
  DcChoiceComponent,
  DcNumberComponent,
  DcSearchComponent,
  DcTaskTileComponent,
  DcWizardComponent,
  DcStatusComponent,
  DcActionComponent,
  DcRecordComponent,
  DcSummaryComponent,
  DcEmptyComponent,
  DcNoteComponent,
  DcSaveBarComponent,
  DcTestPickerComponent,
  DcPaymentPanelComponent,
] as const;
