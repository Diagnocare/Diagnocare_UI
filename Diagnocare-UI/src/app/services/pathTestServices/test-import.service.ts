import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { apiEndpoints, controllerEndpoints } from 'src/app/constant/constants';
import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';
import {
  TestImportCommitRequest,
  TestImportCommitResult,
  TestImportPreview,
} from 'src/app/models/path-test/import/test-import.model';

/**
 * Bulk upload of groups, subgroups, tests and parameters from .xlsx / .csv.
 *
 * Preview never writes; commit writes everything or nothing. See TestImportController.
 */
@Injectable({ providedIn: 'root' })
export class TestImportService {
  private readonly baseUrl: string;

  constructor(private http: HttpClient) {
    this.baseUrl = getDiagnocareApiUrl() + controllerEndpoints.testImport;
  }

  /** The blank template workbook. */
  downloadTemplate(): Observable<Blob> {
    return this.http.get(this.baseUrl + apiEndpoints.testImportTemplate, { responseType: 'blob' });
  }

  /** Uploads the file and returns what it would do. Nothing is saved. */
  preview(file: File): Observable<TestImportPreview> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<TestImportPreview>(this.baseUrl + apiEndpoints.testImportPreview, form);
  }

  /** Saves a previewed file. All or nothing. */
  commit(request: TestImportCommitRequest): Observable<TestImportCommitResult> {
    return this.http.post<TestImportCommitResult>(this.baseUrl + apiEndpoints.testImportCommit, request);
  }

  /** The uploaded rows with Status and Problems columns, ready to fix and upload again. */
  downloadErrorReport(importToken: string): Observable<Blob> {
    const url = `${this.baseUrl}${apiEndpoints.testImportErrorReport}?importToken=${encodeURIComponent(importToken)}`;
    return this.http.get(url, { responseType: 'blob' });
  }

  /** Hands a downloaded blob to the browser as a file. */
  saveBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
