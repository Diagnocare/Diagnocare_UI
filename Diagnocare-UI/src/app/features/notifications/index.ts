// Public API of the notifications feature.
//
// Services, models and helpers only. Components are intentionally absent: every
// screen is loaded with `loadComponent`, and re-exporting them here would pull
// the entire feature into a single chunk.
export * from './models/user-notification.model';
export * from './services/notification.service';
