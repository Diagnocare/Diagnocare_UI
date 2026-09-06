/**
 * One protocol as it appears in the library picker. Summary only — enough to choose by.
 */
export interface TestProtocolSummaryDto {
  protocolId: number;
  protocolCode: string;
  protocolName: string;
  sampleType: string;
  containerType: string | null;
  fastingRequired: boolean;
  fastingHours: number | null;

  /** True for a protocol shipped with the application. Seeded protocols are read-only. */
  isSystem: boolean;

  /** How many tests currently link to this protocol. */
  linkedTestCount: number;
}

/**
 * A protocol's full content, as shown to whoever is about to collect the sample.
 *
 * `displayOrder` and `note` describe the link between a test and this protocol rather than
 * the protocol itself, and are only meaningful when the DTO arrives in the context of a test.
 */
export interface TestProtocolDto {
  protocolId: number;
  protocolCode: string;
  protocolName: string;

  sampleType: string;
  containerType: string | null;
  sampleQuantity: string | null;
  fastingRequired: boolean;
  fastingHours: number | null;
  patientPreparation: string | null;
  collectionProcedure: string | null;
  storageTransport: string | null;
  precautions: string | null;
  rejectionCriteria: string | null;

  isSystem: boolean;
  lastModified: string | null;

  /** Position in this test's collection sequence. */
  displayOrder: number;

  /** Why this protocol applies to this test, where that needed saying. */
  note: string | null;
}

/**
 * Every protocol linked to one test.
 *
 * The test is named even when `protocols` is empty, so the booking screens can say which
 * test is missing one rather than rendering an anonymous gap.
 */
export interface TestBookingProtocolsDto {
  testRegId: number;
  testCode: string;
  testName: string;
  protocols: TestProtocolDto[];
}

/** Write shape for creating or editing a lab-authored protocol. */
export interface TestProtocolSaveDto {
  /** 0 to create; an existing id to update. Seeded protocols are refused by the API. */
  protocolId: number;
  protocolCode: string;
  protocolName: string;
  sampleType: string;
  containerType: string | null;
  sampleQuantity: string | null;
  fastingRequired: boolean;
  fastingHours: number | null;
  patientPreparation: string | null;
  collectionProcedure: string | null;
  storageTransport: string | null;
  precautions: string | null;
  rejectionCriteria: string | null;
}

/** One protocol's place in a test's collection sequence. */
export interface TestProtocolAssignmentDto {
  protocolId: number;
  displayOrder: number;
  note: string | null;
}

/** Replaces the whole set of protocols linked to a test. An empty list clears them. */
export interface SaveTestProtocolAssignmentsDto {
  testRegId: number;
  assignments: TestProtocolAssignmentDto[];
}

/**
 * A protocol the API thinks a test is probably collected under, matched on the test's name.
 * Offered in the admin screen for a person to accept — never shown during booking.
 */
export interface TestProtocolSuggestionDto {
  testRegId: number;
  testName: string;

  /** Null when the test's name matched nothing. */
  suggestedProtocol: TestProtocolSummaryDto | null;

  /** True when the suggested protocol is already linked to this test. */
  alreadyLinked: boolean;
}

/**
 * A blank protocol, used as the starting point of the library editor and as a fail-safe
 * when a response arrives without the expected shape.
 */
export function emptyTestProtocol(): TestProtocolDto {
  return {
    protocolId: 0,
    protocolCode: '',
    protocolName: '',
    sampleType: '',
    containerType: null,
    sampleQuantity: null,
    fastingRequired: false,
    fastingHours: null,
    patientPreparation: null,
    collectionProcedure: null,
    storageTransport: null,
    precautions: null,
    rejectionCriteria: null,
    isSystem: false,
    lastModified: null,
    displayOrder: 0,
    note: null,
  };
}

/** Narrows a protocol to the fields the save endpoint accepts. */
export function toProtocolSaveDto(p: TestProtocolDto): TestProtocolSaveDto {
  return {
    protocolId: p.protocolId,
    protocolCode: p.protocolCode,
    protocolName: p.protocolName,
    sampleType: p.sampleType,
    containerType: p.containerType,
    sampleQuantity: p.sampleQuantity,
    fastingRequired: p.fastingRequired,
    // Fasting hours only mean something when fasting is required. The API clears them too,
    // but sending a contradiction and relying on the server to fix it would let the editor
    // show one thing and store another.
    fastingHours: p.fastingRequired ? p.fastingHours : null,
    patientPreparation: p.patientPreparation,
    collectionProcedure: p.collectionProcedure,
    storageTransport: p.storageTransport,
    precautions: p.precautions,
    rejectionCriteria: p.rejectionCriteria,
  };
}

/**
 * Copies a protocol as the starting point for a new lab-authored one.
 *
 * The route out of "standard protocols are read-only": an admin who needs a variant
 * duplicates the standard and edits the copy, so the original keeps meaning what it means
 * everywhere else.
 */
export function duplicateProtocol(p: TestProtocolDto): TestProtocolDto {
  return {
    ...p,
    protocolId: 0,
    protocolCode: '',
    protocolName: `${p.protocolName} (copy)`,
    isSystem: false,
    lastModified: null,
  };
}
