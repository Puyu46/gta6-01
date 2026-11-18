// Capture the four SOLMAR screenshots with headless Chromium (chrome-headless-shell
// driven by playwright-core). Serves game/ on a local port, loads each ?shot=
// scene, waits for window.__shotReady, and saves a 1280x720 JPEG. Also logs any
// console error and any network request, so a bad frame is caught here, not later.
//
// Usage: node tools/capture-shots.mjs [port]
import { chromium } from '/home/hatch/workspace/makefun/token-radar-shots/node_modules/playwright-core/index.mjs';
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('..', import.meta.url));
const root = resolve(join(here, 'game'));
const outDir = resolve(join(here, 'screenshots'));
const port = Number(process.argv[2] ?? '8123');
const executablePath = resolve(process.env.HOME, '.chrome-headless-shell/chrome-headless-shell-linux64/chrome-headless-shell');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
};

const SHOTS = [
  ['1-title.jpg', '?shot=1&seed=7'],
  ['2-drive.jpg', '?shot=2&seed=7'],
  ['3-chase.jpg', '?shot=3&seed=7'],
  ['4-mission.jpg', '?shot=4&seed=7'],
];

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end('bad request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = resolve(join(root, normalize(pathname)));
  if (file !== root && !file.startsWith(root + sep)) {
    response.writeHead(403).end('forbidden');
    return;
  }
  let size;
  try {
    size = statSync(file).size;
  } catch {
    response.writeHead(404).end('not found');
    return;
  }
  response.writeHead(200, {
    'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': size,
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(response);
});

await new Promise((resolveListen) => server.listen(port, '127.0.0.1', resolveListen));
console.log(`serving game/ on http://localhost:${port}`);

const browser = await chromium.launch({
  executablePath,
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
let failed = false;
for (const [name, query] of SHOTS) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  const requests = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('request', (req) => requests.push(req.url()));
  await page.goto(`http://localhost:${port}/${query}`, { waitUntil: 'load' });
  try {
    await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 30000 });
  } catch {
    console.log(`${name}: TIMEOUT waiting for __shotReady`);
    failed = true;
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(outDir, name), type: 'jpeg', quality: 82 });
  const external = requests.filter((u) => !u.startsWith('http://localhost'));
  console.log(`${name}: errors=${errors.length} requests=${requests.length} external=${external.length}`);
  for (const e of errors) console.log(`  ERROR: ${e}`);
  for (const u of external) console.log(`  EXTERNAL: ${u}`);
  if (errors.length > 0 || external.length > 0) failed = true;
  await page.close();
}
await browser.close();
server.close();
console.log(failed ? 'CAPTURE DONE WITH PROBLEMS' : 'CAPTURE OK');
process.exit(failed ? 1 : 0);
