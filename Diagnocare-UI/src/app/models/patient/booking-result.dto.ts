/**
 * What POST api/patient/Add and POST api/patient/AddTestWithReceipt return.
 *
 * Both booking paths answer in this shape — a brand-new patient and a returning
 * one — so the booking screen needs no branch between them.
 *
 * `Add` used to return a bare `true`/`false`, which left the screen knowing a
 * booking had happened but not which one, and therefore unable to print a sample
 * label for it. `testRegId` is the missing piece.
 */
export interface BookingResultDto {
  success: boolean;
  message: string;

  /** Patient id (PatNNN). Generated server-side on the new-patient path. */
  patientId: string;

  /** The new booking's registration id. 0 when the booking failed. */
  testRegId: number;

  /** One entry per booked test, each with the barcode value for that test's tube. */
  labels: SampleLabelItemDto[];

  /** Relative path the printable labels are fetched from, e.g. `/api/SampleLabel/1042`. */
  labelUrl: string;
}

/** One sticker: one test on the booking, and the barcode that identifies its tube. */
export interface SampleLabelItemDto {
  /** Test code, e.g. "CBC". */
  testCode: string;

  /** Encoded and printed under the bars: "{testRegId}-{testCode}", e.g. "1042-CBC". */
  barcodeValue: string;
}
