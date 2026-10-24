// Public API of the templates feature.
//
// Services, models and helpers only. Components are intentionally absent: every
// screen is loaded with `loadComponent`, and re-exporting them here would pull
// the entire feature into a single chunk.
export * from './models/template-detail.dto';
export * from './models/template-list.dto';
export * from './services/template.service';
