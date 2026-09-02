/**
 * Minimal service worker — its only job is to make the dashboard an
 * installable PWA (a registered SW with a fetch handler is what browsers
 * look for). It deliberately does NOT cache anything: this is a live admin
 * dashboard that must always show fresh data, and caching HTML here risks
 * serving a stale — or blank — shell. Every request is passed straight to
 * the network.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  /* pass-through: do not intercept — let the network handle every request */
});
