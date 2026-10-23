import 'jest-preset-angular/setup-jest';
import 'zone.js';

/**
 * Point the services at a deterministic fake base URL so all
 * HttpTestingController.expectOne() calls can match simple string patterns.
 */
(window as any).RUNTIME_CONFIG = {
  diagnocareApiURL: 'http://localhost:5000/',
};

/**
 * jsdom ships no BroadcastChannel, but TokenService opens one in its constructor for
 * cross-tab token hand-off — so every suite that injects a component depending on
 * TokenService dies at injection time with "BroadcastChannel is not defined".
 *
 * A no-op stub is enough: nothing under test asserts on cross-tab messaging, and a real
 * channel (e.g. the one in node:worker_threads) would hold the event loop open.
 */
if (typeof (globalThis as any).BroadcastChannel === 'undefined') {
  (globalThis as any).BroadcastChannel = class BroadcastChannelStub {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onmessageerror: ((event: MessageEvent) => void) | null = null;

    constructor(public readonly name: string) {}

    postMessage(_message: unknown): void { /* no other tab to notify */ }
    addEventListener(_type: string, _listener: unknown): void { /* no events are ever emitted */ }
    removeEventListener(_type: string, _listener: unknown): void { /* nothing registered */ }
    dispatchEvent(_event: Event): boolean { return false; }
    close(): void { /* nothing to release */ }
  };
}
