import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ContactAddressListDto } from 'src/app/models/contactAddress/contactAddress-list.dto';
import { ContactAddressService } from 'src/app/services/contactAddressServices/contact-address.service';
import { CommonService } from 'src/app/shared/common.service';
import { AppValidators } from 'src/app/shared/validators/app-validators';
import { LoadingSpinnerComponent } from 'src/app/shared/loading-spinner/loading-spinner.component';
import { FieldErrorComponent } from 'src/app/shared/field-error/field-error.component';
import { FormKeyboardDirective } from 'src/app/shared/directives/form-keyboard.directive';
import { InstitutionType } from 'src/app/constant/enums';

@Component({
  selector: 'app-contact-form',
  templateUrl: './contact-form.component.html',
  styleUrls: ['./contact-form.component.css'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LoadingSpinnerComponent, FieldErrorComponent, FormKeyboardDirective]
})
export class ContactFormComponent implements OnInit {
  contactForm: FormGroup;
  isEdit = false;
  contactId: number | null = null;
  isLoading = false;
  submitted = false;

  /** Tab order for keyboard navigation (Enter → next, Shift+Tab → previous). */
  readonly tabFields = [
    'institutionType',
    'name',
    'contactPerson',
    'contactNumber',
    'email',
    'addressLine1',
    'addressLine2',
    'city',
    'state',
    'pinCode',
    'country',
    'commissionPercentage',
  ];
  contactTypes = [
    { value: InstitutionType.Doctor,          label: 'Doctor' },
    { value: InstitutionType.Clinic,          label: 'Clinic' },
    { value: InstitutionType.Hospital,        label: 'Hospital' },
    { value: InstitutionType.Laboratory,      label: 'Laboratory' },
    { value: InstitutionType.DiagnosticCenter,label: 'Diagnostic Center' },
    { value: InstitutionType.Pharmacy,        label: 'Pharmacy' },
    { value: InstitutionType.Other,           label: 'Other' }
  ];

  private fb = inject(FormBuilder);
  private contactService = inject(ContactAddressService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  readonly commonService = inject(CommonService);

  constructor() {
    this.contactForm = this.fb.group({
      id: [0],
      name: ['', Validators.required],
      institutionType: [null, Validators.required],
      contactPerson: [''],
      contactNumber: ['', AppValidators.contactNumber()],
      email: ['', Validators.email],
      addressLine1: [''],
      addressLine2: [''],
      city: [''],
      state: [''],
      pinCode: ['', AppValidators.pincode()],
      country: [''],
      isActive: [true],
      commissionPercentage: [null, [Validators.min(0), Validators.max(100)]]
    });
  }

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.isEdit = true;
        this.contactId = +id;
        this.loadContact(this.contactId);
      }
    });
  }

  loadContact(id: number) {
    this.isLoading = true;
    this.contactService.getContactById(id).subscribe({
      next: (contact: ContactAddressListDto) => {
        this.contactForm.patchValue(contact);
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
      }
    });
  }

  onSubmit() {
    this.submitted = true;
    if (this.contactForm.invalid) {
      this.contactForm.markAllAsTouched();
      return;
    }
    this.isLoading = true;
    const formValue = this.contactForm.value;
    const contact: any = { ...formValue };
  
    if (this.isEdit) {
      this.contactService.updateContact(contact).subscribe({
        next: () => {
          this.isLoading = false;
          this.router.navigate(['/contacts']);
        },
        error: () => {
          this.isLoading = false;
        }
      });
    } else {
      contact.id = null;
      this.contactService.addContact(contact).subscribe({
        next: () => {
          this.isLoading = false;
          this.router.navigate(['/contacts']);
        },
        error: () => {
          this.isLoading = false;
        }
      });
    }
  }
 // Navigates back to user list
  goBack() {
    this.router.navigate(['/contacts']);
  }
  onClear() {
    this.contactForm.reset();
    this.contactForm.patchValue({ isActive: true });
  }
}
