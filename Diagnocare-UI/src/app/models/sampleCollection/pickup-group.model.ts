import { CollectionStage, Pickup } from 'src/app/models/sampleCollection/sample-collection.model';

export interface PickupGroup {
  stage: CollectionStage;
  title: string;
  hint: string;
  icon: string;
  items: Pickup[];
}
