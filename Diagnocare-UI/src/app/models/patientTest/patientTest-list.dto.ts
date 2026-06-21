/** DTO representing a patient-test record in list/get responses. */
export interface PatientTestListDto {
  patient_Test_Id: string;
  test_id: string[];
  test_Name: string;
  urgent_Report: boolean;
  amount_Tobe_Paid: number;
  referred_By: string;
  remark: string;
  collected_Outside: boolean;
  area: string;
  collected_By: string;
  sampling_Done: string;
  test_count: number;
  test_Id: string;
}
