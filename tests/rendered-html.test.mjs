import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";

const port = 3187;
let server;
let serverOutput = "";

test.before(async () => {
  server = spawn(process.execPath, ["node_modules/vinext/dist/cli.js", "start", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, WRANGLER_LOG_PATH: ".wrangler/wrangler-test.log" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => { serverOutput += chunk; });
  server.stderr.on("data", (chunk) => { serverOutput += chunk; });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Production preview did not start:\n${serverOutput}`);
});

test.after(() => server?.kill());

test("production serves the playable Sumito experience", async () => {
  const response = await fetch(`http://127.0.0.1:${port}/`, { headers: { accept: "text/html" } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Sumito — Hex Strategy Game<\/title>/i);
  assert.match(html, /Hexagonal game board/);
  // Title screen: name, one-line description, inactive board, start choices.
  assert.match(html, /<h1>Sumito<\/h1>/);
  assert.match(html, /push six of their marbles off the edge/);
  assert.match(html, /Developed by <a href="https:\/\/kashifaziz.me"/);
  assert.match(html, /data-tip="Start a match"/);
  assert.match(html, /fonts.googleapis.com\/css2\?family=Cinzel\+Decorative/);
  assert.match(html, /aria-label="Start"/);
  assert.match(html, /How to play/);
  assert.match(html, /Tutorial/);
  assert.match(html, /board-area is-idle/);
  assert.doesNotMatch(html, /available to move/, "the board is inactive until a match starts");
  assert.match(html, /Pass and play/);
  assert.match(html, /Vs computer/);
  assert.match(html, /Belgian Daisy/);
  assert.match(html, /Move review/);
  // The game route is board-first: marketing copy and the developer roadmap live elsewhere or nowhere.
  assert.doesNotMatch(html, /THE CLASSIC HEXAGONAL DUEL|Milestone 07 foundation|All seven foundations|BUILD ROADMAP/);
});

test("production serves the learn page with rules and strategy", async () => {
  const response = await fetch(`http://127.0.0.1:${port}/learn`, { headers: { accept: "text/html" } });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /The hexagon duel/);
  assert.match(html, /Hold the centre/);
  assert.match(html, /Move as one/);
  assert.match(html, /How to play/);
  assert.match(html, /Pick a line/);
  assert.match(html, /kashifaziz.me/);
  assert.doesNotMatch(html, /href="\/pro"/, "Pro is not promoted from /learn");
  assert.match(html, /Three ideas to play by/);
  assert.match(html, /tutorial=1/);
  assert.doesNotMatch(html, /All seven foundations/);
});

test("production serves the about page with the disclaimer", async () => {
  const response = await fetch(`http://127.0.0.1:${port}/about`, { headers: { accept: "text/html" } });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Inspired by Abalone/);
  assert.match(html, /not affiliated with, endorsed by, or sponsored by/);
  assert.match(html, /github.com\/kashaziz\/sumito/);
  assert.match(html, /MIT licence/);
});

test("production serves the privacy page", async () => {
  const response = await fetch(`http://127.0.0.1:${port}/privacy`, { headers: { accept: "text/html" } });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /No accounts/);
  assert.match(html, /Google Fonts/);
  assert.match(html, /Cloudflare/);
});

test("pages ship a favicon, app icons, and a 1200×630 link-preview image", async () => {
  const html = await (await fetch(`http://127.0.0.1:${port}/`)).text();
  assert.match(html, /rel="icon" href="[^"]*\/favicon.svg"/);
  assert.match(html, /rel="apple-touch-icon" href="[^"]*\/apple-touch-icon.png"/);
  assert.match(html, /property="og:image" content="[^"]*\/og.png"/);
  assert.match(html, /property="og:image:width" content="1200"/);
  assert.match(html, /property="og:image:height" content="630"/);
  for (const asset of ["/favicon.svg", "/apple-touch-icon.png", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/og.png"]) {
    const response = await fetch(`http://127.0.0.1:${port}${asset}`);
    assert.equal(response.status, 200, asset);
  }
  const manifest = await (await fetch(`http://127.0.0.1:${port}/manifest.webmanifest`)).json();
  assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable" && icon.sizes === "512x512"));
});
