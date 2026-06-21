import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Supported action-button types.
 * Each type has a fixed icon and colour — only the click handler and optional
 * title override change per usage site.
 */
export type ActionButtonType = 'view' | 'edit' | 'delete' | 'print';

interface ActionConfig {
  cssClass: string;
  icon: string;
  defaultTitle: string;
}

const ACTION_CONFIG: Record<ActionButtonType, ActionConfig> = {
  view:   { cssClass: 'btn-view',   icon: 'fa-eye',    defaultTitle: 'View' },
  edit:   { cssClass: 'btn-edit',   icon: 'fa-pencil', defaultTitle: 'Edit' },
  delete: { cssClass: 'btn-delete', icon: 'fa-trash',  defaultTitle: 'Delete' },
  print:  { cssClass: 'btn-print',  icon: 'fa-print',  defaultTitle: 'Print' },
};

/**
 * Reusable table-row icon button.
 *
 * Usage:
 *   <app-action-btn type="edit"   title="Edit Patient"  (clicked)="editPatient(id)"></app-action-btn>
 *   <app-action-btn type="delete" title="Delete Record" (clicked)="confirmDelete(id)"></app-action-btn>
 *   <app-action-btn type="view"   (clicked)="viewDetails(item)"></app-action-btn>
 *   <app-action-btn type="print"  (clicked)="printReport(item)"></app-action-btn>
 *
 * The icon and colour are determined by `type`. Pass `title` to override the
 * default tooltip text. Wire `(clicked)` to the handler in your component.
 */
@Component({
  selector: 'app-action-btn',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
      class="btn-action"
      [ngClass]="config.cssClass"
      [title]="title || config.defaultTitle"
      type="button"
      (click)="clicked.emit($event)">
      <i class="fa" [ngClass]="config.icon"></i>
    </button>
  `
})
export class ActionButtonComponent {
  /** Which action this button represents — drives icon and colour. */
  @Input() type: ActionButtonType = 'view';

  /** Tooltip text shown on hover. Falls back to the type's default label. */
  @Input() title = '';

  /** Emits the native MouseEvent when the button is clicked. */
  @Output() clicked = new EventEmitter<MouseEvent>();

  get config(): ActionConfig {
    return ACTION_CONFIG[this.type];
  }
}
