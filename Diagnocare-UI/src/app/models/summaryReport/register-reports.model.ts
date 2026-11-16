export type RegisterTab = 'billRegister' | 'receiptRegister' | 'refundRegister';

export interface TabDef {
  id: RegisterTab;
  label: string;
  icon: string;
}
