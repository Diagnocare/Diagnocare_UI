import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs/internal/Observable';
import { apiEndpoints, controllerEndpoints } from 'src/app/constant/constants';
import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';
import { CommonService } from 'src/app/shared/common.service';
import { map } from 'rxjs/operators';
import { DropRequestDTO } from 'src/app/models/path-test/drop-request.dto';
import { GroupSubGroupModel } from 'src/app/models/path-test/group/group.model';

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
