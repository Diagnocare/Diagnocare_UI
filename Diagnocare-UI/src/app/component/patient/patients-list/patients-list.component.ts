import { CommonModule } from '@angular/common';
import { Component, CUSTOM_ELEMENTS_SCHEMA, ViewEncapsulation, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CommonService } from 'src/app/shared/common.service';
import { apiEndpoints } from 'src/app/constant/constants';
import { PatientService } from 'src/app/services/patientServices/patient.service';
import { LoadingSpinnerComponent } from 'src/app/shared/loading-spinner/loading-spinner.component';
import { ConfirmModalComponent } from 'src/app/shared/confirm-modal/confirm-modal.component';
import { ConfirmModalService } from 'src/app/shared/confirm-modal/confirm-modal.service';
import { DatePickerComponent } from 'src/app/shared/date-picker/date-picker.component';
import { PatientListDto } from 'src/app/models/patient/patient-list.dto';
import { SortDirection, SortPatientField } from 'src/app/models/common/sort';
import { ActionButtonComponent } from 'src/app/shared/action-button/action-button.component';


@Component({
  selector: 'app-patients-list',
  templateUrl: './patients-list.component.html',
  styleUrls: ['./patients-list.component.scss'],
  imports: [FormsModule, CommonModule, LoadingSpinnerComponent, ConfirmModalComponent, DatePickerComponent, ActionButtonComponent],
  encapsulation: ViewEncapsulation.None,
  standalone: true
})

export class PatientsListComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  /** Today in YYYY-MM-DD (local time) — used to block future date selection in search filters. */
  get todayIso(): string { return this.localDateIso(); }

  /** Returns today's date as a YYYY-MM-DD string using the local timezone (not UTC). */
  private localDateIso(d = new Date()): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  filteredPatients: PatientListDto[] = [];
  paginatedPatients: PatientListDto[] = [];

  // Search and filter properties
  searchTerm: string = '';
  dateFrom: string = '';
  dateTo: string = '';
  statusFilter: string = '';

  // Sorting properties
  currentSortField: SortPatientField = 'patient_Reg_Date';
  currentSortDirection: SortDirection = 'desc';

  // Pagination properties
  currentPage: number = 1;
  pageSize: number = 5;
  totalPages: number = 1;
  totalItems = 0;
  startIndex: number = 0;
  endIndex: number = 0;

  isLoading: boolean = true;
  // allPatients: PatientListDto[] = [];

  closeResult: string='';

  selectedPatientId: string='';
  selectedPatientName: string='';
  
  constructor(private router: Router, private _patientService: PatientService,
    private toastr:ToastrService, private _commonService: CommonService, private route: ActivatedRoute,
    private cdr: ChangeDetectorRef, private confirmModal: ConfirmModalService) { }

  ngOnInit() {
    this.initializeComponent();
  }

  initializeComponent() {
    const today = this.localDateIso();
    // this.dateFrom = today;
    // fix hardcoded date to ISO format (yyyy-MM-dd)
    this.dateFrom = today;
    this.dateTo = today;
    this.loadPatients();
  }

  private mapPatient(p: any): PatientListDto {
    return {
      serial_Number:          p.serialNumber          ?? p.serial_Number          ?? 0,
      patient_Id:             p.patientId             ?? p.patient_Id             ?? '',
      patient_Salutation:     p.patientSalutation     ?? p.patient_Salutation     ?? '',
      patient_Name:           p.patientName           ?? p.patient_Name           ?? '',
      patient_DOB:            p.patientDOB            ?? p.patient_DOB            ?? '',
      // API returns full string e.g. "36 years 7 months 2 days"
      patient_Age:            String(p.patientAge     ?? p.patient_Age            ?? ''),
      patient_Age_Group:      p.patientAgeGroup       ?? p.patient_Age_Group      ?? '',
      patient_Gender:         p.patientGender         ?? p.patient_Gender         ?? '',
      patient_Marital_Status: p.patientMaritalStatus  ?? p.patient_Marital_Status ?? '',
      patient_Address:        p.patientAddress        ?? p.patient_Address        ?? '',
      relation:               p.relation              ?? '',
      relative_Name:          p.relativeName          ?? p.relative_Name          ?? '',
      patientDialingContact:  p.patientContact        ?? p.patientDialingContact  ?? '',
      patient_Email:          p.patientEmail          ?? p.patient_Email          ?? '',
      patient_Reg_Date:       p.patientRegDate        ?? p.patient_Reg_Date       ?? '',
      lstPatientTests:        p.lstPatientTests       ?? null,
      // Normalise urgent to 'Yes' | 'No' from any truthy backend shape
      isUrgent: (() => {
        const raw = p.isUrgent ?? p.urgent ?? p.urgentReport ?? p.urgent_Report
                 ?? p.lstPatientTests?.urgent_Report ?? '';
        if (raw === true || raw === 'Yes' || raw === 'yes' || raw === '1' || raw === 1) return 'Yes';
        if (raw === false || raw === 'No' || raw === 'no' || raw === '0' || raw === 0) return 'No';
        return raw ? 'Yes' : 'No';   // any other truthy → Yes
      })(),
      // API field is testStatus; fall back to older snake_case names for compatibility
      status:                 p.testStatus            ?? p.status ?? p.patientStatus ?? '',
    };
  }

  /**
   * Returns a compact age string for the table column.
   * "36 years 7 months 2 days" → "36 yrs"
   * Falls back to the raw string if it cannot be parsed.
   */
  getDisplayAge(age: string): string {
    if (!age) return '—';
    const match = age.match(/^(\d+)\s*year/i);
    return match ? `${match[1]} yrs` : age;
  }

  /** CSS class for the urgent badge. */
  getUrgentClass(urgent: string): string {
    return urgent === 'Yes' ? 'urgent-badge urgent-yes' : 'urgent-badge urgent-no';
  }

  loadPatients() {
    this.isLoading = true;
    this.cdr.detectChanges();
    this._patientService.searchPatients('', this.currentPage, this.pageSize, this.formatToDDMMYYYY(this.dateFrom), this.formatToDDMMYYYY(this.dateTo), this.statusFilter).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response: any) => {
        this.filteredPatients = (response.item2 as any[]).map(p => this.mapPatient(p));
        // this.paginatedPatients = this.filteredPatients.slice(0, this.pageSize); // initial pagination
        // this.paginatedPatients = [...this.filteredPatients]; // API already returns paginated data
        this.totalItems = response.item1;
        this.totalPages = Math.ceil(this.totalItems / this.pageSize);
        
        // isUrgent is already normalised in mapPatient(); override only if
        // lstPatientTests carries a positive urgent_Report flag.
        this.filteredPatients.forEach((patient) => {
          if (patient.lstPatientTests?.urgent_Report === true) {
            patient.isUrgent = 'Yes';
          }
        });
        this.isLoading = false;
        this.applySorting();
        this.updatePagination();
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error fetching patient list:', err);
        // this.allPatients = [];
        this.filteredPatients = [];
        this.isLoading = false;
        this.cdr.detectChanges();
        this.toastr.error('Failed to load patients', 'Error');
      }
    });
  }

  onSearch() {
    this.applyFilters();
  }

  onDateFilter() {
    this.searchInputPatients();
  }

  onStatusFilter() {
    // Just stores the selected value via [(ngModel)].
    // The filter is sent to the backend only when the user clicks Find.
  }

  applyFilters() {
    this.filteredPatients = this.paginatedPatients.filter(patient => {
      const matchesSearch = !this.searchTerm ||
        patient.patient_Name.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        patient.relative_Name.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        patient.patient_Id.toLowerCase().includes(this.searchTerm.toLowerCase());

      const matchesDateFrom = !this.dateFrom || patient.patient_Reg_Date >= this.dateFrom;
      const matchesDateTo = !this.dateTo || patient.patient_Reg_Date <= this.dateTo;
      // const matchesStatus = !this.statusFilter || patient.status === this.statusFilter;

      return matchesSearch && matchesDateFrom && matchesDateTo //&& matchesStatus;
    });

    this.currentPage = 1;
    this.applySorting();
    this.updatePagination();
  }

  sort(field: SortPatientField) {
    if (this.currentSortField === field) {
      this.currentSortDirection = this.currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.currentSortField = field;
      this.currentSortDirection = 'asc';
    }

    this.applySorting();
    this.updatePagination();
    
  }

  applySorting() {
    this.filteredPatients.sort((a, b) => {
      let aValue: any = a[this.currentSortField] ?? '';
      let bValue: any = b[this.currentSortField] ?? '';

      // Date field — parse to timestamp so order is year → month → day
      if (this.currentSortField === 'patient_Reg_Date') {
        aValue = this.parseDateToTimestamp(String(aValue));
        bValue = this.parseDateToTimestamp(String(bValue));
      }

      // Age column — sort by the leading number, ignore trailing text
      if (this.currentSortField === 'patient_Age') {
        aValue = parseInt(String(aValue), 10) || 0;
        bValue = parseInt(String(bValue), 10) || 0;
      }

      let comparison = 0;
      if (aValue < bValue) comparison = -1;
      else if (aValue > bValue) comparison = 1;

      return this.currentSortDirection === 'desc' ? -comparison : comparison;
    });
  }

  /**
   * Converts a date string to a numeric timestamp for reliable chronological sorting.
   *
   * Handles:
   *   DD/MM/YYYY  (Indian display format, e.g. "15/03/2024")
   *   DD-MM-YYYY  (same with dashes)
   *   YYYY-MM-DD  (ISO / backend format)
   *   Any format parseable by Date constructor as fallback
   */
  private parseDateToTimestamp(dateStr: string): number {
    if (!dateStr) return 0;

    // DD/MM/YYYY or DD-MM-YYYY
    const dmy = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmy) {
      const [, dd, mm, yyyy] = dmy;
      return new Date(+yyyy, +mm - 1, +dd).getTime();
    }

    // YYYY-MM-DD or YYYY/MM/DD (ISO-like)
    const ymd = dateStr.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (ymd) {
      const [, yyyy, mm, dd] = ymd;
      return new Date(+yyyy, +mm - 1, +dd).getTime();
    }

    // Generic fallback
    const ts = new Date(dateStr).getTime();
    return isNaN(ts) ? 0 : ts;
  }

  getSortIcon(field: SortPatientField): string {
    if (this.currentSortField !== field) return 'icon-sort';
    return this.currentSortDirection === 'asc' ? 'icon-sort-up' : 'icon-sort-down';
  }

  onPageSizeChange() {
    this.currentPage = 1;
    this.loadPatients();
  }

  goToPage(page: number) {
    this.currentPage = page;
    this.loadPatients();
  }

  updatePagination() {
    this.startIndex = (this.currentPage - 1) * this.pageSize;
    this.endIndex = Math.min(this.startIndex + this.pageSize, this.totalItems);
    // paginatedPatients kept as alias; filteredPatients is the binding source in *ngFor
    this.paginatedPatients = this.filteredPatients;
  }

  trackByPatientId(index: number, patient: PatientListDto): string {
    return patient.patient_Id;
  }

  getVisiblePages(): number[] {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, this.currentPage - 2);
    let end = Math.min(this.totalPages, start + maxVisible - 1);

    if (end - start < maxVisible - 1) {
      start = Math.max(1, end - maxVisible + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    return pages;
  }

  formatDate(date: string): string {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    return `${d.getDate().toString().padStart(2,'0')}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getFullYear()}`;
  }

  // Convert an ISO date (yyyy-mm-dd) or Date-parsable string to dd-MM-yyyy
  formatToDDMMYYYY(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  }

  getRowClass(patient: PatientListDto): string {
    // Urgent always takes highest priority
    if (patient.isUrgent === 'Yes') return 'urgent-row';
    const s = (patient.status || '').toLowerCase();
    if (s === 'completed') return 'completed-row';
    if (s === 'partial')   return 'partial-row';
    if (s === 'pending')   return 'pending-row';
    return '';
  }

  getStatusClass(status: string): string {
    switch ((status || '').toLowerCase()) {
      case 'completed': return 'status-completed';
      case 'partial':   return 'status-partial';
      case 'pending':   return 'status-pending';
      default:          return 'status-unknown';
    }
  }

  getTotalAmount(): number {
    // let amount= this.filteredPatients.reduce((sum, patient) => sum + patient.lstPatientTests.amount_Tobe_Paid, 0);
    return 0;
  }

  getPendingCount(): number {
    // return this.filteredPatients.filter(p => p.lstPatientTests. === 'Pending').length;
    return 0;
  }

  navigateToAddPatient() {
    this.router.navigate(['/patients/add']);
  }

  refreshList() {
    this.loadPatients();
  }

  viewPatientTest(id: string) {
    this.router.navigate(['/patient-tests'], {
      queryParams: {
        patientId: id
      }
    });
  }

  editPatient(id: string) {
    
    this.router.navigate(['patients/edit/', id]);
  }

  deletePatient(patient_Id: string) {
    this._patientService.deletePatientDetails(patient_Id).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (result: boolean) => {
        if (result) {
          this.toastr.success('Patient deleted successfully', 'Success');
          this.loadPatients();
        } else {
          this.toastr.error('Patient deletion failed', 'Error');
        }
      },
      error: (err) => {
        console.error('Error deleting patient:', err);
        this.toastr.error('Patient deletion failed', 'Error');
      }
    });
  }
  
  confirmDelete(patientId: string) {
    const patient = this.filteredPatients.find(p => p.patient_Id === patientId);
    const name = patient?.patient_Name || patientId;
    this.confirmModal.confirm({
      title: 'Delete Patient',
      message: `Are you sure you want to delete patient ${name}?`,
      confirmText: 'Delete',
      cancelText: 'Cancel'
    }).subscribe(confirmed => {
      if (confirmed) {
        this.deletePatient(patientId);
      }
    });
  }

  openModal(content: any, patientId: string) {
    this.selectedPatientId = patientId;
    this.selectedPatientName = this.paginatedPatients.find(p => p.patient_Id === patientId)?.patient_Name || '';
    // Modal functionality can be implemented using native HTML/CSS or another library
    // For now, storing the selected patient for use in template
  }
 
    private getDismissReason(reason: any): string {
      console.log(reason);
      return reason ? `with: ${reason}` : 'dismissed';
    }

  isTodayDateRange(): boolean {
    const today = this.localDateIso();
    return this.dateFrom === today && this.dateTo === today && !this.searchTerm && !this.statusFilter;
  }
searchInputPatients() {
  if (!this.searchTerm.trim()) {
    this.loadPatients();
    return;
  }
}
    searchPatients() {
      this.isLoading = true;
      
      // Check if there's any search criteria
      const hasSearchTerm = this.searchTerm && this.searchTerm.trim().length >= 2;
      const hasDateFilter = this.dateFrom || this.dateTo;
      const hasStatusFilter = this.statusFilter && this.statusFilter.trim() !== '';
      
      if (!hasSearchTerm && !hasDateFilter && !hasStatusFilter) {
        this.toastr.warning('Please enter search criteria', 'Warning');
        this.isLoading = false;
        return;
      }
      
      if (this.searchTerm && this.searchTerm.trim().length > 0 && this.searchTerm.trim().length < 2) {
        this.toastr.warning('Please enter at least 2 characters', 'Warning');
        this.isLoading = false;
        return;
      }

      if (this.dateFrom && this.dateTo && this.dateTo < this.dateFrom) {
        this.toastr.warning('"To" date cannot be earlier than "From" date', 'Invalid Date Range');
        this.isLoading = false;
        return;
      }

      this._patientService.searchPatients(
        this.searchTerm || '', 
        this.currentPage, 
        this.pageSize,
        this.formatToDDMMYYYY(this.dateFrom),
        this.formatToDDMMYYYY(this.dateTo),
        this.statusFilter
      ).pipe(
        takeUntil(this.destroy$)
      ).subscribe({
        next: (response: any) => {
          this.filteredPatients = (response.item2 as any[]).map(p => this.mapPatient(p));
          this.totalItems = response.item1;
          this.totalPages = Math.ceil(this.totalItems / this.pageSize);
          this.applySorting();
          this.updatePagination();
          this.isLoading = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Error searching patients:', err);
          this.filteredPatients = [];
          this.isLoading = false;
          this.cdr.detectChanges();
          this.toastr.error('Failed to search patients', 'Error');
        }
      });
    }

    ngOnDestroy(): void {
      this.destroy$.next();
      this.destroy$.complete();
    }
}
