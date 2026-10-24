/** DTO used when updating a group or sub-group. */
export interface GroupSubGroupUpdateDto {
  testGroupId: string;
  name: string;
  price?: number;
  parentGroupId?: string;
}
