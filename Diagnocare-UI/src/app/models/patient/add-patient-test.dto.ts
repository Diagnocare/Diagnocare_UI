import { PatientTestCreateDto } from './patient-create.dto';
import { ReceiptCreateDto }     from '../receipt/receipt-create.dto';

/**
 * Payload sent to POST api/patient/AddTest.
 * Adds a brand-new test + receipt for an already-registered patient.
 */
export interface AddPatientTestDto {
  patientId:       string;
  test:             PatientTestCreateDto;
  receipt:          ReceiptCreateDto;
  /**
   * Mobile number to save on the patient when test.report_On_WhatsApp is set and
   * the patient has no valid number yet. Ignored by the API otherwise.
   */
  patientContact?:  string;
}
