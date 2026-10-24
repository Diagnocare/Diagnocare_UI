// Interface representing a collection boy in the system
export interface collectionBoyModel {
  id: number; // Unique identifier
  name: string; // Full name
  qualification?: string; // Qualification (optional)
  position?: string; // Position (optional)
  pathologyId?: string; // Pathology ID (hidden, set from JWT)
}
