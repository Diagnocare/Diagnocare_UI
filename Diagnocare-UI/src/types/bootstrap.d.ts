/**
 * Bootstrap 5 ships no type declarations of its own (@types/bootstrap is a
 * separate package, and pulls in Popper types this app does not need).
 *
 * `bootstrap/js/dist/modal` is the single-component entry point: importing it
 * costs Modal and its helpers, not the whole library, and needs no Popper.
 */
declare module 'bootstrap';
declare module 'bootstrap/js/dist/modal';
