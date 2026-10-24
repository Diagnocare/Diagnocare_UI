import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import {
  UnsavedChangesModalService,
  UnsavedChangesOptions,
} from './unsaved-changes-modal.service';

/**
 * Reusable "unsaved changes" guard dialog.
 *
 * Usage — include once in any component that needs it:
 *   <app-unsaved-changes-modal [saving]="isSaving"></app-unsaved-changes-modal>
 *
 * Then trigger via the service:
 *   this.unsavedModalSvc.prompt({ changeCount: n }).subscribe(result => { … });
 *
 * Result values: 'save' | 'discard' | 'cancel'
 */
@Component({
  selector: 'app-unsaved-changes-modal',
  templateUrl: './unsaved-changes-modal.component.html',
  styleUrls: ['./unsaved-changes-modal.component.scss'],
  standalone: true,
  imports: [CommonModule],
})
export class UnsavedChangesModalComponent implements OnInit, OnDestroy {
  /** Pass the parent's saving flag so the spinner / disabled state reflects actual API status. */
  @Input() saving = false;

  isOpen      = false;
  changeCount = 0;
  context     = '';

  private sub!: Subscription;

  constructor(private svc: UnsavedChangesModalService) {}

  ngOnInit(): void {
    this.sub = this.svc.open$.subscribe((opts: UnsavedChangesOptions) => {
      this.changeCount = opts.changeCount;
      this.context     = opts.context ?? '';
      this.isOpen      = true;
    });
  }

  onSave(): void {
    this.isOpen = false;
    this.svc.resolve('save');
  }

  onDiscard(): void {
    this.isOpen = false;
    this.svc.resolve('discard');
  }

  onCancel(): void {
    this.isOpen = false;
    this.svc.resolve('cancel');
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}
