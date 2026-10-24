/** DTO representing a group/sub-group row in list responses. */
export interface GroupSubGroupListDto {
  testGroupId: string;
  name: string;
  price: number;
  parentGroupId: string;
}
