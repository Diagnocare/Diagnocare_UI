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
import { LoadingSpinnerComponent } from 'src/app/shared/loading-spinner/loading-spinner.component';
import { salutation, ageGroup, gender, maritalStatus, relations, referredByType } from 'src/app/constant/enums';
import { tabOrderEdit, DEFAULT_DIALING_CODE } from 'src/app/constant/constants';

@Component({
  selector: 'app-edit-patient',
  templateUrl: './edit-patient.component.html',
  styleUrls: ['./edit-patient.component.scss'],
  standalone: true,
  imports: [ReactiveFormsModule,FormsModule,CommonModule,LoadingSpinnerComponent
  ]
})
export class EditPatientComponent implements OnInit, OnDestroy {
  
  private destroy$ = new Subject<void>();

  isLoading: boolean = false;
  formSubmitted: boolean = false;
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

  constructor(private _route:Router,private formBuilder:FormBuilder,private route: ActivatedRoute, 
    private _patientService: PatientService,private toastr:ToastrService,private _common:CommonService)
  {
    this.editPatientForm = this.formBuilder.group({
      country_Code:      ['+91', Validators.required],
      patient_Salutation: [""],
      patient_Name: ["", [Validators.required]],
      patient_Address: ["", [Validators.required]],
      patient_DOB: ["", [Validators.required]],
      patient_Age: ["", [Validators.required]],
      patient_Age_Group: [""],
      patient_Gender: ["", [Validators.required]],
      patient_Marital_Status: ["", [Validators.required]],
      relation: ["", Validators.required],
      relative_Name: ["", Validators.required],
      patient_Contact: ["", [Validators.required, Validators.pattern(/^[0-9]{10}$/)]],
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
      error: () => {
        this.isLoading = false;
        this.toastr.error('Failed to load patient details', 'Error');
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
      this.editPatientForm.patchValue({ patient_Age: '', patient_Age_Group: '' });
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
      this.editPatientForm.patchValue({ patient_Age: '', patient_Age_Group: '' });
    }
  }
    calculateAge(): void {
      const formDOB = this.editPatientForm.get('patient_DOB')?.value;
      const isoDate = this._common.setYearofDate(formDOB); // used internally only — not written back to form

      const age      = this._common.calculateAge(isoDate);
      const ageRange = parseInt(age.split(' ')[0]);

      let ageGroupValue = '';
      if      (ageRange < 1)                    ageGroupValue = this.ageRange[0];
      else if (ageRange >= 1  && ageRange < 18) ageGroupValue = this.ageRange[1];
      else if (ageRange >= 18 && ageRange < 60) ageGroupValue = this.ageRange[2];
      else                                      ageGroupValue = this.ageRange[3];

      this.editPatientForm.patchValue({ patient_Age: age, patient_Age_Group: ageGroupValue });
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
        patientContact:       `${formValue.country_Code}-${formValue.patient_Contact}`,
        patientEmail:         formValue.patient_Email ?? ''
      };

      this._patientService.updatePatientDetails(payload).pipe(takeUntil(this.destroy$)).subscribe({
        next: (res) => {
          this.toastr.success('Patient updated successfully', 'Success');
          this._route.navigate(['/patients']);
          this.isLoading = false;
        },
        error: (err) => {
          this.toastr.error('Failed to update patient', 'Error');
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