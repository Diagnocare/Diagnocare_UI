import { ReceiptCreateDto } from 'src/app/models/receipt/receipt-create.dto';

/** DTO used when registering a new patient — matches backend PatientModel. */
export interface PatientCreateDto {
  // ── Patient personal info ───────────────────────────────────────────
  serial_Number:          number;
  patient_Id:             string;
  patient_Name:           string;   // includes salutation prefix
  patient_DOB:            string;
  patient_Age:            number;
  patient_Age_Group:      string;
  patient_Gender:         string;
  patient_Marital_Status: string;
  patient_Address:        string;
  relation:               string;
  relative_Name:          string;
  patient_Contact:        string;   // contact number only, e.g. 9876543210
  patient_Email:          string;
  patient_Reg_Date:       string;

  // ── Nested objects (match PatientModel.Test / PatientModel.Receipt) ──
  test:    PatientTestCreateDto;
  receipt: ReceiptCreateDto;
}

/** DTO matching backend AddPatientTestDTO. */
export interface PatientTestCreateDto {
  test_Id:          string;
  test_Name:         string;
  urgent_Report:     boolean;
  /** Send this booking's report on WhatsApp (needs a valid patient mobile number). */
  report_On_WhatsApp?: boolean;
  /**
   * Number to send this booking's report to. Empty = the patient's own number; a
   * different one is stored on the booking only.
   */
  whatsApp_Number?: string | null;
  test_Amount:       number;
  referred_By_Type:  string;
  referred_By:  string;
  remark:            string;
  collected_Outside: boolean;
  area:              string;
  collected_By:      string;
  /** Maps to AddPatientTestDTO.Sampling_Done_At. Empty = no barcode until set later. */
  sampling_Done_At:  string;
  /** User_Id of the collection boy who will collect the sample; null = drawn at the lab. */
  collection_Assigned_To?: number | null;
}
