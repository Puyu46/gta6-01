// Headless playtest for SOLMAR: drives the real game in headless Chromium and
// checks the core loop — move on foot, steal a car, drive, wanted heat, mission
// 1 from start to payout, combat kills, the bust, and save/load. Headless
// SwiftShader runs the sim slower than real time, so every check polls for its
// condition with a generous wall-clock timeout instead of sleeping a fixed time.
// Exits non-zero on any failed check.
//
// Usage: node tools/playtest.mjs [port]
import { chromium } from '/home/hatch/workspace/makefun/token-radar-shots/node_modules/playwright-core/index.mjs';
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('..', import.meta.url));
const root = resolve(join(here, 'game'));
const port = Number(process.argv[2] ?? '8125');
const executablePath = resolve(process.env.HOME, '.chrome-headless-shell/chrome-headless-shell-linux64/chrome-headless-shell');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { response.writeHead(400).end('bad'); return; }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = resolve(join(root, normalize(pathname)));
  if (file !== root && !file.startsWith(root + sep)) { response.writeHead(403).end('forbidden'); return; }
  let size;
  try { size = statSync(file).size; } catch { response.writeHead(404).end('not found'); return; }
  response.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'content-length': size, 'cache-control': 'no-store' });
  createReadStream(file).pipe(response);
});
await new Promise((r) => server.listen(port, '127.0.0.1', r));

const browser = await chromium.launch({
  executablePath,
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (err) => errors.push(String(err)));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}
const snap = () => page.evaluate(() => {
  const w = window.__game.world;
  return {
    screen: window.__game.screen,
    inCar: w.state.inCar,
    cash: w.state.cash,
    health: w.state.health,
    stars: w.police.stars,
    pos: [w.state.pos.x, w.state.pos.z],
    speed: w.state.inCar ? Math.abs(w.playerCar.speed) : 0,
    mission: w.missions.active ? w.missions.active.mission.id : null,
    missionStep: w.missions.active ? w.missions.active.step : -1,
    completed: w.missions.completed,
    kills: w.state.kills,
    enemiesAlive: w.enemies.aliveCount(),
  };
});
/** Wait until `fn(state)` is true, polling the live game state. */
async function waitFor(name, fn, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const s = await snap();
    if (fn(s)) return s;
    await page.waitForTimeout(250);
  }
  return null;
}

await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
check('game boots with no errors', errors.length === 0, errors.join(' | '));
check('title screen shows', (await snap()).screen === 'title');

// Start the game.
await page.click('#play');
await page.waitForTimeout(500);
check('play starts', (await snap()).screen === 'play');

// Walk forward, facing the open road south of the safehouse.
await page.evaluate(() => { window.__game.world.state.cameraYaw = 0; });
const startPos = (await snap()).pos;
await page.keyboard.down('KeyW');
const walked = await waitFor('walk', (s) => Math.hypot(s.pos[0] - startPos[0], s.pos[1] - startPos[1]) > 5);
await page.keyboard.up('KeyW');
check('player walks on foot', walked !== null, walked ? `moved ${Math.hypot(walked.pos[0] - startPos[0], walked.pos[1] - startPos[1]).toFixed(1)} units` : 'did not move');

// Steal the nearest traffic car.
await page.evaluate(() => {
  const w = window.__game.world;
  const car = w.traffic.cars[0];
  w.state.pos.set(car.pos.x + 2, 0, car.pos.z);
});
await page.keyboard.press('KeyE');
const inCar = await waitFor('enter car', (s) => s.inCar === true);
check('stealing a car puts the player in it', inCar !== null);
check('stealing raises wanted heat', inCar !== null && inCar.stars >= 1, inCar ? `${inCar.stars} stars` : '');

// Drive.
await page.keyboard.down('KeyW');
const driving = await waitFor('drive', (s) => s.speed > 10);
await page.keyboard.up('KeyW');
check('car drives', driving !== null, driving ? `${(driving.speed * 3.2).toFixed(0)} km/h` : 'never moved');
check('police cruisers are on the case', driving !== null && driving.stars >= 1);

// Get out.
await page.keyboard.press('KeyE');
const outCar = await waitFor('exit car', (s) => s.inCar === false);
check('player gets out of the car', outCar !== null);

// Mission 1: start at the safehouse, steal a car, drive to the docks.
await page.evaluate(() => {
  const w = window.__game.world;
  w.police.clear();
  const sh = w.city.landmarks.safehouse;
  w.state.pos.set(sh.x, 0, sh.z + 6);
});
await page.keyboard.press('KeyE');
const m1 = await waitFor('mission 1 start', (s) => s.mission === 'hot-wheels');
check('mission 1 starts at the safehouse', m1 !== null, m1 ? `mission=${m1.mission}` : '');
await page.evaluate(() => {
  const w = window.__game.world;
  const car = w.traffic.cars[0];
  w.state.pos.set(car.pos.x + 2, 0, car.pos.z);
});
await page.keyboard.press('KeyE');
const m1step = await waitFor('mission 1 steal step', (s) => s.mission === 'hot-wheels' && s.missionStep === 1);
check('stealing the car advances mission 1', m1step !== null, m1step ? `step=${m1step.missionStep}` : '');
const cashBefore = m1step ? m1step.cash : 0;
await page.evaluate(() => {
  const w = window.__game.world;
  const dk = w.city.landmarks.docks;
  w.playerCar.pos.set(dk.x, 0, dk.z);
});
const m1done = await waitFor('mission 1 done', (s) => s.completed === 1 && s.mission === null);
check('reaching the docks completes mission 1', m1done !== null, m1done ? `completed=${m1done.completed}` : '');
check('mission 1 pays $500', m1done !== null && m1done.cash === cashBefore + 500, m1done ? `$${m1done.cash}` : '');

// Mission 3 combat: spawn the Dune crew, shoot one down.
await page.evaluate(() => {
  const w = window.__game.world;
  if (w.state.inCar) w.exitCar();
  w.police.clear();
  w.missions.load(2);
  w.startMission();
  const plaza = w.city.landmarks.plaza;
  w.state.pos.set(plaza.x + 5, 0, plaza.z + 5);
});
const crew = await waitFor('crew spawns', (s) => s.enemiesAlive === 3);
check('mission 3 spawns the Dune crew', crew !== null, crew ? `alive=${crew.enemiesAlive}` : '');
await page.evaluate(() => {
  const w = window.__game.world;
  const foe = w.enemies.list.find((e) => e.alive);
  // Stand 8 units behind the rival (clear of the fountain) and face them.
  w.state.pos.set(foe.pos.x, 0, foe.pos.z - 8);
  w.state.cameraYaw = 0; // face +z, straight at the rival
});
await page.mouse.move(640, 360);
await page.mouse.down();
const kill = await waitFor('rival down', (s) => s.kills >= 1 || s.enemiesAlive < 3, 30000);
await page.mouse.up();
check('shooting a rival registers kills or damage', kill !== null, kill ? `kills=${kill.kills} alive=${kill.enemiesAlive}` : '');

// Bust: put a cruiser on top of the player on foot and wait.
await page.evaluate(() => {
  const w = window.__game.world;
  if (w.state.inCar) w.exitCar();
  w.police.setStars(3, w.state.pos);
});
const busted = await waitFor('busted', (s) => s.screen === 'busted', 30000);
check('police bust the player when they hold them', busted !== null, busted ? `screen=${busted.screen}` : 'never busted');
if (busted) {
  await page.click('#play');
  const back = await waitFor('back on streets', (s) => s.screen === 'play' && s.stars === 0);
  check('after a bust the player is back on the streets', back !== null, back ? `screen=${back.screen} stars=${back.stars}` : '');
}

// Save / load: save, reload the page, continue.
const saved = await snap();
await page.evaluate(() => window.__game.world.save());
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1200);
await page.click('#play');
await page.waitForTimeout(500);
const loaded = await snap();
check('save/load keeps the cash', loaded.cash === saved.cash, `$${loaded.cash} vs $${saved.cash}`);
check('save/load keeps mission progress', loaded.completed >= 1, `completed=${loaded.completed}`);

check('no console errors during the whole playtest', errors.length === 0, errors.join(' | '));
await browser.close();
server.close();
console.log(failures === 0 ? 'PLAYTEST ALL PASS' : `PLAYTEST ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
