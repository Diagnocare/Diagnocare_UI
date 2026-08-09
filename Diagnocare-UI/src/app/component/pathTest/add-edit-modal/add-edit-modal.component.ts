import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ViewEncapsulation } from '@angular/core';
import { forkJoin, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { LoadingSpinnerComponent } from 'src/app/shared/loading-spinner/loading-spinner.component';
import { PathTestService } from 'src/app/services/pathTestServices/path-test-service';
import { GroupSubGroupModel } from 'src/app/models/path-test/group/group.model';
import { TestItem } from 'src/app/models/path-test/test/test.model';

type AddType = 'group' | 'subgroup' | 'test';


@Component({
  selector: 'app-add-edit-modal',
  standalone: true,
  templateUrl: './add-edit-modal.component.html',
  styleUrls: ['./add-edit-modal.component.scss'],
  imports:[FormsModule,CommonModule,LoadingSpinnerComponent],
  encapsulation: ViewEncapsulation.None
})
export class AddEditModalComponent implements OnInit, OnDestroy {

  @Input() mode: 'add' | 'edit' = 'add';
  @Input() groups: GroupSubGroupModel[] = [];
  @Input() subGroups: GroupSubGroupModel[] = [];
  @Input() tests: TestItem[] = [];
  @Output() openChange = new EventEmitter<boolean>();
  @Output() closed = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<any>();

  selected: string | null = null;
  ModalHeading: string = "Add New Item";
  groupForm = {
    id: '',
    name: '',
    rate: 0
  };

  step: number = 0;
  lastStep: boolean = false;
  addType: AddType = 'test';
  isLoading = false;

  /** True while background code-list fetch is in progress. */
  codesLoading = false;
  editSubGroups: GroupSubGroupModel[] = [];
  editTests: TestItem[] = [];
  editSubGroupsLoading = false;
  editTestsLoading = false;

  /**
   * Per-group / per-subgroup response cache, keyed by code.
   *
   * The modal is created fresh on every open (*ngIf="showModal" in the parent),
   * so the cache lives exactly one editing session — long enough to make
   * toggling back and forth between dropdown values free, short enough that it
   * can never serve data staled by an update the user just saved.
   *
   * Seeded in ngOnInit from the parent's already-fetched lists, so editing the
   * group/subgroup that is currently highlighted in the background browser —
   * the common case — costs no network call at all.
   */
  private subGroupCache = new Map<string, GroupSubGroupModel[]>();
  private testCache     = new Map<string, TestItem[]>();

  formData = {
    group: new GroupSubGroupModel(),
    subGroup: new GroupSubGroupModel(),
    test: new TestItem()
  };
  updatedFormData = {
    group: new GroupSubGroupModel(),
    subGroup: new GroupSubGroupModel(),
    test: new TestItem()
  };

  groupData    = { id: '', name: '', rate: '' };
  subGroupData = { id: '', name: '', rate: '', groupId: '' };
  testData     = { id: '', name: '', rate: '', subGroupId: '' };

  // ── Registration IDs for edit mode ─────────────────────────────────────────
  /** Registration ID for the group being edited (sent to backend) */
  private groupRegId: number = 0;
  /** Registration ID for the subgroup being edited (sent to backend) */
  private subGroupRegId: number = 0;
  /** Registration ID for the test being edited (sent to backend) */
  private testRegId: number = 0;

  // ── Code-generation state ──────────────────────────────────────────────────
  /** All subgroup codes across every group (fetched on init). */
  private allSubGroupCodes: string[] = [];
  /** All test codes across every subgroup (fetched on init). */
  private allTestCodes: string[] = [];
  private codesLoaded = false;
  private destroy$ = new Subject<void>();

  constructor(
    private _pathTest: PathTestService
  ) {
    window.addEventListener('hashchange', this.handleHashChange);
  }

  ngOnInit(): void {
    if (this.mode === 'add') {
      this.loadAllCodes();
    } else {
      this.seedEditCachesFromInputs();
    }
  }

  /**
   * Populates the caches from the lists the parent already holds, so the most
   * common edit (the group/subgroup currently selected in the background) needs
   * no fetch. The parent's `subGroups` all share one parentGroupId and its
   * `tests` all share one subGroupId, so we simply bucket by those keys.
   */
  private seedEditCachesFromInputs(): void {
    for (const s of this.subGroups ?? []) {
      if (!s?.parentGroupId || !s.testGroupId || !s.name) continue;
      const bucket = this.subGroupCache.get(s.parentGroupId) ?? [];
      bucket.push(s);
      this.subGroupCache.set(s.parentGroupId, bucket);
    }

    for (const t of this.tests ?? []) {
      if (!t?.subGroupId || !t.testCode) continue;
      const bucket = this.testCache.get(t.subGroupId) ?? [];
      bucket.push(t);
      this.testCache.set(t.subGroupId, bucket);
    }
  }

  // ── Code fetching ──────────────────────────────────────────────────────────

  /**
   * Loads ALL subgroup + test codes from the backend so that generateNextCode()
   * always produces a globally-unique sequential value.
   *
   * Runs two parallel waves:
   *  Wave 1 – getAllSubGroupList() for every group simultaneously (forkJoin).
   *  Wave 2 – getAllTestList() for every discovered subgroup simultaneously.
   */
  private loadAllCodes(): void {
    if (this.codesLoaded || !this.groups.length) {
      this.codesLoaded = true;
      return;
    }

    this.codesLoading = true;

    const subGroupCalls = this.groups.map(g =>
      this._pathTest.getAllSubGroupList(g.testGroupId)
    );

    forkJoin(subGroupCalls).pipe(takeUntil(this.destroy$)).subscribe({
      next: (subResults) => {
        const allSubs = subResults.flat();
        this.allSubGroupCodes = allSubs.map(s => s.testGroupId);

        if (!allSubs.length) {
          this.codesLoaded  = true;
          this.codesLoading = false;
          return;
        }

        const testCalls = allSubs.map(s =>
          this._pathTest.getAllTestList(s.testGroupId)
        );

        forkJoin(testCalls).pipe(takeUntil(this.destroy$)).subscribe({
          next: (testResults) => {
            this.allTestCodes = testResults.flat().map((t: any) => t.testCode);
            this.codesLoaded  = true;
            this.codesLoading = false;
          },
          error: () => {
            this.codesLoaded  = true;
            this.codesLoading = false;
          }
        });
      },
      error: () => {
        this.codesLoaded  = true;
        this.codesLoading = false;
      }
    });
  }

  // ── Code generation ────────────────────────────────────────────────────────

  /**
   * Returns the next sequential code for a given prefix.
   *
   * Algorithm:
   *  1. Strip non-numeric chars from every existing code → parse as int.
   *  2. Take max (default 0 when list is empty).
   *  3. Return prefix + (max + 1) zero-padded to at least 2 digits.
   *
   * Examples:
   *   generateNextCode(['G01','G02','G05'], 'G')  →  'G06'
   *   generateNextCode([], 'S')                   →  'S01'
   *   generateNextCode(['T009','T010'], 'T')       →  'T11'   (no leading zero once ≥ 10)
   */
  private generateNextCode(existingCodes: string[], prefix: string): string {
    const nums = existingCodes
      .map(c => parseInt(c.replace(/\D/g, ''), 10))
      .filter(n => !isNaN(n) && n > 0);
    const max  = nums.length ? Math.max(...nums) : 0;
    const next = max + 1;
    return `${prefix}${next < 10 ? '0' + next : next}`;
  }

  /**
   * Called after each step increment (add mode only).
   * Assigns the auto-generated code to the correct formData field for that step.
   */
  private assignCodeForStep(): void {
    if (this.mode !== 'add') return;

    const groupCodes = this.groups.map(g => g.testGroupId);

    switch (this.selected) {
      case 'group':
        if (this.step === 1) {
          this.formData.group.testGroupId    = this.generateNextCode(groupCodes, 'G');
        } else if (this.step === 2) {
          this.formData.subGroup.testGroupId = this.generateNextCode(this.allSubGroupCodes, 'S');
        } else if (this.step === 3) {
          this.formData.test.testCode        = this.generateNextCode(this.allTestCodes, 'T');
        }
        break;

      case 'subgroup':
        if (this.step === 1) {
          this.formData.subGroup.testGroupId = this.generateNextCode(this.allSubGroupCodes, 'S');
        } else if (this.step === 2) {
          this.formData.test.testCode        = this.generateNextCode(this.allTestCodes, 'T');
        }
        break;

      case 'test':
        if (this.step === 1) {
          this.formData.test.testCode        = this.generateNextCode(this.allTestCodes, 'T');
        }
        break;
    }
  }

  // ── Lifecycle / event handlers ─────────────────────────────────────────────

  handleHashChange = () => {
    this.resetForm();
    this.closed.emit();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    window.removeEventListener('hashchange', this.handleHashChange);
  }

  close() {
    if (this.isLoading) return;
    this.closed.emit();
    this.resetForm();
  }

  // Validation for enabling Create/Next button for subgroup
  get isSubGroupStepValid(): boolean {
    if (this.selected === 'subgroup' && this.step === 1) {
      return !!this.formData.subGroup.parentGroupId &&
        !!this.formData.subGroup.testGroupId &&
        !!this.formData.subGroup.name &&
        this.formData.subGroup.price > 0;
    }
    return true;
  }

  submit() {
    this.isLoading = true;
    
    // groupRegId is already set on updatedFormData.group/subGroup via onEditGroupSelect/onEditSubGroupSelect
    // testRegId is already set via onEditTestSelect
    
    this.submitted.emit({
      formData: this.formData,
      updatedFormData: this.updatedFormData,
      selected: this.selected,
      mode: this.mode,
      step: this.step,
      done: () => {
        this.isLoading = false;
        this.close();
      }
    });
  }

  next() {
    if (this.selected) {
      if (this.step < 4) this.step++;

      // Auto-generate the code for the step we just entered (add mode only)
      this.assignCodeForStep();

      if (this.mode === 'edit') {
        switch (this.selected) {
          case 'group':    this.ModalHeading = "Edit Group";    break;
          case 'subgroup': this.ModalHeading = "Edit SubGroup"; break;
          case 'test':     this.ModalHeading = "Edit Test";     break;
          default:         this.ModalHeading = "Edit Item";     break;
        }
      } else {
        switch (this.selected) {
          case 'group':
            if (this.step == 1) this.ModalHeading = "Group";
            if (this.step == 2) this.ModalHeading = "SubGroup";
            if (this.step == 3) this.ModalHeading = "Test";
            break;
          case 'subgroup':
            if (this.step == 1) this.ModalHeading = "SubGroup";
            if (this.step == 2) this.ModalHeading = "Test";
            break;
          case 'test':
            this.ModalHeading = "Test";
            break;
          default:
            this.ModalHeading = "Add New Item";
            break;
        }
      }
    }
  }

  resetForm() {
    this.step     = 0;
    this.lastStep = false;
    this.selected = null;
    this.groupData    = { id: '', name: '', rate: '' };
    this.subGroupData = { id: '', name: '', rate: '', groupId: '' };
    this.testData     = { id: '', name: '', rate: '', subGroupId: '' };
    this.formData = {
      group:    new GroupSubGroupModel(),
      subGroup: new GroupSubGroupModel(),
      test:     new TestItem()
    };
    this.updatedFormData = {
      group:    new GroupSubGroupModel(),
      subGroup: new GroupSubGroupModel(),
      test:     new TestItem()
    };
    // Clear cascading edit lists. Caches are dropped too — the next modal open
    // creates a new component instance and must not reuse data that a just-saved
    // update may have invalidated.
    this.editSubGroups = [];
    this.editTests = [];
    this.editSubGroupsLoading = false;
    this.editTestsLoading = false;
    this.subGroupCache.clear();
    this.testCache.clear();
    // Clear registration IDs
    this.groupRegId = 0;
    this.subGroupRegId = 0;
    this.testRegId = 0;
  }

  back() {
    if (this.step > 0) this.step--;
    this.lastStep = false;
  }

  get filteredSubGroups(): GroupSubGroupModel[] {
    if (this.addType === 'subgroup' && this.subGroupData.groupId) {
      return this.subGroups.filter(sg => sg.testGroupId === this.subGroupData.groupId);
    }
    if (this.addType === 'test') return this.subGroups;
    return [];
  }

  get isLastStep(): boolean {
    if (this.selected === 'test'     && this.step === 1) return true;
    if (this.selected === 'subgroup' && this.step === 2) return true;
    if (this.selected === 'group'    && this.step === 3) return true;
    return false;
  }

  get isLastEditStep(): boolean {
    return (this.selected && this.step === 1) ? true : false;
  }

  showNext(): boolean {
    if (this.addType === 'test'     && this.step === 1)                   return true;
    if (this.addType === 'subgroup' && (this.step === 1 || this.step === 2)) return true;
    if (this.addType === 'group'    && this.step >= 1 && this.step < 4)   return true;
    return false;
  }

  // ── Edit-mode auto-populate ────────────────────────────────────────────────

  /**
   * Called when the user picks a group from the "Select Group" dropdown in
   * edit mode. Copies name + price from the @Input groups array so the user
   * doesn't have to retype them. Also captures GroupRegId for backend update.
   */
  onEditGroupSelect() {
    const code  = this.updatedFormData.group.testGroupId;
    const match = this.groups.find(g => g.testGroupId === code);
    if (match) {
      this.updatedFormData.group.name      = match.name;
      this.updatedFormData.group.price     = match.price;
      this.updatedFormData.group.groupRegId = match.groupRegId;
      this.groupRegId = match.groupRegId;
    }
  }

  /**
   * Called when the user picks a subgroup from the "Select SubGroup" dropdown
   * in edit mode. Copies name + price from the @Input subGroups array.
   * Also records parentGroupId so the backend mapping is correct.
   * Captures GroupRegId for backend update (expected by backend).
   */
  onEditSubGroupSelect() {
    const code  = this.updatedFormData.subGroup.testGroupId;
    const match = this.editSubGroups.find(s => s.testGroupId === code);
    if (match) {
      this.updatedFormData.subGroup.name           = match.name;
      this.updatedFormData.subGroup.price          = match.price;
      this.updatedFormData.subGroup.parentGroupId  = match.parentGroupId;
      this.updatedFormData.subGroup.groupRegId     = match.groupRegId;
      this.subGroupRegId = match.groupRegId;
    }
  }

  /**
   * Called when the user picks a test from the "Select Test" dropdown in
   * edit mode. Copies testName, price and testRegId from the @Input tests array.
   * testRegId is needed by submit() to attach the correct ID when updating.
   */
  onEditTestSelect() {
    const code  = this.updatedFormData.test.testCode;
    const match = this.editTests.find(t => t.testCode === code);
    if (match) {
      this.updatedFormData.test.testName  = match.testName;
      this.updatedFormData.test.price     = match.price;
      this.updatedFormData.test.testRegId = match.testRegId;
      this.testRegId = match.testRegId;
    }
  }

  /**
   * Called when the group selection changes inside the "Edit SubGroup" or
   * "Edit Test" form. Resets the downstream selections so stale names don't
   * linger after the parent group changes.
   */
  onEditGroupChangedForSub() {
    this.updatedFormData.subGroup = new GroupSubGroupModel();
    this.updatedFormData.test     = new TestItem();
    this.editTests = [];
    this.loadEditSubGroups(this.updatedFormData.group.testGroupId);
  }

  onEditGroupChangedForTest() {
    this.updatedFormData.subGroup = new GroupSubGroupModel();
    this.updatedFormData.test     = new TestItem();
    this.editTests = [];
    this.loadEditSubGroups(this.updatedFormData.group.testGroupId);
  }

  onEditSubGroupChangedForTest() {
    this.updatedFormData.test = new TestItem();
    this.loadEditTests(this.updatedFormData.subGroup.testGroupId);
  }

  /** Fetches the subgroups belonging to the group chosen in the edit form. */
  private loadEditSubGroups(groupId: string): void {
    this.editSubGroups = [];
    if (!groupId) return;

    const cached = this.subGroupCache.get(groupId);
    if (cached) {
      this.editSubGroups = cached;
      this.editSubGroupsLoading = false;
      return;
    }

    this.editSubGroupsLoading = true;
    this._pathTest.getAllSubGroupList(groupId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (subs) => {
          // Backend may return placeholder rows with no code/name — drop them.
          this.editSubGroups = (subs ?? []).filter(s => s && s.testGroupId && s.name);
          this.subGroupCache.set(groupId, this.editSubGroups);
          this.editSubGroupsLoading = false;
        },
        error: () => {
          this.editSubGroups = [];
          this.editSubGroupsLoading = false;
        }
      });
  }

  /** Fetches the tests belonging to the subgroup chosen in the edit form. */
  private loadEditTests(subGroupId: string): void {
    this.editTests = [];
    if (!subGroupId) return;

    const cached = this.testCache.get(subGroupId);
    if (cached) {
      this.editTests = cached;
      this.editTestsLoading = false;
      return;
    }

    this.editTestsLoading = true;
    this._pathTest.getAllTestList(subGroupId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (tests) => {
          this.editTests = (tests ?? []).filter((t: any) => t && t.testCode);
          this.testCache.set(subGroupId, this.editTests);
          this.editTestsLoading = false;
        },
        error: () => {
          this.editTests = [];
          this.editTestsLoading = false;
        }
      });
  }
}
