// Public API of the salary feature.
//
// Services, models and helpers only. Components are intentionally absent: every
// screen is loaded with `loadComponent`, and re-exporting them here would pull
// the entire feature into a single chunk.
export * from './models/salary.dto';
export * from './services/salary.service';
