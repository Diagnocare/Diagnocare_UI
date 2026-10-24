/**
 * Booked → assigned to a collection boy → collected by him → received at the lab.
 * Mirrors Model/Dtos/SampleCollection on the API.
 */
export type CollectionStage = 'to-collect' | 'to-hand-over' | 'handed-over';

/** One pickup on a collection boy's "My Pickups" list. */
export interface Pickup {
  testRegId: number;
  patientId: string;
  patientName: string;
  patientAge: string;
  patientGender: string;
  patientContact: string;
  patientAddress: string;
  area: string;
  testCodes: string;
  testNames: string[];
  urgent: boolean;
  remark: string;
  bookedAt?: string | null;
  assignedAt?: string | null;
  collectedAt?: string | null;
  receivedAt?: string | null;
  receivedBy?: string | null;
  stage: CollectionStage;
}

export interface CollectionActionResponse {
  message: string;
  stage?: CollectionStage | null;
  assignedToName?: string | null;
}
