// Service-worker QA in a real browser: caching rules, page-data bypass, cache trimming, and offline
// behaviour (the preview server is stopped part-way, so the worker's own fetches fail too).
//
// Usage: npm run build, start Chrome with --remote-debugging-port=$CDP_PORT, then
//   CDP_PORT=9336 npm run qa:sw
// The script starts and stops its own `vite preview` server on SW_QA_PORT (default 3198).
import { spawn } from "node:child_process";

const cdpPort = process.env.CDP_PORT ?? "9336";
const port = process.env.SW_QA_PORT ?? "3198";
const base = `http://127.0.0.1:${port}`;
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", port, "--strictPort"], { stdio: "ignore" });
for (let attempt = 0; attempt < 300; attempt += 1) {
  try {
    if ((await fetch(base)).ok) break;
  } catch {
    await sleep(100);
  }
}

const target = await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: "PUT" }).then((response) => response.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
let requestId = 0;
const pending = new Map();
const network = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.method === "Network.requestWillBeSent") network.set(message.params.requestId, { url: message.params.request.url, rsc: message.params.request.headers?.RSC ?? message.params.request.headers?.rsc });
  if (message.method === "Network.responseReceived" && network.has(message.params.requestId)) Object.assign(network.get(message.params.requestId), { fromSW: message.params.response.fromServiceWorker });
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message.result);
    pending.delete(message.id);
  }
});
const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++requestId;
  pending.set(id, resolve);
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.value;
const results = [];
function check(name, ok, detail) {
  results.push(Boolean(ok));
  console.log(`${ok ? "✔" : "✖"} ${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
}
const cacheName = await fetch(`${base}/sw.js`).then((response) => response.text()).then((text) => text.match(/const CACHE = "([^"]+)"/)?.[1]);
const cacheKeys = () => evaluate(`caches.open(${JSON.stringify(cacheName)}).then((cache) => cache.keys()).then((keys) => keys.map((key) => key.url.replace(${JSON.stringify(base)}, "")))`);

await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `${base}/` });
await sleep(2500);
await evaluate("navigator.serviceWorker.ready.then(() => true)");
await send("Page.reload");
await sleep(2000);
check("hashed build files are served through the service worker", [...network.values()].some((entry) => entry.url.includes("/_next/static/") && entry.fromSW));

await send("Page.navigate", { url: `${base}/learn` });
await sleep(2000);
network.clear();
await evaluate(`document.querySelector('.lp-footer-links a[href="/about"]').click(); true`);
await sleep(2500);
const pageData = [...network.values()].filter((entry) => entry.url.includes("_rsc") || entry.rsc === "1");
check("a link click fetches page data, and it bypasses the service worker", pageData.length > 0 && pageData.every((entry) => !entry.fromSW), pageData.map((entry) => entry.fromSW));

await send("Page.navigate", { url: `${base}/?tutorial=1` });
await sleep(2000);
await send("Page.navigate", { url: `${base}/learn` });
await sleep(1500);
const keys = await cacheKeys();
check("the cache holds hashed files and plain page URLs", keys.some((key) => key.startsWith("/_next/static/")) && keys.includes("/") && keys.includes("/learn"), keys.filter((key) => !key.startsWith("/_next/static/")));
check("no page-data or query-string entries are cached", !keys.some((key) => key.includes("_rsc") || key.includes("?")));
check("only the current cache exists", JSON.stringify(await evaluate("caches.keys()")) === JSON.stringify([cacheName]), await evaluate("caches.keys()"));

// Trimming: fill the cache with old build files, then make the worker fetch one real file again.
// Pick a build file the current page (/learn) actually loads, so the reload must fetch it again.
const usedHere = await evaluate(`performance.getEntriesByType("resource").map((entry) => new URL(entry.name).pathname).filter((path) => path.startsWith("/_next/static/"))`);
const realAsset = keys.find((key) => usedHere.includes(key));
await evaluate(`(async () => {
  const cache = await caches.open(${JSON.stringify(cacheName)});
  for (let index = 0; index < 130; index += 1) await cache.put("/_next/static/old-build-" + index + ".js", new Response("old"));
  // Build files are served with "Vary: Origin", so delete regardless of request headers.
  await cache.delete(${JSON.stringify(realAsset)}, { ignoreVary: true });
  return true;
})()`);
// Bypass the page's in-memory cache for this reload, so the request really reaches the worker.
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Page.reload");
await sleep(2500);
await send("Network.setCacheDisabled", { cacheDisabled: false });
const trimmed = (await cacheKeys()).filter((key) => key.startsWith("/_next/static/"));
check("old build files are trimmed to at most 120, newest kept", trimmed.length <= 120 && trimmed.includes(realAsset) && !trimmed.includes("/_next/static/old-build-0.js"), { count: trimmed.length });

// Offline: stop the server, so the service worker's own requests fail as well.
server.kill();
await sleep(1500);
await send("Page.navigate", { url: `${base}/learn` });
await sleep(2500);
check("offline: a visited page loads from the cache", /Hold the centre/.test(await evaluate(`document.querySelector(".lp h1")?.textContent ?? ""`)));
await send("Page.navigate", { url: `${base}/?tutorial=1` });
await sleep(2500);
check("offline: a link with a query string loads the cached page", await evaluate(`Boolean(document.querySelector(".game"))`));
await send("Page.navigate", { url: `${base}/privacy` });
await sleep(2500);
const offline = await evaluate(`({ title: document.title, path: location.pathname })`);
check("offline: a page never visited shows the offline page, not the home page", offline.title === "Offline — Sumito" && offline.path === "/privacy", offline);

socket.close();
const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} service-worker checks passed`);
process.exit(failed ? 1 : 0);
