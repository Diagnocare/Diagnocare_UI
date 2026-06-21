/** DTO used when updating a test parameter. */
export interface TestItemParameterUpdateDto {
  parameterId: number;
  testRegId: number;
  testCode: string;
  parameterName: string;
  parameterRangeLow?: string;
  parameterRangeHigh?: string;
  parameterUnit?: string;
  parameterRange?: string;
}
