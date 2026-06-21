import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule,Location } from '@angular/common';
import { ContactAddressListDto } from 'src/app/models/contactAddress/contactAddress-list.dto';
import { ContactAddressModel } from 'src/app/models/contactAddress/contactAddressModel';
import { ContactAddressService } from 'src/app/services/contactAddressServices/contact-address.service';
import { LoadingSpinnerComponent } from 'src/app/shared/loading-spinner/loading-spinner.component';
import { ActionButtonComponent } from 'src/app/shared/action-button/action-button.component';
import { InstitutionType } from 'src/app/constant/enums';

@Component({
  selector: 'app-contact-list',
  templateUrl: './contact-list.component.html',
  styleUrls: ['./contact-list.component.css'],
  standalone: true,
  imports: [CommonModule, LoadingSpinnerComponent, ActionButtonComponent]
})
export class ContactListComponent implements OnInit {
  contacts: ContactAddressListDto[] = [];
  isLoading = false;

  // Tab state
  activeTab: 'contacts' | 'panel' = 'contacts';

  // Search / filter / pagination state
  searchTerm: string = '';
  filterType: number | null = null;
  filteredContacts: ContactAddressListDto[] = [];

  pageSizeOptions = [5, 10, 25];
  pageSize = 10;
  currentPage = 1;
  totalPages = 1;

  contactTypes = [
    {value: InstitutionType.Doctor, label: 'Doctor' },
    { value: InstitutionType.Clinic, label: 'Clinic' },
    { value: InstitutionType.Hospital, label: 'Hospital' },
    { value: InstitutionType.Laboratory, label: 'Laboratory' },
    { value: InstitutionType.DiagnosticCenter, label: 'Diagnostic Center' },
    { value: InstitutionType.Pharmacy, label: 'Pharmacy' },
    { value: InstitutionType.Other, label: 'Other' }
  ];

  private contactService = inject(ContactAddressService);
  private router = inject(Router);
  private location = inject(Location);
  ngOnInit(): void {
    this.loadContacts();
  }

  institutionTypeLabel(value?: number | null): string {
    if (value == null) return '';
    switch (+value) {
      case InstitutionType.Doctor: return 'Doctor';
      case InstitutionType.Clinic: return 'Clinic';
      case InstitutionType.Hospital: return 'Hospital';
      case InstitutionType.Laboratory: return 'Laboratory';
      case InstitutionType.DiagnosticCenter: return 'Diagnostic Center';
      case InstitutionType.Pharmacy: return 'Pharmacy';
      case InstitutionType.Other: return 'Other';
      default: return '';
    }
  }

  loadContacts() {
    this.isLoading = true;
    this.contactService.getContacts().subscribe({
      next: (data: ContactAddressListDto[]) => {
        this.contacts = data;
        this.applyFilters();
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
      }
    });
  }

  applyFilters() {
    const term = this.searchTerm.trim().toLowerCase();
    const base = this.contacts.filter(c => {
      const matchesTerm = !term || (c.name && c.name.toLowerCase().includes(term)) || (c.city && c.city.toLowerCase().includes(term));
      const matchesType = this.filterType == null || this.filterType === (c.institutionType as any);
      return matchesTerm && matchesType;
    });

    const isPanel = (c: ContactAddressListDto) =>
      c.commissionPercentage != null && c.commissionPercentage > 0;

    this.filteredContacts = this.activeTab === 'panel'
      ? base.filter(isPanel)
      : base.filter(c => !isPanel(c));

    this.currentPage = 1;
    this.totalPages = Math.max(1, Math.ceil(this.filteredContacts.length / this.pageSize));
  }

  setTab(tab: 'contacts' | 'panel') {
    this.activeTab = tab;
    this.applyFilters();
  }

  /** Count for tab badges */
  get panelCount(): number {
    return this.contacts.filter(c => c.commissionPercentage != null && c.commissionPercentage > 0).length;
  }

  get contactsCount(): number {
    return this.contacts.filter(c => !(c.commissionPercentage != null && c.commissionPercentage > 0)).length;
  }

  get pagedContacts(): ContactAddressModel[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredContacts.slice(start, start + this.pageSize);
  }

  onSearch(value: string) {
    this.searchTerm = value;
    this.applyFilters();
  }

  onFilterChange(value: any) {
    this.filterType = value === '' ? null : +value;
    this.applyFilters();
  }

  changePageSize(size: number) {
    this.pageSize = size;
    this.applyFilters();
  }

  goToPage(n: number) {
    if (n < 1 || n > this.totalPages) return;
    this.currentPage = n;
  }

  nextPage() {
    this.goToPage(this.currentPage + 1);
  }

  prevPage() {
    this.goToPage(this.currentPage - 1);
  }

  addContact() {
    this.router.navigate(['/contacts/add']);
  }

  editContact(id?: number | null) {
    if (id == null) return;
    this.router.navigate(['/contacts/edit', id]);
  }

  deleteContact(id?: number | null) {
    if (id == null) return;
    this.router.navigate(['/contacts/delete', id]);
  }
  
  goBack(): void {
    this.location.back();
  }
}
