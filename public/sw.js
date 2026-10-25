// Makes Maskopi installable as an app and shows a friendly page when offline.
const OFFLINE_PAGE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Maskopi</title><body style="font-family:system-ui;background:#2b1055;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center">
<div><h1>You're offline</h1><p>Maskopi needs the internet to play. Check the Wi-Fi and try again.</p></div></body>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(
    fetch(e.request).catch(() => new Response(OFFLINE_PAGE, { headers: { "content-type": "text/html" } })),
  );
});
