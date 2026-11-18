// SOLMAR — Bay City Heat. Boot and the one loop: a fixed 60 Hz simulation feeding
// a render at the display's rate. The game moves between screens — title, play,
// paused, busted, wasted and the finale — and the HUD is updated from the world
// every frame.
//
// ?shot=1|2|3|4 with &seed=N stages that scene instead of running the loop,
// renders it twice, then freezes it and sets window.__shotReady for a capture.
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createInput, ACT_PAUSE } from './input.js';
import { createRenderer } from './render.js';
import { createWorld, EVENT_ALL_DONE, EVENT_BUSTED, EVENT_WASTED } from './world.js';
import { stageShot } from './shots.js';

const FIXED_STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

window.addEventListener('error', (event) => {
  const fatal = document.getElementById('fatal');
  if (fatal) fatal.textContent = `ERROR: ${event.message}`;
  document.title = `ERROR: ${event.message}`;
});

const renderer = createRenderer(document.getElementById('game'));
const world = createWorld(renderer.scene, seed);
const audio = createAudio();
const hud = createHud();
const input = createInput(renderer.renderer.domElement);
world.attachAudio(audio);

const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayCopy = document.getElementById('overlay-copy');
const overlayExtra = document.getElementById('overlay-extra');
const playButton = document.getElementById('play');
const hudRoot = document.getElementById('hud');
const status = document.getElementById('status');

let screen = 'title';
let saveExists = false;

function announce(message) {
  status.textContent = message;
}

function showOverlay(title, copy, extra, button) {
  overlay.hidden = false;
  overlayTitle.textContent = title;
  overlayCopy.textContent = copy;
  overlayExtra.textContent = extra;
  playButton.textContent = button;
  // A locked pointer would send the player's clicks to the canvas instead of
  // this panel, so release it whenever a menu appears.
  if (document.pointerLockElement) document.exitPointerLock();
}

function hideOverlay() {
  overlay.hidden = true;
}

function refreshHud() {
  const st = world.state;
  hud.setCash(st.cash);
  hud.setHealth(st.health);
  hud.setStars(world.police.stars);
  hud.setSpeed(st.inCar ? Math.abs(world.playerCar.speed) * 3.2 : 0, st.inCar);
  hud.setCrosshair(!st.inCar && screen === 'play');
  // Objective line.
  const missions = world.missions;
  if (missions.active) {
    const step = missions.currentStep();
    let timer = null;
    let text = step ? step.text : '';
    if (step && step.timer) timer = step.timer - missions.active.timer;
    // The defeat step counts down live as rivals go down.
    if (step && step.kind === 'defeat') text = `Defeat the Dune crew (${missions.defeatLeft()} left)`;
    hud.setObjective(missions.active.mission.title, text, timer);
  } else if (missions.done) {
    hud.setObjective('Solmar City is yours', 'All five jobs done. The city is yours, Rae.', null);
  } else {
    hud.setObjective('Next job', 'Head to the safehouse marker and press E', null);
  }
  // Context prompt.
  let prompt = '';
  if (screen === 'play' && !st.inCar) {
    const near = world.traffic.nearestCar(st.pos, 4.5);
    if (near) prompt = 'Press E to steal the car';
    else if (!missions.active && !missions.done) {
      const sh = world.city.landmarks.safehouse;
      if (Math.hypot(st.pos.x - sh.x, st.pos.z - sh.z) < 9) prompt = 'Press E to start the next job';
    }
  } else if (screen === 'play' && st.inCar) {
    prompt = 'E — get out   ·   Space — handbrake';
  }
  if (st.reloadTimer > 0) prompt = 'Reloading…';
  hud.setPrompt(prompt);
  hud.drawMinimap(world);
}

world.onWorldEvent((event, data) => {
  if (event === 'mission-start') {
    hud.message(`📱 Vera: ${data.mission.brief}`);
    announce(data.mission.title);
  } else if (event === 'mission-step') {
    hud.message(`Objective updated — ${data.mission.title}`);
  } else if (event === 'mission-done') {
    hud.message(`✔ Job done: ${data.mission.title} — +$${data.mission.reward}`);
    announce(`Job done. Earned $${data.mission.reward}.`);
  } else if (event === 'mission-failed') {
    hud.message(`✖ Job failed: ${data.mission.title} — ${data.reason}. Talk to Vera to retry.`);
  } else if (event === 'all-done') {
    hud.message('🏆 All five jobs done — Solmar City is yours!');
  } else if (event === 'steal') {
    hud.message('You stole the car — the heat is on!');
  } else if (event === 'kill') {
    hud.message('Rival down.');
  } else if (event === 'hurt') {
    hud.flashDamage();
  } else if (event === 'enemies') {
    hud.message(`The Dune crew is here — ${data.count} of them.`);
  } else if (event === 'busted') {
    hud.message(`Busted! The PD took $${data.fine} off you.`);
  }
});

function startGame(continued) {
  audio.unlock();
  audio.startMusic();
  screen = 'play';
  hideOverlay();
  hudRoot.hidden = false;
  announce(continued ? 'Welcome back to Solmar City.' : 'Welcome to Solmar City. Steal a car, take the jobs, own the city.');
}

function showTitle() {
  screen = 'title';
  hudRoot.hidden = true;
  saveExists = world.load();
  if (saveExists) world.reset(false);
  const extra = saveExists
    ? `Save found — $${world.state.cash} in the bank, ${world.missions.completed} of 5 jobs done.`
    : 'A new driver in town. No save yet.';
  showOverlay(
    'SOLMAR',
    'Bay City Heat — an open-world crime game. Steal cars, outrun the Solmar PD, run five jobs for Vera and own the city.',
    extra,
    saveExists ? 'Continue — back to the streets' : 'Start — new game',
  );
  announce('Solmar, Bay City Heat. Press Enter or click to start.');
}

function pauseGame() {
  screen = 'paused';
  showOverlay('Paused', 'The city waits for no one — except right now.', `Cash $${world.state.cash} · ${world.missions.completed} of 5 jobs done`, 'Resume');
  announce('Paused.');
}

function showBusted() {
  screen = 'busted';
  showOverlay('BUSTED', 'The Solmar PD caught you. They took their fine and dumped you at the safehouse.', `Cash $${world.state.cash}`, 'Back to the streets');
  announce('Busted by the police.');
}

function showWasted() {
  screen = 'wasted';
  showOverlay('WASTED', 'Rae went down. Vera patched you up — the city is still out there.', `Cash $${world.state.cash}`, 'Get back up');
  announce('Wasted.');
}

function showFinale() {
  screen = 'alldone';
  showOverlay(
    'SOLMAR IS YOURS',
    'All five jobs done. Vera hands you the keys to the city — the bank, the marina, the whole sunset coast.',
    `Final take: $${world.state.cash} · ${world.state.carsStolen} cars stolen · ${world.state.kills} rivals down`,
    'Keep driving — free roam',
  );
  announce('All five jobs done. Solmar City is yours.');
}

playButton.addEventListener('click', () => {
  audio.unlock();
  audio.click();
  if (screen === 'title') {
    if (saveExists) world.load();
    startGame(saveExists);
  } else if (screen === 'paused') {
    startGame(false);
  } else if (screen === 'busted' || screen === 'wasted') {
    world.reset(false);
    world.state.busted = false;
    world.state.wasted = false;
    startGame(false);
  } else if (screen === 'alldone') {
    startGame(true);
  }
});

function runShot(name) {
  const staged = stageShot(name, world, input, renderer.camera);
  screen = staged.screen;
  hudRoot.hidden = false;
  if (staged.screen === 'title') {
    showOverlay(
      'SOLMAR',
      'Bay City Heat — an open-world crime game. Steal cars, outrun the Solmar PD, run five jobs for Vera and own the city.',
      'A new driver in town. No save yet.',
      'Start — new game',
    );
  } else {
    hideOverlay();
  }
  refreshHud();
  let painted = 0;
  function paint() {
    renderer.render(world, FIXED_STEP);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let accumulator = 0;
  let last = performance.now();
  showTitle();

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    if (input.takeFlag(ACT_PAUSE)) {
      if (screen === 'play') pauseGame();
      else if (screen === 'paused') startGame(false);
    }
    if (screen === 'play') {
      accumulator += dt;
      let guard = 0;
      while (accumulator >= FIXED_STEP && guard < 8) {
        const events = world.step(FIXED_STEP, input, renderer.camera);
        accumulator -= FIXED_STEP;
        guard += 1;
        if (events & EVENT_BUSTED) { showBusted(); break; }
        if (events & EVENT_WASTED) { showWasted(); break; }
        if (events & EVENT_ALL_DONE) { showFinale(); break; }
      }
      if (guard >= 8) accumulator = 0;
    } else if (screen === 'title') {
      // The title screen lives: traffic and pedestrians keep moving.
      accumulator += dt;
      while (accumulator >= FIXED_STEP) {
        world.step(FIXED_STEP, input, renderer.camera, false);
        accumulator -= FIXED_STEP;
      }
    }
    audio.update(dt, audio.now());
    if (screen !== 'title') refreshHud();
    renderer.render(world, dt);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') pauseGame();
  });

  requestAnimationFrame(frame);
}

// A handle for headless playtests: drive the real game from a script.
window.__game = { world, input, audio, hud, camera: renderer.camera, get screen() { return screen; } };

if (shot) runShot(shot);
else runGame();
