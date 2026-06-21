import { controllerEndpoints } from 'src/app/constant/constants';

export type StaffType = 'doctor' | 'collection-boy';

export interface StaffConfig {
  type:                  StaffType;
  label:                 string;
  pluralLabel:           string;
  icon:                  string;
  baseRoute:             string;
  controllerKey:         keyof typeof controllerEndpoints;
  hasSignature:          boolean;
  qualificationRequired: boolean;
  positionRequired:      boolean;
}

export const STAFF_CONFIGS: Record<StaffType, StaffConfig> = {
  'doctor': {
    type:                  'doctor',
    label:                 'Doctor',
    pluralLabel:           'Doctors',
    icon:                  'fa-user-md',
    baseRoute:             '/doctors',
    controllerKey:         'doctor',
    hasSignature:          true,
    qualificationRequired: true,
    positionRequired:      true,
  },
  'collection-boy': {
    type:                  'collection-boy',
    label:                 'Collection Boy',
    pluralLabel:           'Collection Boys',
    icon:                  'fa-motorcycle',
    baseRoute:             '/collection-boys',
    controllerKey:         'collectionBoy',
    hasSignature:          false,
    qualificationRequired: false,
    positionRequired:      false,
  },
};
