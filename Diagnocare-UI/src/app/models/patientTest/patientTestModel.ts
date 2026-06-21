import { BillReceiptDto } from 'src/app/models/receipt/bill-receipt.dto';

export interface patientTest {
    patient_Test_Id:    string;
    patient_Id:         string;
    test_id:            string[];   // legacy array form (if used)
    test_Ids:           string;     // comma-separated string returned by API
    test_Id:            string;     // singular test code field from API
    test_Name:          string;
    test_count:         number;
    urgent_Report:      boolean;
    amount_Tobe_Paid:   number;
    referred_By:        string;
    remark:             string;
    collected_Outside:  boolean;
    collected_At:       string;
    collected_By:       string;
    area:               string;
    sampling_Done:      string;
    sampling_Done_At:   string;
    /** ISO date string or formatted date returned by the backend. */
    registration_Date?: string;
    /** Report generation status: 'Completed' | 'Partial' | 'Pending' */
    is_Report_Generated?: string;
    /** Booking lifecycle status: 'Active' | 'Cancelled' */
    booking_Status?: string;
    /** ISO timestamp when the booking was cancelled, if applicable. */
    cancelled_At?: string | null;
    /** Reason provided at cancellation, if any. */
    cancellation_Reason?: string | null;
    /**
     * Receipt summary embedded in the patientTest GET response.
     * Uses the backend snake_Case field names — see BillReceiptDto.
     */
    bill_Reciept: BillReceiptDto;
}
