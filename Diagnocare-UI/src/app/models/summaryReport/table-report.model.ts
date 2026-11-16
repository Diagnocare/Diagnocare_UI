/** Describes one derived column. */
export interface ColDef {
  key:   string;
  label: string;
  kind:  'currency' | 'number' | 'date' | 'badge' | 'text';
  align: 'left' | 'right' | 'center';
}
