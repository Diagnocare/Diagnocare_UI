/** DTO representing a test item row in list responses. */
export interface TestItemListDto {
  Id: number;
  testRegId: number;
  subGroupId: string;
  GroupId: string;
  PathologyId: string;
  testCode: string;
  testName: string;
  price: number;
}
