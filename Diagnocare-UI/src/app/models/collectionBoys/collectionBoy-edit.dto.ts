/** DTO used when updating a collection boy */
export interface CollectionBoyEditDto {
  id: number;
  name: string;
  qualification?: string;
  position?: string;
  pathologyId?: string;
}
