import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';

import { PathTestService } from 'src/app/services/pathTestServices/path-test-service';
import { TestItem } from 'src/app/models/path-test/test/test.model';
import {
  TestProtocolDto,
  TestProtocolSuggestionDto,
  TestProtocolSummaryDto,
  duplicateProtocol,
  emptyTestProtocol,
  toProtocolSaveDto,
} from 'src/app/models/path-test/protocol/test-protocol.model';
import { TestProtocolPanelComponent } from 'src/app/shared/test-protocol-panel/test-protocol-panel.component';
import { ConfirmModalService } from 'src/app/shared/confirm-modal/confirm-modal.service';

/** One protocol linked to the test, as the editor holds it before saving. */
interface LinkedRow {
  protocol: TestProtocolSummaryDto;
  note: string | null;
}

/**
 * Admin screen for a test's sample-collection protocols, opened from the Master Test List.
 *
 * Two jobs in one place, because they are one job in practice: choosing which protocols a
 * test is collected under, and writing a protocol that does not exist yet. An admin who
 * discovers mid-association that the library is missing something should not have to leave,
 * find another screen, and come back having lost their selection.
 *
 * The association is an ordered list, not a set. A test needing a blood draw and a urine
 * collection needs them in an order, and each link carries its own note ("second draw, 2
 * hours after the first") because what varies between tests is the sequence and the context,
 * not the protocol that a dozen other tests share.
 *
 * Standard protocols are read-only. A lab that needs a variant duplicates one and edits the
 * copy, so "standard protocol" keeps meaning the same thing everywhere and a later seed
 * correction cannot silently overwrite local edits.
 */
@Component({
  selector: 'app-test-protocol-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, TestProtocolPanelComponent],
  templateUrl: './test-protocol-modal.component.html',
  styleUrls: ['./test-protocol-modal.component.scss'],
})
export class TestProtocolModalComponent implements OnInit, OnDestroy {
  /** The test whose protocols are being managed. */
  @Input() test!: TestItem;

  @Output() closed = new EventEmitter<void>();
  /** Emitted after a successful save, so the parent can refresh if it needs to. */
  @Output() saved = new EventEmitter<void>();

  /** Which pane is showing: the association list, or the protocol editor. */
  view: 'assign' | 'edit' = 'assign';

  // ── Association state ─────────────────────────────────────────────────────
  library: TestProtocolSummaryDto[] = [];
  linked: LinkedRow[] = [];
  suggestion: TestProtocolSuggestionDto | null = null;
  query = '';

  /** Full content of the protocol being previewed, keyed by the row the user clicked. */
  previewProtocol: TestProtocolDto | null = null;
  previewProtocolId: number | null = null;
  previewLoading = false;

  // ── Editor state ──────────────────────────────────────────────────────────
  /** The protocol being written. protocolId 0 means it is new. */
  editorForm: TestProtocolDto = emptyTestProtocol();
  editorSubmitAttempted = false;
  /** Set when the editor was opened by duplicating a standard protocol. */
  editorIsDuplicate = false;

  loading = false;
  saving = false;

  private destroy$ = new Subject<void>();

  constructor(
    private _pathTest: PathTestService,
    private toastr: ToastrService,
    private _confirmModal: ConfirmModalService,
  ) {}

  ngOnInit(): void {
    this.load();
    window.addEventListener('hashchange', this.handleHashChange);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    window.removeEventListener('hashchange', this.handleHashChange);
  }

  private handleHashChange = () => this.close();

  // ── Loading ───────────────────────────────────────────────────────────────

  /**
   * Loads the library, this test's current links and the name-based suggestion together.
   *
   * forkJoin rather than three sequential calls: the screen is unusable until all three are
   * in, and staging them would only make the spinner last longer. Each is individually
   * caught so one failure degrades that part rather than blanking the screen — a missing
   * suggestion is an inconvenience, a missing library is not worth pretending about.
   */
  private load(): void {
    const testRegId = this.test?.testRegId ?? 0;
    if (!testRegId) return;

    this.loading = true;

    forkJoin({
      library: this._pathTest.getProtocolLibrary().pipe(catchError(() => of([] as TestProtocolSummaryDto[]))),
      linked: this._pathTest.getTestProtocols(testRegId).pipe(catchError(() => of([] as TestProtocolDto[]))),
      suggestion: this._pathTest.suggestTestProtocol(testRegId).pipe(
        catchError(() => of(null as TestProtocolSuggestionDto | null))
      ),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: ({ library, linked, suggestion }) => {
        this.library = library ?? [];
        this.suggestion = suggestion;

        // The linked list arrives as full protocols; the association pane works in
        // summaries, so match each back to its library row. A link whose protocol is not
        // in the library should be impossible — but if it happens, keep the link rather
        // than silently dropping it from a list the admin is about to save back.
        const byId = new Map(this.library.map(p => [p.protocolId, p]));
        this.linked = (linked ?? []).map(p => ({
          protocol: byId.get(p.protocolId) ?? this.toSummary(p),
          note: p.note,
        }));

        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  /** Falls back to a summary built from a full protocol, for a link missing from the library. */
  private toSummary(p: TestProtocolDto): TestProtocolSummaryDto {
    return {
      protocolId: p.protocolId,
      protocolCode: p.protocolCode,
      protocolName: p.protocolName,
      sampleType: p.sampleType,
      containerType: p.containerType,
      fastingRequired: p.fastingRequired,
      fastingHours: p.fastingHours,
      isSystem: p.isSystem,
      linkedTestCount: 0,
    };
  }

  // ── Association ───────────────────────────────────────────────────────────

  get filteredLibrary(): TestProtocolSummaryDto[] {
    const q = this.query.trim().toLowerCase();
    if (!q) return this.library;
    return this.library.filter(p =>
      `${p.protocolCode} ${p.protocolName} ${p.sampleType}`.toLowerCase().includes(q)
    );
  }

  isLinked(protocolId: number): boolean {
    return this.linked.some(l => l.protocol.protocolId === protocolId);
  }

  /** True when a suggestion exists and is not already in the list. */
  get showSuggestion(): boolean {
    const p = this.suggestion?.suggestedProtocol;
    return !!p && !this.isLinked(p.protocolId);
  }

  toggleLink(protocol: TestProtocolSummaryDto): void {
    if (this.isLinked(protocol.protocolId)) {
      this.linked = this.linked.filter(l => l.protocol.protocolId !== protocol.protocolId);
      return;
    }
    this.linked = [...this.linked, { protocol, note: null }];
  }

  removeLink(index: number): void {
    this.linked = this.linked.filter((_, i) => i !== index);
  }

  moveUp(index: number): void {
    if (index <= 0) return;
    const next = [...this.linked];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    this.linked = next;
  }

  moveDown(index: number): void {
    if (index >= this.linked.length - 1) return;
    const next = [...this.linked];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    this.linked = next;
  }

  applySuggestion(): void {
    const p = this.suggestion?.suggestedProtocol;
    if (!p || this.isLinked(p.protocolId)) return;
    this.toggleLink(p);
    this.toastr.info(
      `${p.protocolName} added. Check it is right for this test before saving.`,
      'Suggestion added'
    );
  }

  /** Loads and shows a protocol's full content, or collapses it if already open. */
  preview(protocolId: number): void {
    if (this.previewProtocolId === protocolId) {
      this.previewProtocolId = null;
      this.previewProtocol = null;
      return;
    }

    this.previewProtocolId = protocolId;
    this.previewProtocol = null;
    this.previewLoading = true;

    this._pathTest.getProtocol(protocolId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (protocol) => {
        // Ignore a response for a protocol the user has since moved off.
        if (this.previewProtocolId !== protocolId) return;
        this.previewProtocol = protocol;
        this.previewLoading = false;
      },
      // Message shown centrally by ErrorInterceptor.
      error: () => {
        if (this.previewProtocolId !== protocolId) return;
        this.previewProtocol = null;
        this.previewLoading = false;
      },
    });
  }

  /** The preview as the panel wants it — a one-item list, or empty while loading. */
  get previewList(): TestProtocolDto[] | null {
    return this.previewProtocol ? [this.previewProtocol] : null;
  }

  saveAssignments(): void {
    if (this.saving) return;

    this.saving = true;
    this._pathTest.saveTestProtocolAssignments({
      testRegId: this.test.testRegId,
      assignments: this.linked.map((l, i) => ({
        protocolId: l.protocol.protocolId,
        displayOrder: i,
        note: l.note?.trim() || null,
      })),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.saving = false;
        this.toastr.success(
          this.linked.length === 0
            ? `All protocols removed from ${this.test.testName}.`
            : `${this.linked.length} protocol${this.linked.length === 1 ? '' : 's'} saved for ${this.test.testName}.`,
          'Protocols saved'
        );
        this.saved.emit();
        this.close();
      },
      // Message shown centrally by ErrorInterceptor.
      error: () => {
        this.saving = false;
      },
    });
  }

  // ── Library editor ────────────────────────────────────────────────────────

  newProtocol(): void {
    this.editorForm = emptyTestProtocol();
    this.editorSubmitAttempted = false;
    this.editorIsDuplicate = false;
    this.view = 'edit';
  }

  /**
   * Opens a protocol in the editor, or as a duplicate when it is a standard one.
   *
   * Fetches the full content first — the library list only carries the summary, and an
   * editor pre-filled with half the fields blank would silently wipe the rest on save.
   */
  openInEditor(protocol: TestProtocolSummaryDto, asDuplicate: boolean): void {
    this.loading = true;
    this._pathTest.getProtocol(protocol.protocolId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (full) => {
        this.editorForm = asDuplicate ? duplicateProtocol(full) : { ...full };
        this.editorIsDuplicate = asDuplicate;
        this.editorSubmitAttempted = false;
        this.view = 'edit';
        this.loading = false;
      },
      // Message shown centrally by ErrorInterceptor.
      error: () => {
        this.loading = false;
      },
    });
  }

  get editorSampleTypeMissing(): boolean {
    return !this.editorForm.sampleType?.trim();
  }

  get editorCodeMissing(): boolean {
    return !this.editorForm.protocolCode?.trim();
  }

  get editorNameMissing(): boolean {
    return !this.editorForm.protocolName?.trim();
  }

  onEditorFastingChange(): void {
    // Fasting hours only mean something when fasting is required — clearing them keeps a
    // stale "12" from reappearing if the flag is toggled back on later.
    if (!this.editorForm.fastingRequired) this.editorForm.fastingHours = null;
  }

  /**
   * Saves the protocol, then returns to the association pane with it linked.
   *
   * Auto-linking on create is deliberate: an admin only leaves the association screen to
   * write a protocol because the test needs it. Making them find it in the library
   * afterwards would be a step that exists for no reason.
   */
  saveProtocol(): void {
    this.editorSubmitAttempted = true;

    if (this.editorCodeMissing || this.editorNameMissing || this.editorSampleTypeMissing) {
      this.toastr.warning('Protocol code, name and sample type are required.', 'Incomplete protocol');
      return;
    }
    if (this.saving) return;

    const isNew = this.editorForm.protocolId <= 0;
    const savedCode = this.editorForm.protocolCode.trim();
    this.saving = true;

    this._pathTest.saveProtocol(toProtocolSaveDto(this.editorForm))
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.saving = false;
          this.toastr.success(
            isNew ? `${this.editorForm.protocolName} added to the library.` : 'Protocol updated.',
            'Protocol saved'
          );
          this.refreshLibraryAfterSave(savedCode, isNew);
        },
        // Message shown centrally by ErrorInterceptor.
        error: () => {
          this.saving = false;
        },
      });
  }

  /**
   * Reloads the library and returns to the association pane, linking a newly created
   * protocol on the way.
   *
   * Matched on the protocol code rather than an id returned from the save: the save
   * endpoint answers with an OperationResult, whose third field is a generic string slot
   * named for a different purpose, and threading a new id through it would be a trap for
   * whoever reads this next. The code is unique, enforced by the API, and the admin just
   * typed it — it identifies the row without inventing a channel for it.
   */
  private refreshLibraryAfterSave(savedCode: string, linkIt: boolean): void {
    this._pathTest.getProtocolLibrary().pipe(takeUntil(this.destroy$)).subscribe({
      next: (library) => {
        this.library = library ?? [];

        // The preview holds a copy of the protocol fetched before the edit. Leaving it open
        // would show the admin the instructions they just replaced, seconds after replacing
        // them — the one moment they are most likely to trust what is on screen.
        this.previewProtocolId = null;
        this.previewProtocol = null;

        // Keep the linked rows pointing at refreshed library objects so an edited name
        // shows through immediately in the list the admin is about to save.
        const byId = new Map(this.library.map(p => [p.protocolId, p]));
        this.linked = this.linked.map(l => ({
          protocol: byId.get(l.protocol.protocolId) ?? l.protocol,
          note: l.note,
        }));

        if (linkIt) {
          const created = this.library.find(
            p => p.protocolCode.toLowerCase() === savedCode.toLowerCase()
          );
          // Not found means the reload raced the write; the protocol is saved either way,
          // and the admin can tick it in the list they are looking at.
          if (created && !this.isLinked(created.protocolId)) {
            this.linked = [...this.linked, { protocol: created, note: null }];
          }
        }

        this.view = 'assign';
      },
      error: () => {
        this.view = 'assign';
      },
    });
  }

  cancelEditor(): void {
    this.view = 'assign';
    this.editorSubmitAttempted = false;
  }

  deleteProtocol(protocol: TestProtocolSummaryDto): void {
    if (protocol.isSystem) return;

    const inUse = protocol.linkedTestCount > 0
      ? ` It is currently linked to ${protocol.linkedTestCount} test${protocol.linkedTestCount === 1 ? '' : 's'}, and cannot be deleted until those links are removed.`
      : '';

    this._confirmModal.confirm({
      title: 'Delete protocol',
      message: `Delete "${protocol.protocolName}" from the protocol library?${inUse}`,
      confirmText: 'Yes, Delete',
      cancelText: 'Cancel',
    }).pipe(takeUntil(this.destroy$)).subscribe(confirmed => {
      if (!confirmed) return;

      this._pathTest.deleteProtocol(protocol.protocolId).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.toastr.success('Protocol deleted.', 'Protocol removed');
          this.library = this.library.filter(p => p.protocolId !== protocol.protocolId);
          this.linked = this.linked.filter(l => l.protocol.protocolId !== protocol.protocolId);
          if (this.previewProtocolId === protocol.protocolId) {
            this.previewProtocolId = null;
            this.previewProtocol = null;
          }
        },
        // Message shown centrally by ErrorInterceptor — including the "still in use" refusal.
        error: () => {},
      });
    });
  }

  close(): void {
    if (this.saving) return;
    this.closed.emit();
  }

  trackByProtocolId(_index: number, p: TestProtocolSummaryDto): number {
    return p.protocolId;
  }

  trackByLink(_index: number, l: LinkedRow): number {
    return l.protocol.protocolId;
  }
}
