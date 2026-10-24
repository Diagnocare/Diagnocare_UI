// SessionSignalRService was removed.
//
// It held a WebSocket to the API's /hubs/session and listened for a "sessionCheck"
// push so a displaced browser was logged out instantly instead of on its next API
// call. The hub on the server side had no backplane, so on a scaled-out deployment
// the push only reached connections pinned to one instance — and wherever WebSockets
// were blocked by a proxy or edge, SignalR fell back to long polling and generated
// continuous HTTP traffic.
//
// Kick-out now relies on the server-side check that was always the real enforcement:
// the JWT's "sid" claim is compared against the user's current ActiveSessionId on
// every authenticated request, so a displaced token is rejected the next time it is
// used. AppComponent's periodic ping covers a tab left idle.
//
// This file is intentionally empty and can be deleted along with its folder, and
// @microsoft/signalr can be dropped from package.json.
export {};
