/**
 * Entry point for the UI-kit preview app.
 * ─────────────────────────────────────────────────────────────────────────────
 * This bootstraps ONLY the showcase page — no routing, no guards, no HTTP, no
 * login. That is the point: it runs against the real component source in the
 * real Angular build, but it cannot touch the app, and the app's own build
 * never loads this file.
 *
 *     ng serve ui-kit        →  http://localhost:4300
 *
 * See HOW-TO-RUN.md in this folder for the one additive block angular.json
 * needs before that command works.
 */
import { bootstrapApplication } from '@angular/platform-browser';
import { SimpleUiShowcaseComponent } from './simple-ui-showcase.component';

// No providers: the kit is pure presentation. If a component ever needs one,
// that is a signal it has stopped being a building block.
bootstrapApplication(SimpleUiShowcaseComponent)
  .catch((error) => console.error(error));
