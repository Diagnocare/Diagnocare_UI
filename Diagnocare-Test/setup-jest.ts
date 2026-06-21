import 'jest-preset-angular/setup-jest';
import 'zone.js';

/**
 * Point the services at a deterministic fake base URL so all
 * HttpTestingController.expectOne() calls can match simple string patterns.
 */
(window as any).RUNTIME_CONFIG = {
  diagnocareApiURL: 'http://localhost:5000/',
};
