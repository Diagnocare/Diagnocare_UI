/** DTO used when adding a test parameter. */
export interface TestItemParameterCreateDto {
  testRegId: number;
  testCode: string;
  parameterName: string;
  parameterRangeLow?: string;
  parameterRangeHigh?: string;
  parameterUnit?: string;
  parameterRange?: string;
}
