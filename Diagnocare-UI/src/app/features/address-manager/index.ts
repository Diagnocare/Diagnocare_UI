// Public API of the address manager feature.
//
// Services, models and helpers only. Components are intentionally absent: every
// screen is loaded with `loadComponent`, and re-exporting them here would pull
// the entire feature into a single chunk.
export * from './models/addressModel';
export * from './models/collectionBoy-create.dto';
export * from './models/collectionBoy-edit.dto';
export * from './models/collectionBoy-list.dto';
export * from './models/collectionBoyModel';
export * from './models/contactAddress-create.dto';
export * from './models/contactAddress-edit.dto';
export * from './models/contactAddress-list.dto';
export * from './models/contactAddressModel';
export * from './models/doctor-create.dto';
export * from './models/doctor-edit.dto';
export * from './models/doctor-list.dto';
export * from './models/doctorModel';
export * from './models/stateCityModel';
export * from './services/address-service';
export * from './services/area.service';
export * from './services/contact-address.service';
