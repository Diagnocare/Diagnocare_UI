import { CommonModule } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { TestImportService } from 'src/app/services/pathTestServices/test-import.service';
import {
  TestImportCommitResult,
  TestImportMode,
  TestImportPreview,
  TestImportRowResult,
  TestImportRowStatus,
} from 'src/app/models/path-test/import/test-import.model';
import { DcNoteComponent, DcStatusComponent, DcTone } from 'src/app/shared/simple';

type RowFilter = 'all' | 'problems' | 'New' | 'Update' | 'Unchanged';

/**
 * Import the test catalogue from a spreadsheet.
 *
 * Four steps on one page — get the template, upload, check the preview, import — because
 * the person doing this is usually setting up a new lab and has never seen the catalogue
 * screens. Nothing is saved until the last step, and the Import button explains itself
 * whenever it is disabled.
 */
@Component({
  selector: 'app-import-tests',
  standalone: true,
  imports: [CommonModule, FormsModule, DcNoteComponent, DcStatusComponent],
  templateUrl: './import-tests.component.html',
  styleUrls: ['./import-tests.component.scss'],
})
export class ImportTestsComponent implements OnDestroy {
  readonly TestImportMode = TestImportMode;
  readonly maxFileMb = 5;

  file: File | null = null;
  dragOver = false;

  preview: TestImportPreview | null = null;
  result: TestImportCommitResult | null = null;
  mode: TestImportMode = TestImportMode.SkipExisting;
  filter: RowFilter = 'all';

  /** How many rows the table draws at once. A 5,000-row preview is readable a page at a time. */
  pageSize = 200;
  visibleCount = this.pageSize;

  downloadingTemplate = false;
  uploading = false;
  committing = false;
  downloadingReport = false;

  private destroy$ = new Subject<void>();

  constructor(
    private importService: TestImportService,
    private toastr: ToastrService,
    private router: Router,
  ) {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── step 1: template ──────────────────────────────────────────────────────

  downloadTemplate(): void {
    this.downloadingTemplate = true;
    this.importService.downloadTemplate().pipe(
      takeUntil(this.destroy$),
      finalize(() => (this.downloadingTemplate = false)),
    ).subscribe({
      next: blob => this.importService.saveBlob(blob, 'test-catalogue-template.xlsx'),
      error: () => { /* message shown centrally by ErrorInterceptor */ },
    });
  }

  // ── step 2: upload ────────────────────────────────────────────────────────

  onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.pick(input.files?.[0] ?? null);
    input.value = '';   // choosing the same file again after fixing it must still fire
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver = false;
    this.pick(event.dataTransfer?.files?.[0] ?? null);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragOver = true;
  }

  private pick(file: File | null): void {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.csv')) {
      this.toastr.warning('Choose an Excel (.xlsx) or CSV file. Older .xls files: open in Excel and "Save As" .xlsx.', 'Wrong file type');
      return;
    }
    if (file.size > this.maxFileMb * 1024 * 1024) {
      this.toastr.warning(`The file is larger than ${this.maxFileMb} MB. Split it into smaller files.`, 'File too large');
      return;
    }
    this.file = file;
    this.upload();
  }

  upload(): void {
    if (!this.file) return;
    this.uploading = true;
    this.preview = null;
    this.result = null;
    this.importService.preview(this.file).pipe(
      takeUntil(this.destroy$),
      finalize(() => (this.uploading = false)),
    ).subscribe({
      next: preview => {
        this.preview = preview;
        this.visibleCount = this.pageSize;
        // Straight to the problems when there are any — they are what the user has to act on.
        this.filter = preview.errorRows > 0 ? 'problems' : 'all';
      },
      error: () => { /* message shown centrally by ErrorInterceptor */ },
    });
  }

  startOver(): void {
    this.file = null;
    this.preview = null;
    this.result = null;
    this.mode = TestImportMode.SkipExisting;
    this.filter = 'all';
  }

  // ── step 3: preview ───────────────────────────────────────────────────────

  get filteredRows(): TestImportRowResult[] {
    const rows = this.preview?.rows ?? [];
    switch (this.filter) {
      case 'problems': return rows.filter(r => r.errors.length > 0 || r.warnings.length > 0);
      case 'all': return rows;
      default: return rows.filter(r => r.status === this.filter);
    }
  }

  get visibleRows(): TestImportRowResult[] {
    return this.filteredRows.slice(0, this.visibleCount);
  }

  showMore(): void {
    this.visibleCount += this.pageSize;
  }

  setFilter(filter: RowFilter): void {
    this.filter = filter;
    this.visibleCount = this.pageSize;
  }

  get problemRows(): number {
    return (this.preview?.rows ?? []).filter(r => r.errors.length > 0 || r.warnings.length > 0).length;
  }

  statusTone(status: TestImportRowStatus): DcTone {
    switch (status) {
      case 'New': return 'ok';
      case 'Update': return 'info';
      case 'Error': return 'danger';
      default: return 'idle';
    }
  }

  statusIcon(status: TestImportRowStatus): string {
    switch (status) {
      case 'New': return 'fa-plus-circle';
      case 'Update': return 'fa-pencil';
      case 'Error': return 'fa-times-circle';
      default: return 'fa-minus-circle';
    }
  }

  downloadErrorReport(): void {
    if (!this.preview?.importToken) return;
    this.downloadingReport = true;
    this.importService.downloadErrorReport(this.preview.importToken).pipe(
      takeUntil(this.destroy$),
      finalize(() => (this.downloadingReport = false)),
    ).subscribe({
      next: blob => this.importService.saveBlob(blob, 'test-import-problems.xlsx'),
      error: () => { /* message shown centrally by ErrorInterceptor */ },
    });
  }

  // ── step 4: import ────────────────────────────────────────────────────────

  /** Why Import is disabled, in one sentence — or empty when it is not. */
  get blockReason(): string {
    const p = this.preview;
    if (!p) return 'Upload a file first.';
    if (p.fileErrors.length > 0) return 'The file could not be read. Fix it and upload it again.';
    if (p.errorRows > 0) return `${p.errorRows} row${p.errorRows === 1 ? ' has' : 's have'} errors. Fix them in the file and upload it again — nothing is imported until every row is right.`;
    if (this.changesForMode === 0) return 'Everything in this file is already in the catalogue.';
    return '';
  }

  /** What Import will actually write with the chosen mode. */
  get changesForMode(): number {
    const p = this.preview;
    if (!p) return 0;
    return p.toCreate.total + (this.mode === TestImportMode.UpdateExisting ? p.toUpdate.total : 0);
  }

  commit(): void {
    if (!this.preview || this.blockReason) return;
    this.committing = true;
    this.importService.commit({ importToken: this.preview.importToken, mode: this.mode }).pipe(
      takeUntil(this.destroy$),
      finalize(() => (this.committing = false)),
    ).subscribe({
      next: result => {
        this.result = result;
        if (result.success) {
          this.toastr.success(result.message, 'Import complete');
        } else if (result.errors?.length) {
          // The catalogue changed since the preview: show the fresh problems in place.
          this.preview = {
            ...this.preview!,
            rows: result.errors,
            errorRows: result.errors.length,
            canCommit: false,
            importToken: '',
          };
          this.filter = 'problems';
        }
      },
      error: () => { /* message shown centrally by ErrorInterceptor */ },
    });
  }

  goToManageTests(): void {
    this.router.navigate(['/manage-tests']);
  }

  trackRow(_: number, row: TestImportRowResult): number {
    return row.rowNumber;
  }
}
