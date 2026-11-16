import { SampleRejectionReasonDto } from 'src/app/models/sample-rejection/sample-rejection.model';

/** The reasons for one cause, as the picker groups them. */
export interface ReasonGroup {
  categoryLabel: string;
  reasons: SampleRejectionReasonDto[];
}
