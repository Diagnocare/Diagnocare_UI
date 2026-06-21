/**
 * Payload sent to DELETE /api/pathologyTest/Delete
 * Mirrors the backend DropRequestDTO.
 */
export class DropRequestDTO {
  /** What to delete: "group" | "subgroup" | "test" */
  type: 'group' | 'subgroup' | 'test' = 'test';

  /**
   * TestGroupId of the group or subgroup to delete.
   * Required when type is "group" or "subgroup".
   */
  groupSubgroupId?: string | null;

  /**
   * TestRegId of the test to delete.
   * Required when type is "test".
   */
  testRegId?: number | null;
}
