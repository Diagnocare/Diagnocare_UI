/** DTO used when updating an existing test item. */
export interface TestItemUpdateDto {
  Id: number;
  testRegId: number;
  subGroupId: string;
  testCode: string;
  testName: string;
  price: number;
}
