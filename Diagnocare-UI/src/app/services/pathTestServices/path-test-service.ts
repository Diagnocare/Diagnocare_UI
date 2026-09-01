import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs/internal/Observable';
import { apiEndpoints, controllerEndpoints } from 'src/app/constant/constants';
import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';
import { CommonService } from 'src/app/shared/common.service';
import { map } from 'rxjs/operators';
import { DropRequestDTO } from 'src/app/models/path-test/drop-request.dto';
import { GroupSubGroupModel } from 'src/app/models/path-test/group/group.model';
import {
  SaveTestProtocolAssignmentsDto,
  TestBookingProtocolsDto,
  TestProtocolDto,
  TestProtocolSaveDto,
  TestProtocolSuggestionDto,
  TestProtocolSummaryDto,
} from 'src/app/models/path-test/protocol/test-protocol.model';

@Injectable({
  providedIn: 'root',
})
export class PathTestService {

   pathTestApiUrl: string;
  constructor(private httpClient: HttpClient, private commonService: CommonService) {
    this.pathTestApiUrl = getDiagnocareApiUrl()+controllerEndpoints.pathologyTest;
  }
  /** Fetches all test groups for the current pathology. */
  getTestGroupList(): Observable<GroupSubGroupModel[]> {
    return this.getAllGroupList();
  }
  /** Fetches sub-groups belonging to a test group for the current pathology. */
  getTestSubGroupList(testGroupId: string): Observable<GroupSubGroupModel[]> {
    return this.getAllSubGroupList(testGroupId);
  }
  /** Fetches medical tests belonging to a sub-group for the current pathology. */
  getMedicalTestList(subGroupId: string): Observable<any[]> {
    return this.getAllTestList(subGroupId);
  }
  
 

  getAllGroupList():Observable<GroupSubGroupModel[]>{
      return this.httpClient.get<any[]>(this.pathTestApiUrl+apiEndpoints.getAllGroupList).pipe(
        map(arr => (arr || []).map(item => this.normalizeGroup(item))));
  }

  getAllSubGroupList(groupId: string | null = null):Observable<GroupSubGroupModel[]>{
      // Backend expects groupSubgroupCode as the query parameter. Use groupId which here is the
      // previously-mapped `testGroupId` (we populate it from `groupSubgroupCode`).
      const url = this.pathTestApiUrl + apiEndpoints.getAllSubGroupList + "?testGroupId=" + (groupId ?? '');
      return this.httpClient.get<any[]>(url).pipe(
        map(arr => (arr || []).map(item => this.normalizeGroup(item))));
  }
  getAllTestList(subGroupId: string | null = null):Observable<any[]>{
      const url = this.pathTestApiUrl + apiEndpoints.getTestList + "?subGroupId=" + (subGroupId ?? '');
      return this.httpClient.get<any[]>(url);
  }

  AddGroupWithSubgroupsAndTests(bulkData: any){
    return this.httpClient.post(this.pathTestApiUrl + apiEndpoints.addGroupWithSubgroupsAndTests, bulkData);
  }

  // update single group or subgroup
  updateGroupDetails(group: any){
    return this.httpClient.put(this.pathTestApiUrl + apiEndpoints.updateGroupDetails, group);
  }

  // update a path test
  updatePathTest(test: any){
    return this.httpClient.put(this.pathTestApiUrl + apiEndpoints.updatePathologyTest, test);
  }

  /** Deletes a group, subgroup, or test via DELETE /api/pathologyTest/Delete */
  dropTest(request: DropRequestDTO): Observable<any> {
    return this.httpClient.delete(this.pathTestApiUrl + apiEndpoints.dropTest, { body: request });
  }

  // ── Sample-collection protocols ─────────────────────────────────────────────

  /**
   * The whole protocol library, for the picker. Summary rows with usage counts.
   */
  getProtocolLibrary(): Observable<TestProtocolSummaryDto[]> {
    return this.httpClient
      .get<TestProtocolSummaryDto[]>(this.pathTestApiUrl + apiEndpoints.getProtocolLibrary)
      .pipe(map(list => list ?? []));
  }

  /** One protocol's full content. */
  getProtocol(protocolId: number): Observable<TestProtocolDto> {
    const url = `${this.pathTestApiUrl}${apiEndpoints.getProtocol}?protocolId=${protocolId}`;
    return this.httpClient.get<TestProtocolDto>(url);
  }

  /**
   * The protocols one test is collected under, in order.
   *
   * An empty array is a real answer — nobody has linked a protocol to this test — and the
   * panel says so in words. Callers only handle a genuine transport failure, and even then
   * get an empty list, which the panel reports the same way: we do not know the requirements.
   */
  getTestProtocols(testRegId: number): Observable<TestProtocolDto[]> {
    const url = `${this.pathTestApiUrl}${apiEndpoints.getTestProtocols}?testRegId=${testRegId}`;
    return this.httpClient.get<TestProtocolDto[]>(url).pipe(map(list => list ?? []));
  }

  /**
   * Protocols for every test in a booking, by test code, in the order given.
   *
   * One request for the whole basket rather than one per test — the booking screens call
   * this every time the selection changes.
   */
  getTestProtocolsByCodes(testCodes: string[]): Observable<TestBookingProtocolsDto[]> {
    const codes = (testCodes ?? []).filter(c => !!c);
    return this.httpClient
      .post<TestBookingProtocolsDto[]>(this.pathTestApiUrl + apiEndpoints.getTestProtocolsByCodes, codes)
      .pipe(map(list => list ?? []));
  }

  /** Which library protocol a test's name suggests. Admin / Super Admin only. */
  suggestTestProtocol(testRegId: number): Observable<TestProtocolSuggestionDto> {
    const url = `${this.pathTestApiUrl}${apiEndpoints.suggestTestProtocol}?testRegId=${testRegId}`;
    return this.httpClient.get<TestProtocolSuggestionDto>(url);
  }

  /** Creates or updates a lab-authored protocol in the library. */
  saveProtocol(protocol: TestProtocolSaveDto): Observable<any> {
    return this.httpClient.post(this.pathTestApiUrl + apiEndpoints.saveProtocol, protocol);
  }

  /** Replaces the whole set of protocols linked to a test. An empty list clears them. */
  saveTestProtocolAssignments(payload: SaveTestProtocolAssignmentsDto): Observable<any> {
    return this.httpClient.post(this.pathTestApiUrl + apiEndpoints.saveTestProtocolAssignments, payload);
  }

  /** Deletes a lab-authored protocol. Refused by the API if seeded or still in use. */
  deleteProtocol(protocolId: number): Observable<any> {
    const url = `${this.pathTestApiUrl}${apiEndpoints.deleteProtocol}?protocolId=${protocolId}`;
    return this.httpClient.delete(url);
  }

  // Normalize backend group/subgroup payload to GroupSubGroupModel
  private normalizeGroup(item: any): GroupSubGroupModel {
    return new GroupSubGroupModel({
      testGroupId:      String(item.groupSubgroupCode ?? item.testGroupId ?? ''),
      groupSubgroupCode: String(item.groupSubgroupCode ?? ''),
      name:             item.groupSubGroupName ?? item.name ?? item.testGroupName ?? '',
      price:            Number(item.price ?? item.testPrice ?? 0),
      parentGroupId:    String(item.parentGroupId ?? item.parentId ?? '0'),
      templateId:       item.templateId != null ? Number(item.templateId) : null,
      groupRegId:       Number(item.groupRegId ?? 0),
    });
  }
}
