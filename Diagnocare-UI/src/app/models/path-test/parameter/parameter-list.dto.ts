/** DTO representing a test parameter row in list responses. */
export interface TestItemParameterListDto {
  parameterId: number;
  testRegId: number;
  testCode: string;
  parameterName: string;
  parameterRangeLow: string;
  parameterRangeHigh: string;
  parameterUnit: string;
  parameterRange: string;
}
