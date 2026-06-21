/** DTO used when creating a group or sub-group. */
export interface GroupSubGroupCreateDto {
  name: string;
  price?: number;
  parentGroupId?: string;
}
