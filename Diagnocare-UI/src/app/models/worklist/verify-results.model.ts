/**
 * One row on the verification screen: a parameter, its value, and whether that
 * value sits inside the reference range.
 */
export interface VerifyRow {
  parameterId: number;
  parameterName: string;
  parameterUnit: string;
  parameterRange: string;
  value: string;

  /** True when the value falls outside the reference range. */
  abnormal: boolean;
  /** 'HIGH' | 'LOW' | '' — shown beside an abnormal value. */
  direction: string;
  /** False when the range could not be parsed, so nothing is claimed about it. */
  rangeUnderstood: boolean;
}
