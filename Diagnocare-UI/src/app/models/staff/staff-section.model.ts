export type SectionType = 'user' | 'collection-boy' | 'doctor';

export interface Section {
  type:    SectionType;
  title:   string;
  icon:    string;
  loading: boolean;
  loaded:  boolean;
}
