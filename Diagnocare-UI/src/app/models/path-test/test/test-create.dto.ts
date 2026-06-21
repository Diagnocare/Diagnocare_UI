/** DTO used when adding a new test item. */
export interface TestItemCreateDto {
  subGroupId: string;
  testCode: string;
  testName: string;
  price: number;
}
