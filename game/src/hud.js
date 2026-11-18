// The HUD: cash, health, wanted stars, the objective line, the message feed, the
// context prompt, the crosshair, the speedometer — and the minimap, a live 2D
// top-down canvas of the city with the player, the traffic, the police and the
// mission marker on it. DOM updates only when a value changes.
import { CITY, WANTED } from './config.js';

const MAP_SIZE = 184;

export function createHud() {
  const el = (id) => document.getElementById(id);
  const cashEl = el('cash');
  const healthFill = el('health-fill');
  const healthNum = el('health-num');
  const starsEl = el('stars');
  const objectiveEl = el('objective');
  const objectiveText = el('objective-text');
  const timerEl = el('objective-timer');
  const promptEl = el('prompt');
  const feedEl = el('feed');
  const speedEl = el('speed');
  const speedNum = el('speed-num');
  const crosshair = el('crosshair');
  const damageEl = el('damage');
  const mapCanvas = el('minimap');
  const mapCtx = mapCanvas.getContext('2d');

  let lastCash = -1;
  let lastHealth = -1;
  let lastStars = -1;
  let lastObjective = '';
  let lastPrompt = '';
  let lastSpeed = -1;
  let feedLines = [];

  function setCash(cash) {
    if (cash === lastCash) return;
    lastCash = cash;
    cashEl.textContent = `$${cash.toLocaleString('en-US')}`;
  }

  function setHealth(health) {
    const h = Math.max(0, Math.round(health));
    if (h === lastHealth) return;
    lastHealth = h;
    healthNum.textContent = String(h);
    healthFill.style.width = `${h}%`;
    healthFill.classList.toggle('low', h < 30);
    damageEl.classList.toggle('on', h < 30);
  }

  function setStars(stars) {
    if (stars === lastStars) return;
    lastStars = stars;
    let text = '';
    for (let i = 0; i < WANTED.maxStars; i += 1) text += i < stars ? '★' : '☆';
    starsEl.textContent = text;
    starsEl.classList.toggle('hot', stars > 0);
  }

  function setObjective(title, text, timer) {
    const key = `${title}|${text}`;
    if (key !== lastObjective) {
      lastObjective = key;
      objectiveEl.hidden = !title;
      objectiveText.textContent = title ? `${title} — ${text}` : '';
    }
    if (timer !== undefined && timer !== null) {
      timerEl.hidden = false;
      timerEl.textContent = `${Math.max(0, Math.ceil(timer))}s`;
      timerEl.classList.toggle('urgent', timer < 15);
    } else {
      timerEl.hidden = true;
    }
  }

  function setPrompt(text) {
    if (text === lastPrompt) return;
    lastPrompt = text;
    promptEl.textContent = text;
    promptEl.hidden = !text;
  }

  function message(text) {
    feedLines.push(text);
    if (feedLines.length > 4) feedLines = feedLines.slice(-4);
    feedEl.innerHTML = feedLines.map((line) => `<div class="feed-line">${line}</div>`).join('');
  }

  function setSpeed(kmh, inCar) {
    const v = inCar ? Math.round(kmh) : -1;
    if (v === lastSpeed) return;
    lastSpeed = v;
    speedEl.hidden = v < 0;
    if (v >= 0) speedNum.textContent = String(v);
  }

  function setCrosshair(on) {
    crosshair.hidden = !on;
  }

  function flashDamage() {
    damageEl.classList.add('hit');
    window.setTimeout(() => damageEl.classList.remove('hit'), 160);
  }

  /** Draw the minimap: roads, sea, player arrow, cars, police, mission marker. */
  function drawMinimap(world) {
    const g = mapCtx;
    const scale = MAP_SIZE / (CITY.extent * 2 + 40);
    const toMap = (x, z) => [(x + CITY.extent + 20) * scale, (z + CITY.extent + 20) * scale];
    g.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
    g.fillStyle = 'rgba(24, 28, 36, 0.88)';
    g.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    // Sea and sand along the top edge of the map (south is up here: z falls to the sea).
    const [, beachY] = toMap(0, CITY.beachZ);
    g.fillStyle = '#1e6f8e';
    g.fillRect(0, 0, MAP_SIZE, beachY);
    g.fillStyle = '#e8cf9a';
    g.fillRect(0, beachY, MAP_SIZE, 3);
    // Roads.
    g.strokeStyle = '#5a6068';
    g.lineWidth = 5;
    for (const at of world.city.roadLines) {
      const [x] = toMap(at, 0);
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, MAP_SIZE); g.stroke();
      const [, z] = toMap(0, at);
      g.beginPath(); g.moveTo(0, z); g.lineTo(MAP_SIZE, z); g.stroke();
    }
    // Mission marker.
    const marker = world.missionMarker;
    if (marker) {
      const [mx, my] = toMap(marker.x, marker.z);
      g.fillStyle = '#f2c230';
      g.beginPath(); g.arc(mx, my, 5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#f2c230';
      g.lineWidth = 2;
      g.beginPath(); g.arc(mx, my, 9, 0, Math.PI * 2); g.stroke();
    }
    // Safehouse.
    const sh = world.city.landmarks.safehouse;
    const [sx, sy] = toMap(sh.x, sh.z);
    g.fillStyle = '#38b24a';
    g.fillRect(sx - 3, sy - 3, 6, 6);
    // Traffic cars.
    g.fillStyle = '#e8e4da';
    for (const car of world.traffic.cars) {
      const [cx, cy] = toMap(car.pos.x, car.pos.z);
      g.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    }
    // Police, flashing.
    const blink = Math.floor(performance.now() / 300) % 2 === 0;
    g.fillStyle = blink ? '#ff4040' : '#4080ff';
    for (const cruiser of world.police.cruisers) {
      const [cx, cy] = toMap(cruiser.pos.x, cruiser.pos.z);
      g.beginPath(); g.arc(cx, cy, 3.5, 0, Math.PI * 2); g.fill();
    }
    // Player arrow, pointing along the heading. Map x is right, map z is down,
    // so a heading h needs a rotation of PI - h from the up-pointing triangle.
    const [px, py] = toMap(world.playerPos.x, world.playerPos.z);
    g.save();
    g.translate(px, py);
    g.rotate(Math.PI - world.heading);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -7); g.lineTo(5, 6); g.lineTo(-5, 6); g.closePath();
    g.fill();
    g.restore();
    // North tick.
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.font = 'bold 10px system-ui, sans-serif';
    g.fillText('N', 4, 12);
  }

  return {
    setCash, setHealth, setStars, setObjective, setPrompt, message,
    setSpeed, setCrosshair, flashDamage, drawMinimap,
  };
}
