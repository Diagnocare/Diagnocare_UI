import { TestProtocolSummaryDto } from 'src/app/models/path-test/protocol/test-protocol.model';

/** One protocol linked to the test, as the editor holds it before saving. */
export interface LinkedRow {
  protocol: TestProtocolSummaryDto;
  note: string | null;
}
