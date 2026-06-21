/** DTO representing a receipt row returned by list/get endpoints. */
export interface ReceiptListDto {
  reciept_Id: number;
  patient_Test_Id: string;
  total_Amount: number;
  discount: number;
  net_Amount: number;
  payment_Type: string;
  amount_Paid: number;
  amount_Pending: number;
  payment_Mode: string;
}
