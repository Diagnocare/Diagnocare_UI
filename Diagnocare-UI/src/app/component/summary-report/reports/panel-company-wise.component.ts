import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ContactAddressService } from 'src/app/services/contactAddressServices/contact-address.service';
import { TableReportComponent } from '../table-report/table-report.component';

interface InstTypeOption { value: number | null; label: string; }

@Component({
  selector: 'app-panel-company-wise',
  standalone: true,
  imports: [CommonModule, FormsModule, TableReportComponent],
  template: `
    <div class="panel-filter-bar">

      <!-- Institute Type dropdown — triggers backend re-fetch -->
      <div class="filter-group">
        <label class="filter-label"><i class="fa fa-tags"></i> Institute Type</label>
        <select class="form-select" [(ngModel)]="selectedTypeValue" (ngModelChange)="onTypeChange()">
          <option *ngFor="let t of typeOptions" [ngValue]="t.value">{{ t.label }}</option>
        </select>
      </div>

      <!-- Institute Name dropdown — client-side row filter, populated from contacts -->
      <div class="filter-group">
        <label class="filter-label"><i class="fa fa-filter"></i> Institute Name</label>
        <select class="form-select" [(ngModel)]="selectedInstitute">
          <option value="">All</option>
          <option *ngFor="let inst of filteredInstitutes" [value]="inst">{{ inst }}</option>
        </select>
      </div>

    </div>

    <app-table-report
      reportId="panelCompanyWise"
      [extraParams]="extraParams"
      [rowFilter]="selectedInstitute">
    </app-table-report>
  `,
  styles: [`
    .panel-filter-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 1.25rem;
      background: var(--bg-white);
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      padding: 1rem 1.5rem 0.75rem;
      box-shadow: var(--shadow-light);
      clip-path: inset(-10px -10px 0 -10px);
    }

    .filter-group {
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      min-width: 14rem;
    }

    .filter-label {
      font-weight: 600;
      font-size: 0.82rem;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .form-select { max-width: 22rem; }
  `]
})
export class PanelCompanyWiseComponent implements OnInit {

  readonly typeOptions: InstTypeOption[] = [
    { value: null, label: 'All Types'        },
    { value: 7,    label: 'Doctor'           },
    { value: 2,    label: 'Hospital'         },
    { value: 1,    label: 'Clinic'           },
    { value: 4,    label: 'Diagnostic Center'},
    { value: 3,    label: 'Laboratory'       },
    { value: 5,    label: 'Pharmacy'         },
    { value: 6,    label: 'Other'            },
  ];

  selectedTypeValue: number | null = null;
  selectedInstitute = '';
  extraParams: Record<string, any> = {};

  /** All panel institute names (commission > 0) keyed by InstitutionType value. */
  private allInstitutesByType = new Map<number, string[]>();
  /** Flat list used when no type is selected. */
  private allInstituteNames: string[] = [];
  filteredInstitutes: string[] = [];

  constructor(private contactSvc: ContactAddressService) {}

  ngOnInit(): void {
    this.contactSvc.getContacts().subscribe({
      next: contacts => {
        const panel = contacts.filter(
          c => c.commissionPercentage != null && (c.commissionPercentage as number) > 0
        );
        this.allInstituteNames = panel.map(c => c.name).sort((a, b) => a.localeCompare(b));

        // Group by institution type
        for (const c of panel) {
          const t = c.institutionType as number;
          if (!this.allInstitutesByType.has(t)) this.allInstitutesByType.set(t, []);
          this.allInstitutesByType.get(t)!.push(c.name);
        }
        for (const arr of this.allInstitutesByType.values()) arr.sort((a, b) => a.localeCompare(b));

        this.refreshInstituteList();
      },
      error: () => { /* dropdown stays empty — report still works */ }
    });
  }

  onTypeChange(): void {
    this.selectedInstitute = '';
    this.extraParams = this.selectedTypeValue != null
      ? { institutionType: this.selectedTypeValue }
      : {};
    this.refreshInstituteList();
  }

  private refreshInstituteList(): void {
    this.filteredInstitutes = this.selectedTypeValue != null
      ? (this.allInstitutesByType.get(this.selectedTypeValue) ?? [])
      : this.allInstituteNames;
  }
}
