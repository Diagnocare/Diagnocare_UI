/** DTO representing a collection boy in list responses */
export interface CollectionBoyListDto {
  id: number;
  name: string;
  qualification?: string;
  position?: string;
  pathologyId?: string;
}
