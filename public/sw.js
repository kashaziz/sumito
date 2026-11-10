// Sumito service worker: a small offline cache.
//
// - Hashed build files (/_next/static/*, and /assets/* from older builds) never change → cache first.
//   vinext marks /_next/static/* immutable in its _headers file.
// - Everything else on this origin (pages, manifest, icons, images) → network first; the cached
//   copy is only an offline fallback. Pages wait for the network (a stale page could reference build
//   files that a newer deploy removed); other files fall back to a cached copy after a few seconds.
// - At most MAX_IMMUTABLE_ENTRIES hashed files are kept, oldest removed first, so old deploys do not pile up.
// - vinext page-data requests (RSC: `?_rsc=` / `RSC: 1`) and other origins (e.g. Google Fonts)
//   are left to the browser.
//
// Only hashed files are served cache-first, so a deploy never leaves stale pages behind and the
// cache name only needs a bump when these rules change.
const CACHE = "sumito-shell-v7";
const SHELL = ["/", "/manifest.webmanifest", "/favicon.svg"];
const RESOURCE_TIMEOUT_MS = 5000;
const MAX_IMMUTABLE_ENTRIES = 120;
const IMMUTABLE_PREFIXES = ["/_next/static/", "/assets/"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.searchParams.has("_rsc") || request.headers.get("RSC") === "1" || url.pathname.endsWith(".rsc")) return;

  if (isImmutable(request.url)) {
    event.respondWith(cacheFirst(event, request));
    return;
  }
  event.respondWith(networkFirst(event, request));
});

/** Pages are stored without their query string, so links like /?tutorial=1 do not grow the cache. */
function cacheKey(request) {
  if (request.mode !== "navigate") return request;
  const url = new URL(request.url);
  return url.origin + url.pathname;
}

function store(key, response) {
  if (!response.ok || response.type !== "basic") return Promise.resolve();
  return caches.open(CACHE).then((cache) => cache.put(key, response)).catch(() => {
    // Quota or storage errors only cost us an offline copy.
  });
}

async function cacheFirst(event, request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  event.waitUntil(store(request, response.clone()).then(trimImmutable));
  return response;
}

const isImmutable = (url) => IMMUTABLE_PREFIXES.some((prefix) => new URL(url).pathname.startsWith(prefix));

async function trimImmutable() {
  try {
    const cache = await caches.open(CACHE);
    const keys = (await cache.keys()).filter((request) => isImmutable(request.url));
    const excess = keys.length - MAX_IMMUTABLE_ENTRIES;
    if (excess > 0) await Promise.all(keys.slice(0, excess).map((request) => cache.delete(request, { ignoreVary: true })));
  } catch {
    // Trimming is housekeeping only.
  }
}

async function networkFirst(event, request) {
  const key = cacheKey(request);
  const isNavigation = request.mode === "navigate";
  const network = fetch(request);
  // Keep the worker alive until the fresh copy is stored, even if a cached copy answered first.
  event.waitUntil(network.then((response) => store(key, response.clone())).catch(() => {}));

  try {
    if (isNavigation) return await network;
    const slow = new Promise((resolve) => setTimeout(resolve, RESOURCE_TIMEOUT_MS)).then(() => caches.match(key));
    const first = await Promise.race([network, slow]);
    if (first) return first; // the network response, or a cached copy after the timeout
    return await network; // timed out with nothing cached: keep waiting for the network
  } catch {
    const cached = await caches.match(key);
    if (cached) return cached;
    return isNavigation ? offlinePage() : Response.error();
  }
}

/** Shown for a page that was never visited online. Serving another page's HTML here would break hydration. */
function offlinePage() {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Offline — Sumito</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#1b1f20;color:#eef0ec;font:16px system-ui,sans-serif;text-align:center">
<main><h1 style="font-size:24px">You are offline</h1><p>This page is not saved on this device yet.</p><p><a href="/" style="color:#d5f04a">Open the game</a></p></main></body></html>`;
  return new Response(html, { status: 503, headers: { "content-type": "text/html; charset=utf-8" } });
}
