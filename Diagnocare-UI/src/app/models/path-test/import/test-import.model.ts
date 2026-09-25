/**
 * Bulk import of the test catalogue — mirrors Model/Dtos/TestImport/TestImportDtos.cs.
 */

export type TestImportRowStatus = 'New' | 'Update' | 'Unchanged' | 'Error';

/** Matches the API enum TestImportMode (serialised as its number). */
export enum TestImportMode {
  /** Only add what is new; existing records are left as they are. */
  SkipExisting = 0,
  /** Add what is new and overwrite names, prices, method, unit and range on what exists. */
  UpdateExisting = 1,
}

export interface TestImportCounts {
  groups: number;
  subGroups: number;
  tests: number;
  parameters: number;
  total: number;
}

export interface TestImportRowResult {
  rowNumber: number;
  status: TestImportRowStatus;
  groupCode: string;
  groupName: string;
  subGroupCode: string;
  subGroupName: string;
  testCode: string;
  testName: string;
  parameterName: string;
  detail: string;
  errors: string[];
  warnings: string[];
}

export interface TestImportPreview {
  importToken: string;
  fileName: string;
  totalRows: number;
  toCreate: TestImportCounts;
  toUpdate: TestImportCounts;
  newRows: number;
  updateRows: number;
  unchangedRows: number;
  errorRows: number;
  warningRows: number;
  fileErrors: string[];
  rows: TestImportRowResult[];
  canCommit: boolean;
}

export interface TestImportCommitRequest {
  importToken: string;
  mode: TestImportMode;
}

export interface TestImportCommitResult {
  success: boolean;
  message: string;
  created: TestImportCounts;
  updated: TestImportCounts;
  skipped: TestImportCounts;
  errors: TestImportRowResult[];
}
