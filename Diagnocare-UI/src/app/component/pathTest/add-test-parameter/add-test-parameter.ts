 
import { CommonModule } from '@angular/common';
import { Component, ViewEncapsulation, OnInit, OnDestroy } from '@angular/core';
import { FormGroup, FormArray, FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { TestParameter } from 'src/app/services/pathTestServices/test-parameter';
import { UnitService }    from 'src/app/services/unitServices/unit.service';
import { LoadingSpinnerComponent } from 'src/app/shared/loading-spinner/loading-spinner.component';
import { TestItemParameter } from 'src/app/models/path-test/parameter/parameter.model';
import { TestItem } from 'src/app/models/path-test/test/test.model';
import { FormKeyboardDirective } from 'src/app/shared/directives/form-keyboard.directive';

@Component({
  selector: 'app-add-test-parameter',
  imports: [ReactiveFormsModule, CommonModule, LoadingSpinnerComponent, FormKeyboardDirective],
  templateUrl: './add-test-parameter.html',
  styleUrls: ['./add-test-parameter.scss'],
  encapsulation: ViewEncapsulation.None 
})
export class AddTestParameter implements OnInit, OnDestroy {

  testRegId: string='';
  testItem: TestItem | null = null;
  parameterform: FormGroup;
  parameterUnits: string[] = [];
  lstOriginalParameterArray: TestItemParameter[] = [];
  lstParameterArray: TestItemParameter[] = [];
  loadingDetails = false;
  loadingParameters = false;
  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private _testParamService: TestParameter,
    private _route: Router,
    private unitService: UnitService,
  ) {
    this.parameterform = new FormGroup({
      parameters: new FormArray([])
    });
  }
  ngOnInit(): void {
    this.parameterUnits = this.unitService.getAll();
    this.testRegId = this.route.snapshot.paramMap.get('id')!;
    this.loadTestDetails();
    this.loadParameters();
    window.addEventListener('hashchange', this.handleHashChange);
  }

  handleHashChange = () => {
    // Optionally, you can check if the hash is relevant before reloading
    this.testRegId = this.route.snapshot.paramMap.get('id')!;
    this.loadTestDetails();
    this.loadParameters();
  };

  get parameters(): FormArray {
    return this.parameterform.get('parameters') as FormArray;
  }
  
  get isLoading(): boolean {
    return this.loadingDetails || this.loadingParameters;
  }

  loadTestDetails(): void {
    this.loadingDetails = true;
    this._testParamService.GetTestDetails(Number(this.testRegId)).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loadingDetails = false; })
    ).subscribe({
      next: (testData: TestItem) => {
        this.testItem = testData;
      },
      error: (err) => {
        console.error('Failed to load test details:', err);
        this.toastr.error('Failed to load test details', 'Error');
      }
    });
  }
  loadParameters(): void {
    this.loadingParameters = true;
    this._testParamService.GetTestParameter(Number(this.testRegId)).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loadingParameters = false; })
    ).subscribe({
      next: (paramData: any) => {
        if (paramData && paramData.length > 0) {
          this.lstParameterArray = paramData;
          this.lstOriginalParameterArray = JSON.parse(JSON.stringify(paramData));
          this.lstParameterArray.forEach((param) => {
            // Support both hyphen and en-dash; normalise original to hyphen
            // so the Modified comparison in submit() doesn't produce false positives.
            const range    = param.parameterRange ? param.parameterRange.split(/[-–]/) : ['', ''];
            const RefLow   = range[0] ? range[0].trim() : '';
            const RefHigh  = range[1] ? range[1].trim() : '';
            param.parameterRange = RefLow && RefHigh ? `${RefLow}-${RefHigh}` : (param.parameterRange ?? '');

            this.parameters.push(
              new FormGroup({
                parameterId:        new FormControl(param.parameterId),
                parameterName:      new FormControl(param.parameterName),
                parameterUnit:      new FormControl(param.parameterUnit),
                parameterRangeLow:  new FormControl(RefLow),
                parameterRangeHigh: new FormControl(RefHigh),
              })
            );
          });
        } else {
          this.addRow();
        }
      },
      error: (err) => {
        console.error('Failed to load parameters:', err);
        this.toastr.error('Failed to load parameters', 'Error');
        this.addRow();
      }
    });
  }
   // ...existing code...

  closeAndGoToManageTest(): void {
    this._route.navigate(['/manage-tests']);
  }
  addRow(): void {
    const group = new FormGroup({
      parameterId:        new FormControl(0),
      parameterName:      new FormControl(''),
      parameterUnit:      new FormControl(''),
      parameterRangeLow:  new FormControl(''),
      parameterRangeHigh: new FormControl(''),
    });
    this.parameters.push(group);
  }

 removeRow(index: number): void {
    this.parameters.removeAt(index);
  }

  submit(): void {

    let items: any[] = this.parameterform.value.parameters;

    // Combine low/high into parameterRange for saving
    const validItems: any[] = items.filter((item: any) =>
      item.parameterName && item.parameterUnit && (item.parameterRangeLow !== '' && item.parameterRangeHigh !== '')
    ).map((item: any) => ({
      ...item,
      parameterRange: `${item.parameterRangeLow}-${item.parameterRangeHigh}`
    }));

    if (validItems.length !== items.length) {
      this.toastr.error('Please add at least one valid parameter','Error');
      return;
    }

    this.parameters.clear();
    validItems.forEach((item: any) => {
      this.parameters.push(
        new FormGroup({
          parameterId:        new FormControl(item.parameterId),
          parameterName:      new FormControl(item.parameterName),
          parameterUnit:      new FormControl(item.parameterUnit),
          parameterRangeLow:  new FormControl(item.parameterRangeLow),
          parameterRangeHigh: new FormControl(item.parameterRangeHigh),
        })
      );
    });

    validItems.forEach((item: any) => {
      item.testRegId = Number(this.testRegId);
    });

    const currentValues = validItems; // array of form values
    const changes: any[] = [];

    // Pass 1: Add or Modify
    currentValues.forEach((current: any) => {
      const original = this.lstOriginalParameterArray.find((o) => o.parameterId === current.parameterId);

      if (!original) {
        changes.push({ ...current, type: 'Add' });
      } else if (
        current.parameterName  !== original.parameterName  ||
        current.parameterUnit  !== original.parameterUnit  ||
        current.parameterRange !== original.parameterRange
      ) {
        changes.push({ ...current, type: 'Modified' });
      }
    });

    // Pass 2: Delete — a row is deleted when its parameterId is no longer present
    this.lstOriginalParameterArray.forEach((original: TestItemParameter) => {
      const stillPresent = currentValues.some(c => c.parameterId === original.parameterId);
      if (!stillPresent) {
        changes.push({ ...original, type: 'Delete' });
      }
    });

    this._testParamService.AddTestParameter(changes).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (result: boolean) => {    
          if(result) {
            this.toastr.success('Test parameters added successfully','Success');
            this.parameterform.reset();
            this.parameters.clear();
            this._route.navigate(['manage-tests']);
          }
          else {
            this.toastr.error('Failed to add test parameters','Error');
          }
        },
        error: (err) => {
          console.error('Failed to save parameters:', err);
          this.toastr.error('Failed to save test parameters', 'Error');
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    window.removeEventListener('hashchange', this.handleHashChange);
  }
}
