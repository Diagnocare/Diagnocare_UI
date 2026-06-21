import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableReportComponent } from '../table-report/table-report.component';

type RegisterTab = 'billRegister' | 'receiptRegister' | 'refundRegister';

interface TabDef {
  id: RegisterTab;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-register-reports',
  standalone: true,
  imports: [CommonModule, TableReportComponent],
  template: `
    <div class="rr-tab-bar">
      <button
        *ngFor="let tab of tabs"
        class="rr-tab-btn"
        [class.active]="activeTab === tab.id"
        (click)="setTab(tab.id)">
        <i class="fa {{ tab.icon }}"></i>
        {{ tab.label }}
      </button>
    </div>

    <ng-container *ngFor="let tab of tabs">
      <app-table-report
        *ngIf="activeTab === tab.id"
        [reportId]="tab.id">
      </app-table-report>
    </ng-container>
  `,
  styles: [`
    .rr-tab-bar {
      display: flex;
      gap: 0;
      background: var(--bg-white);
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      padding: 0 1rem;
      box-shadow: var(--shadow-light);
      clip-path: inset(-10px -10px 0 -10px);
    }

    .rr-tab-btn {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.85rem 1.25rem;
      background: none;
      border: none;
      border-bottom: 3px solid transparent;
      font-size: 0.88rem;
      font-weight: 600;
      color: var(--text-secondary);
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s;
      white-space: nowrap;
    }

    .rr-tab-btn:hover {
      color: var(--primary-color);
    }

    .rr-tab-btn.active {
      color: var(--primary-color);
      border-bottom-color: var(--primary-color);
    }

    .rr-tab-btn i {
      font-size: 0.82rem;
    }
  `]
})
export class RegisterReportsComponent {

  readonly tabs: TabDef[] = [
    { id: 'billRegister',    label: 'Bill Register',    icon: 'fa-list'    },
    { id: 'receiptRegister', label: 'Receipt Register', icon: 'fa-receipt' },
    { id: 'refundRegister',  label: 'Refund Register',  icon: 'fa-undo'    },
  ];

  activeTab: RegisterTab = 'billRegister';

  setTab(tab: RegisterTab): void {
    this.activeTab = tab;
  }
}
