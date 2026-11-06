import { PathologyProfileDto } from 'src/app/models/pathology/pathology-profile.dto';
import { PathologyPublicInfoDto } from 'src/app/models/pathology/pathology-public-info.dto';

export interface CachedProfile {
  data: PathologyProfileDto;
  /** Epoch ms when this entry was written. */
  fetchedAt: number;
}

/** The only two fields the home navbar needs in order to decide Login vs Register. */
export type RegistrationSnapshot = Pick<PathologyPublicInfoDto, 'isRegistered' | 'date_of_Expiry'>;

export interface CachedSnapshot {
  data: RegistrationSnapshot;
  /** Epoch ms when this entry was written. */
  fetchedAt: number;
}
