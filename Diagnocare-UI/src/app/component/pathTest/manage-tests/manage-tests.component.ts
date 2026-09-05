
import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ViewEncapsulation } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AddEditModalComponent } from '../add-edit-modal/add-edit-modal.component';
import { jwtDecode } from 'jwt-decode';
import { ToastrService } from 'ngx-toastr';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CommonService } from 'src/app/shared/common.service';
import { PathTestService } from 'src/app/services/pathTestServices/path-test-service';
import { ConfirmModalComponent } from 'src/app/shared/confirm-modal/confirm-modal.component';
import { ConfirmModalService } from 'src/app/shared/confirm-modal/confirm-modal.service';
import { DropRequestDTO } from 'src/app/models/path-test/drop-request.dto';
import { GroupSubGroupModel } from 'src/app/models/path-test/group/group.model';
import { TestItem } from 'src/app/models/path-test/test/test.model';
import { TestProtocolModalComponent } from '../test-protocol-modal/test-protocol-modal.component';

@Component({
  selector: 'app-manage-tests',
  templateUrl: './manage-tests.component.html',
  styleUrls: ['./manage-tests.component.scss'],
  standalone: true,
  imports: [FormsModule, CommonModule, AddEditModalComponent, ConfirmModalComponent, TestProtocolModalComponent],
  encapsulation: ViewEncapsulation.None
})
export class ManageTestsComponent implements OnInit,OnDestroy {
  query = '';
  pathologyId: string = '';
  groups: GroupSubGroupModel[] = [];
  subGroups: GroupSubGroupModel[] = [];
  tests: TestItem[] = [];

  selectedGroupId: string | null = null;
  selectedSubGroupId: string | null = null;
  selectedTest: TestItem | null = null;
  selectedTestId: string | null = null;

  // Multi-selection management
  selectedTests: TestItem[] = [];
  focusedTestId: string | null = null;

  // Modal state
  showAddModal = false;

  // Toast
  toastVisible = false;
  toastMessage = '';
  private toastTimer: any = null;

   private destroy$ = new Subject<void>();

  showModal:boolean = false;
  mode:'add' | 'edit' = "add";

  /** Sample-collection protocol editor, open for the currently selected test. */
  showProtocolModal = false;

  /** Tracks what the user explicitly clicked last — independent of auto-selection during data load. */
  lastUserSelection: 'group' | 'subgroup' | 'test' | null = null;

  constructor(
    private _route: Router,
    private _pathTest: PathTestService,
    private toastr: ToastrService,
    private _commonService: CommonService,
    private _confirmModal: ConfirmModalService
  ){}

  ngOnInit(): void {
    const token = this._commonService.getAccessToken();
    const decoded = jwtDecode<any>(token || '');
    this.pathologyId = decoded.typ;
    this.getAllGroupList(true);
    window.addEventListener('hashchange', this.handleHashChange);
  }

  handleHashChange = () => {
    // Reload group list and reset selection on hash change
    this.getAllGroupList(true);
    this.selectedGroupId = null;
    this.selectedSubGroupId = null;
    this.selectedTest = null;
    this.selectedTests = [];
    this.focusedTestId = null;
    this.showAddModal = false;
    this.showModal = false;
    this.showProtocolModal = false;
    this.mode = 'add';
    this.lastUserSelection = null;
  }

 
  // Helper to check if selectedGroupId is valid
  get isSelectedGroupIdValid(): boolean {
    return !!this.selectedGroupId && this.groups.some(g => g.testGroupId === this.selectedGroupId);
  }
  // Filter helpers
  get filteredGroups(): GroupSubGroupModel[] {
    const q = this.query.trim().toLowerCase();
    if (!q) return this.groups;
    return this.groups.filter(g => `${g.testGroupId} ${g.name}`.toLowerCase().includes(q));
  }

  get filteredSubGroups(): GroupSubGroupModel[] {
    const q = this.query.trim().toLowerCase();
    let list = this.subGroups.filter(s => s.parentGroupId === this.selectedGroupId);
    if (!q) return list;
    return list.filter(s => `${s.testGroupId} ${s.name}`.toLowerCase().includes(q));
  }

  get filteredTests(): TestItem[] {
    const q = this.query.trim().toLowerCase();
    let list = this.tests.filter(t => t.subGroupId === this.selectedSubGroupId);
    if (!q) return list;
    return list.filter(t => `${t.testCode} ${t.testName}`.toLowerCase().includes(q));
  }

  openModal() {
    this.showModal = true;
  }

  /**
   * Maps a frontend GroupSubGroupModel to the backend GroupSubgroupDTO shape.
   *
   * The mismatch that was causing empty Code/Name on the backend:
   *   frontend  testGroupId  → backend  GroupSubgroupCode
   *   frontend  name         → backend  GroupSubGroupName
   *   frontend  price        → backend  Price          (case-insensitive, already worked)
   *   frontend  parentGroupId→ backend  ParentGroupId  (case-insensitive, already worked)
   */
  private mapGroupToDTO(model: GroupSubGroupModel, parentGroupId: string): any {
    return {
      GroupRegId:        model.groupRegId,
      GroupSubgroupCode: model.groupSubgroupCode || model.testGroupId,
      GroupSubGroupName: model.name,
      Price:             model.price,
      ParentGroupId:     parentGroupId,
      TemplateId:        model.templateId ?? null,
    };
  }

  /** Maps a frontend TestItem to the backend PathologyTest shape. */
  private mapTestToDTO(test: TestItem): any {
    return {
      TestRegId:  test.testRegId,
      TestCode:   test.testCode,
      TestName:   test.testName,
      Price:      test.price,
      SubGroupId: test.subGroupId,
      GroupId:    test.GroupId,
      TemplateId: test.templateId ?? null,
    };
  }

  handleSubmit(data: any) {
    let payload: any = {
      Group: undefined,
      SubGroups: [],
      Tests: []
    };

    if (data?.mode === 'add') {

      if (data.selected === 'group') {

        if (data.step === 1) {
          // Group only
          payload.Group = this.mapGroupToDTO(data.formData.group, '0');

        } else if (data.step === 2) {
          // Group + SubGroup
          payload.Group     = this.mapGroupToDTO(data.formData.group, '0');
          payload.SubGroups = [this.mapGroupToDTO(data.formData.subGroup, data.formData.group.testGroupId)];

        } else if (data.step === 3) {
          // Group + SubGroup + Test
          data.formData.test.subGroupId = data.formData.subGroup.testGroupId;
          data.formData.test.GroupId    = data.formData.group.testGroupId;
          payload.Group     = this.mapGroupToDTO(data.formData.group, '0');
          payload.SubGroups = [this.mapGroupToDTO(data.formData.subGroup, data.formData.group.testGroupId)];
          payload.Tests     = [this.mapTestToDTO(data.formData.test)];
        }

      } else if (data.selected === 'subgroup') {

        if (data.step === 1) {
          // SubGroup only
          payload.SubGroups = [this.mapGroupToDTO(data.formData.subGroup, data.formData.subGroup.parentGroupId)];

        } else if (data.step === 2) {
          // SubGroup + Test
          data.formData.test.subGroupId = data.formData.subGroup.testGroupId;
          data.formData.test.GroupId    = data.formData.subGroup.parentGroupId;
          payload.SubGroups = [this.mapGroupToDTO(data.formData.subGroup, data.formData.subGroup.parentGroupId)];
          payload.Tests     = [this.mapTestToDTO(data.formData.test)];
        }

      } else if (data.selected === 'test') {
        // Test only
        data.formData.test.subGroupId = data.formData.subGroup.testGroupId;
        data.formData.test.GroupId    = data.formData.group.testGroupId;
        payload.Tests = [this.mapTestToDTO(data.formData.test)];
      }

      // Remove empty keys for backend compatibility
      if (!payload.Group)           delete payload.Group;
      if (!payload.SubGroups.length) delete payload.SubGroups;
      if (!payload.Tests.length)     delete payload.Tests;

      // Capture the IDs of what was just added so we can navigate to it after reload
      const addedGroupId    = data.formData.group?.testGroupId    ?? null;
      const addedSubGroupId = data.formData.subGroup?.testGroupId ?? null;
      const addedTestCode   = data.formData.test?.testCode        ?? null;
      const addedSelected   = data.selected as string;
      const addedStep       = data.step as number;

      this._pathTest.AddGroupWithSubgroupsAndTests(payload).subscribe({
        next: () => {
          this.reloadAndSelect(addedSelected, addedStep, addedGroupId, addedSubGroupId, addedTestCode);
          if (typeof data.done === 'function') data.done();
        },
        error: () => {
          // Message shown centrally by ErrorInterceptor.
          if (typeof data.done === 'function') data.done();
        }
      });

    } else if (data?.mode === 'edit') {

      if (data.selected === 'group') {
        const groupDTO = this.mapGroupToDTO(data.updatedFormData.group, '0');
        this._pathTest.updateGroupDetails(groupDTO).subscribe({
          next: () => {
            this.getAllGroupList();
            if (typeof data.done === 'function') data.done();
          },
          error: () => {
            // Message shown centrally by ErrorInterceptor.
            if (typeof data.done === 'function') data.done();
          }
        });

      } else if (data.selected === 'subgroup') {
        const parentId  = data.updatedFormData.group?.testGroupId ?? '';
        const subDTO    = this.mapGroupToDTO(data.updatedFormData.subGroup, parentId);
        this._pathTest.updateGroupDetails(subDTO).subscribe({
          next: () => {
            this.getAllGroupList();
            if (typeof data.done === 'function') data.done();
          },
          error: () => {
            // Message shown centrally by ErrorInterceptor.
            if (typeof data.done === 'function') data.done();
          }
        });

      } else if (data.selected === 'test') {
        data.updatedFormData.test.subGroupId = data.updatedFormData.subGroup?.testGroupId ?? '';
        data.updatedFormData.test.GroupId    = data.updatedFormData.group?.testGroupId    ?? '';
        const testDTO = this.mapTestToDTO(data.updatedFormData.test);
        this._pathTest.updatePathTest(testDTO).subscribe({
          next: () => {
            this.getAllGroupList(true);
            if (typeof data.done === 'function') data.done();
          },
          error: () => {
            // Message shown centrally by ErrorInterceptor.
            if (typeof data.done === 'function') data.done();
          }
        });
      }
    }
  }

  selectGroup(g: GroupSubGroupModel) {
    this.lastUserSelection = 'group';
    this.selectedGroupId = g.testGroupId;
    this.selectedSubGroupId = null;
    this.selectedTest = null;
    this.selectedTestId = null;
    this.tests = [];
    this.getAllSubGroupList(true);
  }

  selectSubGroup(s: GroupSubGroupModel) {
    this.lastUserSelection = 'subgroup';
    this.selectedSubGroupId = s.testGroupId;
    this.selectedTest = null;
    this.selectedTestId = null;
    this.getAllTestList();
  }

  selectTest(t: TestItem) {
    this.lastUserSelection = 'test';
    this.selectedTest = t;
    this.selectedTestId = t.testCode;
  }

  // Note - TObe Done after designs, will discuss with vanchhit
  add() { 
    this.mode = "add";
    this.openModal();
  }

  /**
   * After a successful add, reload the full list and navigate to the item that was just created.
   *
   * Selection priority:
   *  - group (step 1)              → select that group, auto-select its first subgroup + test
   *  - group (step 2, group+sub)   → select that group → select that subgroup, auto-load tests
   *  - group (step 3, all)         → select group → subgroup → specific test
   *  - subgroup (step 1)           → select parent group → select that subgroup
   *  - subgroup (step 2, sub+test) → select parent group → subgroup → specific test
   *  - test only                   → keep existing group/subgroup, reload test list and focus test
   */
  private reloadAndSelect(
    selected: string,
    step: number,
    groupId: string | null,
    subGroupId: string | null,
    testCode: string | null
  ) {
    this._pathTest.getAllGroupList().pipe(takeUntil(this.destroy$)).subscribe({
      next: (data: any) => {
        this.groups = Array.isArray(data)
          ? data.filter(g => g && g.testGroupId && g.testGroupId !== '' && g.name && g.name !== '')
          : [];

        if (!this.groups.length) return;

        // Determine which group to highlight
        const targetGroupId = groupId ?? this.selectedGroupId ?? this.groups[0].testGroupId;
        const matchedGroup  = this.groups.find(g => g.testGroupId === targetGroupId) ?? this.groups[0];
        this.selectedGroupId = matchedGroup.testGroupId;

        if (selected === 'test' && subGroupId) {
          // Test-only add: group and subgroup were already selected — just reload tests
          this.selectedSubGroupId = subGroupId ?? this.selectedSubGroupId;
          this._pathTest.getAllSubGroupList(this.selectedGroupId).pipe(takeUntil(this.destroy$)).subscribe({
            next: (subs: any) => {
              this.subGroups = subs ?? [];
              this._pathTest.getAllTestList(this.selectedSubGroupId).pipe(takeUntil(this.destroy$)).subscribe({
                next: (tests: any) => {
                  this.tests = tests ?? [];
                  if (testCode) {
                    const match = this.tests.find(t => t.testCode === testCode);
                    if (match) { this.selectedTest = match; this.selectedTestId = match.testCode; this.lastUserSelection = 'test'; }
                  }
                }
              });
            }
          });
          return;
        }

        // Load subgroups for the resolved group
        this._pathTest.getAllSubGroupList(this.selectedGroupId).pipe(takeUntil(this.destroy$)).subscribe({
          next: (subs: any) => {
            this.subGroups = subs ?? [];

            // Determine which subgroup to highlight
            const targetSubId = subGroupId ?? (this.subGroups[0]?.testGroupId ?? null);
            const matchedSub  = this.subGroups.find(s => s.testGroupId === targetSubId) ?? this.subGroups[0] ?? null;
            this.selectedSubGroupId = matchedSub?.testGroupId ?? null;

            if (!this.selectedSubGroupId) return;

            this._pathTest.getAllTestList(this.selectedSubGroupId).pipe(takeUntil(this.destroy$)).subscribe({
              next: (tests: any) => {
                this.tests = tests ?? [];

                // Focus a specific test if one was just added
                if (testCode) {
                  const match = this.tests.find(t => t.testCode === testCode);
                  if (match) {
                    this.selectedTest   = match;
                    this.selectedTestId = match.testCode;
                    this.lastUserSelection = 'test';
                  }
                } else if (selected === 'subgroup') {
                  this.lastUserSelection = 'subgroup';
                } else if (selected === 'group') {
                  this.lastUserSelection = 'group';
                }
              }
            });
          }
        });
      },
      error: (err) => {
        console.error('Group reload after add failed:', err);   // message shown centrally by ErrorInterceptor
      }
    });
  }

  getAllGroupList(autoSelectFirst: boolean = false) {
    this._pathTest.getAllGroupList().pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (data: any) => {
        // Filter out invalid group objects (e.g., default/empty group from backend)
        this.groups = Array.isArray(data)
          ? data.filter(g => g && g.testGroupId && g.testGroupId !== '' && g.name && g.name !== '')
          : [];
        if (!this.groups?.length) {
          console.warn('No valid groups returned');
          return;
        }
        const firstGroup = this.groups[0];
        this.selectedGroupId = firstGroup?.testGroupId ?? null;
        if (this.selectedGroupId) {
          this.getAllSubGroupList(autoSelectFirst);
        } else {
          console.warn('testGroupId is null or undefined');
        }
      },
      error: (err) => {
        console.error('Group fetch failed:', err);   // message shown centrally by ErrorInterceptor
      }
    });
  }

  getAllSubGroupList(autoSelectFirst: boolean = false) {
    this._pathTest.getAllSubGroupList(this.selectedGroupId).pipe(
      takeUntil(this.destroy$)).subscribe({
      next: (data: any) => {
        this.subGroups = data;
        if (autoSelectFirst && this.subGroups?.length) {
          this.selectedSubGroupId = this.subGroups[0].testGroupId;
          this.getAllTestList();
        }
      },
      error: (err) => {
        console.error('SubGroup fetch failed:', err);   // message shown centrally by ErrorInterceptor
      }
    });
  }

  getAllTestList() {
    this._pathTest.getAllTestList(this.selectedSubGroupId).pipe(
      takeUntil(this.destroy$)).subscribe({
      next: (data: any) => {
        this.tests = data;
      },
      error: (err) => {
        console.error('Test fetch failed:', err);   // message shown centrally by ErrorInterceptor
      }
    });
  }
  
  /** Confirms and deletes the item the user explicitly selected. */
  drop() {
    const request = new DropRequestDTO();
    let label = '';
    let message = '';

    switch (this.lastUserSelection) {
      case 'test':
        if (!this.selectedTest) {
          this.toastr.warning('Please select a test to drop.', 'Nothing Selected');
          return;
        }
        label = `Test "${this.selectedTest.testName} (${this.selectedTest.testCode})"`;
        request.type = 'test';
        request.testRegId = this.selectedTest.testRegId;
        message = `Are you sure you want to permanently delete ${label}?`;
        break;

      case 'subgroup': {
        if (!this.selectedSubGroupId) {
          this.toastr.warning('Please select a sub-group to drop.', 'Nothing Selected');
          return;
        }
        const sg = this.subGroups.find(s => s.testGroupId === this.selectedSubGroupId);
        label = `Sub-Group "${sg?.name ?? this.selectedSubGroupId}"`;
        request.type = 'subgroup';
        request.groupSubgroupId = this.selectedSubGroupId;
        message = `Are you sure you want to permanently delete ${label}? This will also delete all tests under it.`;
        break;
      }

      case 'group': {
        if (!this.selectedGroupId) {
          this.toastr.warning('Please select a group to drop.', 'Nothing Selected');
          return;
        }
        const g = this.groups.find(gr => gr.testGroupId === this.selectedGroupId);
        label = `Group "${g?.name ?? this.selectedGroupId}"`;
        request.type = 'group';
        request.groupSubgroupId = this.selectedGroupId;
        message = `Are you sure you want to permanently delete ${label}? This will also delete all associated sub-groups and tests.`;
        break;
      }

      default:
        this.toastr.warning('Please select a group, sub-group, or test to drop.', 'Nothing Selected');
        return;
    }

    this._confirmModal.confirm({
      title: 'Confirm Delete',
      message,
      confirmText: 'Yes, Delete',
      cancelText: 'Cancel'
    }).subscribe(confirmed => {
      if (!confirmed) { this.lastUserSelection = null; return; }

      this._pathTest.dropTest(request).subscribe({
        next: () => {
          this.selectedTest = null;
          this.selectedTestId = null;
          if (request.type === 'group') {
            this.selectedGroupId = null;
            this.selectedSubGroupId = null;
            this.tests = [];
            this.subGroups = [];
          } else if (request.type === 'subgroup') {
            this.selectedSubGroupId = null;
            this.tests = [];
          }
          this.lastUserSelection = null;
          this.getAllGroupList(true);
        },
        error: () => {
          // Message shown centrally by ErrorInterceptor.
          this.lastUserSelection = null;
        }
      });
    });
  }
  edit() 
  { 
      this.mode = "edit";
      this.openModal();
  }
  manageTestParameter()
  {
    if(this.selectedTest!=null)
    {
      this._route.navigate(['manage-tests/addTestParameter',this.selectedTest.testRegId]);
    }
    else{
      this.toastr.warning('Please select a test to manage its parameters.', 'No Test Selected');
    }
  }

  /**
   * Opens the sample-collection protocol editor for the selected test.
   *
   * A modal rather than a route, unlike Manage Parameter: a protocol is one form for one
   * test, and keeping the catalogue browser visible behind it means the admin can close it
   * and move to the next test without re-navigating and losing their place in the list.
   */
  manageTestProtocol()
  {
    if (this.selectedTest != null) {
      this.showProtocolModal = true;
    } else {
      this.toastr.warning('Please select a test to manage its sample collection protocol.', 'No Test Selected');
    }
  }

  closeProtocolModal()
  {
    this.showProtocolModal = false;
  }

  /**
   * After a protocol is saved or removed. Nothing in the three catalogue columns is
   * derived from the protocol, so there is no list to reload — the editor re-reads on its
   * next open, and the booking screens read from the API each time.
   */
  onProtocolSaved()
  {
    this.showProtocolModal = false;
  }
  close() { 
    this._route.navigate(['/patients']);
  }

  closeModal(){
    this.showModal = false;
  }
  addTests() {
    this.showAddModal = true;
  }

  onModalClosed() {
    this.showAddModal = false;
    // Refresh the test list when modal is closed
    this.getAllGroupList();
  }
   
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    window.removeEventListener('hashchange', this.handleHashChange);
  }
}
