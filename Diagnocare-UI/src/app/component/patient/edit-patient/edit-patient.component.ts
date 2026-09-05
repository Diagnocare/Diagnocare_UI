import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil, filter } from 'rxjs/operators';
import { PatientEditDto } from 'src/app/models/patient/patient-edit.dto';
import { PatientService } from 'src/app/services/patientServices/patient.service';
import { CommonService } from 'src/app/shared/common.service';
import { AppValidators } from 'src/app/shared/validators/app-validators';
import { LoadingSpinnerComponent } from 'src/app/shared/loading-spinner/loading-spinner.component';
import { salutation, ageGroup, gender, maritalStatus, relations, referredByType } from 'src/app/constant/enums';
import { tabOrderEdit, DEFAULT_DIALING_CODE } from 'src/app/constant/constants';
import { FieldErrorComponent } from 'src/app/shared/field-error/field-error.component';
import { FormKeyboardDirective } from 'src/app/shared/directives/form-keyboard.directive';
import { NumericOnlyDirective } from 'src/app/shared/directives/numeric-only.directive';
import { DatePickerComponent } from '../../../shared/date-picker/date-picker.component';

@Component({
  selector: 'app-edit-patient',
  templateUrl: './edit-patient.component.html',
  styleUrls: ['./edit-patient.component.scss'],
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, CommonModule, LoadingSpinnerComponent, FieldErrorComponent, FormKeyboardDirective, NumericOnlyDirective, DatePickerComponent]
})
export class EditPatientComponent implements OnInit, OnDestroy {
  
  private destroy$ = new Subject<void>();

  isLoading: boolean = false;
  formSubmitted: boolean = false;
  readonly tabFields = tabOrderEdit;
  componentTitle = "Edit Patient Form";
  param:string="";
  usertype:string="";
  editPatientForm!:FormGroup;
  countryCodes: { code: string, label: string }[] = [];
  patientDetails: PatientEditDto | undefined;
  today: string = new Date().toISOString().split('T')[0];
  salutation=Object.values(salutation);
  ageRange=Object.values(ageGroup);
  gender=Object.values(gender);
  maritalStatus=Object.values(maritalStatus);
  relations=Object.values(relations);
  /** Upper bound for the DOB picker — today in YYYY-MM-DD format. */
  readonly todayIso = new Date().toISOString().split('T')[0];
  constructor(private _route:Router,private formBuilder:FormBuilder,private route: ActivatedRoute, 
    private _patientService: PatientService,private toastr:ToastrService,private _common:CommonService)
  {
    this.editPatientForm = this.formBuilder.group({
      country_Code:      ['+91', Validators.required],
      patient_Salutation: [""],
      patient_Name: ["", [Validators.required]],
      // Optional: walk-in patients often register without giving an address.
      patient_Address: [""],
      // Age can be typed instead of a date of birth — see onAgePartChange().
      patient_DOB: [""],
      patient_Age: ["", [Validators.required]],
      patient_Age_Group: [""],
      patient_Age_Years:  [null],
      patient_Age_Months: [null],
      patient_Age_Days:   [null],
      patient_Gender: ["", [Validators.required]],
      patient_Marital_Status: [""],
      relation: [""],
      relative_Name: [""],
      // Optional, but still format-checked when filled — contactNumber()
      // returns null for an empty value.
      patient_Contact: ["", [AppValidators.contactNumber()]],
      patient_Email: ["", Validators.email]
    });
  }

  ngOnInit(): void {
    this.initializeComponent();
  }

  initializeComponent(): void {
    this.param = this.route.snapshot.paramMap.get('id')!;
    // this.onReferredByTypeChange();

    this.countryCodes = [{ code: DEFAULT_DIALING_CODE, label: `India (${DEFAULT_DIALING_CODE})` }];
    this.loadPatient(this.param);
  }
  /**
   * Overwrite loadPatient to split patientDialingContact into country_Code and patient_Contact
   */
  loadPatient(patientId: string): void {
    this.isLoading = true;
    this._patientService.getPatientById(patientId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (data: PatientEditDto) => {
        this.patientDetails = data;

        // Extract salutation from name (e.g. "Mrs. Leelawati" → salutation "Mrs.", name "Leelawati")
        const knownSalutations = Object.values(salutation);
        let patient_Salutation = '';
        let patient_Name = data.patientName ?? '';
        for (const sal of knownSalutations) {
          if (patient_Name.startsWith(sal + ' ') || patient_Name.startsWith(sal)) {
            patient_Salutation = sal;
            patient_Name = patient_Name.slice(sal.length).trim();
            break;
          }
        }

        // Convert DOB from dd-MM-yyyy to yyyy-MM-dd for the date input
        let patient_DOB = '';
        if (data.patientDOB) {
          const parts = data.patientDOB.split('-');
          if (parts.length === 3) {
            // dd-MM-yyyy → yyyy-MM-dd
            patient_DOB = `${parts[2]}-${parts[1]}-${parts[0]}`;
          } else {
            patient_DOB = data.patientDOB;
          }
        }

        // Split contact into country code + number (format: "+91-1234567890" or plain "1234567890")
        let country_Code = '+91';
        let patient_Contact = data.patientContact ?? '';
        if (patient_Contact.includes('-')) {
          const parts = patient_Contact.split('-');
          country_Code = parts[0] || country_Code;
          patient_Contact = parts[1] || '';
        }

        this.editPatientForm.patchValue({
          patient_Salutation,
          patient_Name,
          patient_DOB,
          patient_Age:           data.patientAge ?? '',
          patient_Age_Group:     data.patientAgeGroup ?? '',
          // parseAgeParts also understands the legacy "41 Years" string, so a
          // patient saved before this change opens with their age intact.
          ...(() => {
            const p = this._common.parseAgeParts(data.patientAge);
            return {
              patient_Age_Years:  p.years  || null,
              patient_Age_Months: p.months || null,
              patient_Age_Days:   p.days   || null,
            };
          })(),
          patient_Gender:        data.patientGender ?? '',
          patient_Marital_Status: data.patientMaritalStatus ?? '',
          patient_Address:       data.patientAddress ?? '',
          relation:              data.relation ?? '',
          relative_Name:         data.relativeName ?? '',
          country_Code,
          patient_Contact,
          patient_Email:         data.patientEmail ?? ''
        });

        this.isLoading = false;
      },
      // Message shown centrally by ErrorInterceptor; here we just reset state.
      error: () => {
        this.isLoading = false;
      }
    });
  }
  /**
   * Returns the tabindex for a given control name based on tabOrderEdit.
   */
  getTabIndex(controlName: string): number {
    const idx = tabOrderEdit.indexOf(controlName);
    return idx === -1 ? -1 : idx + 1;
  }

  isFieldInvalid(field: string): boolean {
    const c = this.editPatientForm.get(field);
    return !!(c?.invalid && (c.touched || this.formSubmitted));
  }

    // Removed duplicate loadPatient. Only the new version with patientDialingContact split is used.

  get errors(): string[] {
    // this.disabled=true;
  let errorMessage =this._common.getFormValidationErrors(this.editPatientForm);
    
    // errorMessage.length > 0? this.disabled=true:this.disabled=false;
    return errorMessage;
  }
  onDateInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const { value, cursorPos } = this._common.formatDateInputMask(input.value);

    input.value = value;
    input.setSelectionRange(cursorPos, cursorPos);
    this.editPatientForm.get('patient_DOB')?.setValue(value, { emitEvent: true });

    if (value.length === 10) {
      this.calculateAge();
    } else {
      this.editPatientForm.patchValue({
        patient_Age: '', patient_Age_Group: '',
        patient_Age_Years: null, patient_Age_Months: null, patient_Age_Days: null,
      }, { emitEvent: false });
    }
  }

  onDateKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Backspace') return;

    event.preventDefault();

    const input = event.target as HTMLInputElement;
    const cursorPos = input.selectionStart ?? input.value.length;
    const { newValue, newPos } = this._common.handleDateBackspace(input.value, cursorPos);

    input.value = newValue;
    input.setSelectionRange(newPos, newPos);
    this.editPatientForm.get('patient_DOB')?.setValue(newValue, { emitEvent: true });

    if (newValue.length === 10) {
      this.calculateAge();
    } else {
      this.editPatientForm.patchValue({
        patient_Age: '', patient_Age_Group: '',
        patient_Age_Years: null, patient_Age_Months: null, patient_Age_Days: null,
      }, { emitEvent: false });
    }
  }

  /**
   * Called when the user picks a date in the hidden native picker.
   * Converts ISO yyyy-MM-dd → dd/mm/yyyy (the text-mask format),
   * writes it to the form control, then recalculates age.
   */
  onDobPickerChange(isoDate: string): void {
    if (!isoDate) return;
    const [y, m, d] = isoDate.split('-');
    const dmy = `${d}/${m}/${y}`;
    this.editPatientForm.get('patient_DOB')?.setValue(dmy, { emitEvent: true });
    this.calculateAge();
  }
    /**
     * Date of birth → age. Fills the three Y/M/D boxes, the composed string sent
     * to the API, and the age group.
     *
     * `emitEvent: false` on the parts: they are written BY this method, and
     * letting them emit would call onAgePartChange(), which writes the DOB back.
     */
    calculateAge(): void {
      const formDOB = this.editPatientForm.get('patient_DOB')?.value;
      if (!formDOB) return;
      const isoDate = this._common.setYearofDate(formDOB); // used internally only — not written back to form

      const { years, months, days } = this._common.calculateAgeParts(isoDate);

      let ageGroupValue = '';
      if      (years < 1)                ageGroupValue = this.ageRange[0];
      else if (years >= 1  && years < 18) ageGroupValue = this.ageRange[1];
      else if (years >= 18 && years < 60) ageGroupValue = this.ageRange[2];
      else                                ageGroupValue = this.ageRange[3];

      this.editPatientForm.patchValue({
        patient_Age_Years:  years,
        patient_Age_Months: months,
        patient_Age_Days:   days,
      }, { emitEvent: false });

      this.editPatientForm.patchValue({
        patient_Age:       this._common.formatAgeParts(years, months, days),
        patient_Age_Group: ageGroupValue,
      });
    }

    /**
     * Age → date of birth, for a patient who does not know the date. The DOB it
     * produces is an approximation, which is what an age-only record is anyway,
     * and it keeps every downstream consumer working off one field.
     */
    onAgePartChange(): void {
      const f = this.editPatientForm.value;
      const years  = Math.max(0, Math.min(150, Number(f.patient_Age_Years)  || 0));
      const months = Math.max(0, Math.min(11,  Number(f.patient_Age_Months) || 0));
      const days   = Math.max(0, Math.min(31,  Number(f.patient_Age_Days)   || 0));

      this.editPatientForm.patchValue({
        patient_Age_Years:  years  || null,
        patient_Age_Months: months || null,
        patient_Age_Days:   days   || null,
      }, { emitEvent: false });

      const hasAge = years > 0 || months > 0 || days > 0;

      let ageGroupValue = '';
      if (hasAge) {
        if      (years < 1)                 ageGroupValue = this.ageRange[0];
        else if (years >= 1  && years < 18) ageGroupValue = this.ageRange[1];
        else if (years >= 18 && years < 60) ageGroupValue = this.ageRange[2];
        else                                ageGroupValue = this.ageRange[3];
      }

      this.editPatientForm.patchValue({
        patient_Age:       hasAge ? this._common.formatAgeParts(years, months, days) : '',
        patient_Age_Group: ageGroupValue,
        patient_DOB:       hasAge ? this._common.dobFromAgeParts(years, months, days) : '',
      }, { emitEvent: false });

      this.editPatientForm.get('patient_Age')?.markAsDirty();
    }
    SubmitForm(form: FormGroup) {
      this.formSubmitted = true;
      if (!form.valid) {
        form.markAllAsTouched();
        return;
      }
      this.isLoading = true;
      const formValue = form.getRawValue();

      // Prepend salutation to name
      const fullName = [formValue.patient_Salutation, formValue.patient_Name]
        .filter(Boolean).join(' ').trim();

      // Convert DOB from yyyy-MM-dd (date input) back to dd-MM-yyyy for backend
      let patientDOB = formValue.patient_DOB ?? '';
      if (patientDOB && patientDOB.includes('-') && patientDOB.indexOf('-') === 4) {
        const [y, m, d] = patientDOB.split('-');
        patientDOB = `${d}-${m}-${y}`;
      }

      const payload: PatientEditDto = {
        patientId:            this.patientDetails?.patientId ?? '',
        patientName:          fullName,
        patientDOB:           patientDOB,
        patientAge:           formValue.patient_Age ?? '',
        patientAgeGroup:      formValue.patient_Age_Group ?? '',
        patientGender:        formValue.patient_Gender ?? '',
        patientMaritalStatus: formValue.patient_Marital_Status ?? '',
        patientAddress:       formValue.patient_Address ?? '',
        relation:             formValue.relation ?? '',
        relativeName:         formValue.relative_Name ?? '',
        patientContact:       `${formValue.patient_Contact ?? ''}`,
        patientEmail:         formValue.patient_Email ?? ''
      };

      this._patientService.updatePatientDetails(payload).pipe(takeUntil(this.destroy$)).subscribe({
        next: (res: any) => {
          this.isLoading = false;
          // API returns an OperationResult (HTTP 200 even on business failure),
          // so honour the success flag rather than assuming success.
          if (res?.success ?? res) {
            this._route.navigate(['/patients']);
          } else {
            this.toastr.error(res?.message || 'Failed to update patient. Please try again.', 'Error');
          }
        },
        // HTTP/network errors are surfaced centrally by ErrorInterceptor.
        error: () => {
          this.isLoading = false;
        }
      });
    }

    clickBack(): void {
      this._route.navigate(['/patients']);
    }

    clearForm(): void {
      if (this.editPatientForm) {
        this.editPatientForm.reset();
      }
    }

    ngOnDestroy(): void {
      this.destroy$.next();
      this.destroy$.complete();
    }
}
