// The story: Rae, a getaway driver new to Solmar City, works five jobs for Vera,
// a fixer who runs the marina crew. Each mission is a small state machine — go to
// the marker, do the thing, get paid — and the chain is the game's progression:
// the next mission only opens when the last one is done.
import * as THREE from 'three';
import { ECONOMY } from './config.js';

export const MISSIONS = [
  {
    id: 'hot-wheels',
    title: '1 — Hot Wheels',
    giver: 'Vera',
    brief: 'Welcome to Solmar, Rae. First rule: wheels are borrowed, never bought. Steal any car and bring it to the docks.',
    objective: 'Steal a car, then drive to the docks marker',
    reward: ECONOMY.missionReward[0],
    steps: [
      { kind: 'steal-car', text: 'Steal a car — walk up to one and press E' },
      { kind: 'goto', target: 'docks', radius: 10, text: 'Drive to the docks on the south-west shore' },
    ],
  },
  {
    id: 'sunset-parcel',
    title: '2 — Sunset Parcel',
    giver: 'Vera',
    brief: 'A client needs a package moved before sunset. Pick it up at the plaza, drop it at the marina. Ninety seconds. No questions.',
    objective: 'Pick up the parcel, deliver it to the marina in 90s',
    reward: ECONOMY.missionReward[1],
    steps: [
      { kind: 'goto', target: 'plaza', radius: 8, text: 'Pick up the parcel at the plaza fountain' },
      { kind: 'goto', target: 'marina', radius: 9, text: 'Deliver the parcel to the marina — 90 seconds!', timer: 90 },
    ],
  },
  {
    id: 'rooftop-rumble',
    title: '3 — Rooftop Rumble',
    giver: 'Vera',
    brief: 'The Dune crew thinks the plaza is theirs. Go on foot, show them it is not. Three of them. Pistol or fists — your call.',
    objective: 'Defeat the 3 Dune crew members at the plaza',
    reward: ECONOMY.missionReward[2],
    steps: [
      { kind: 'goto', target: 'plaza', radius: 14, text: 'Head to the plaza — the Dune crew is waiting' },
      { kind: 'defeat', count: 3, text: 'Defeat the Dune crew (3 left)' },
    ],
  },
  {
    id: 'heat-wave',
    title: '4 — Heat Wave',
    giver: 'Vera',
    brief: 'You tripped a silent alarm. Three stars and the whole PD is coming. Lose them and get to the safehouse. Do not get busted.',
    objective: 'Survive the heat — reach the safehouse',
    reward: ECONOMY.missionReward[3],
    steps: [
      { kind: 'heat', stars: 3, text: 'The heat is on — 3 stars!' },
      { kind: 'goto', target: 'safehouse', radius: 9, text: 'Reach the safehouse and lay low', timer: 150 },
    ],
  },
  {
    id: 'solmar-score',
    title: '5 — The Solmar Score',
    giver: 'Vera',
    brief: 'The big one. The Solmar Bank vault, sunset, one driver. Grab the cash, then outrun four stars to the safehouse. Do this and you own this city.',
    objective: 'Rob the bank, then escape to the safehouse',
    reward: ECONOMY.missionReward[4],
    steps: [
      { kind: 'goto', target: 'bank', radius: 10, text: 'Get to the Solmar Bank' },
      { kind: 'hold', target: 'bank', radius: 9, seconds: 5, text: 'Crack the vault — stay in the marker' },
      { kind: 'goto', target: 'safehouse', radius: 9, text: 'Escape to the safehouse with the cash!', heat: 4, timer: 180 },
    ],
  },
];

export function createMissions(city) {
  let index = 0; // next mission to play
  let active = null; // { mission, step, timer, hold, kills }
  let completed = 0;

  function markerPos(step) {
    if (!step || !step.target) return null;
    return city.landmarks[step.target] || null;
  }

  function startMission(i) {
    const mission = MISSIONS[i];
    if (!mission) return null;
    active = { mission, step: 0, timer: 0, hold: 0, kills: 0 };
    return active;
  }

  function currentStep() {
    if (!active) return null;
    return active.mission.steps[active.step];
  }

  /** Move to the next step, applying the new step's entry effects (heat, timer). */
  function advance() {
    active.step += 1;
    active.timer = 0;
    active.hold = 0;
    if (active.step >= active.mission.steps.length) {
      const done = active;
      active = null;
      completed = Math.max(completed, index + 1);
      index = Math.min(MISSIONS.length, index + 1);
      return { type: 'done', mission: done.mission };
    }
    const next = active.mission.steps[active.step];
    if (next.heat) active._pendingHeat = next.heat;
    return { type: 'step', mission: active.mission };
  }

  /**
   * Advance the active mission. Returns an event object:
   * { type: 'step'|'done'|'failed', reason } or null.
   */
  function update(dt, ctx) {
    if (!active) return null;
    if (active._pendingHeat) {
      ctx.setHeat(active._pendingHeat);
      active._pendingHeat = 0;
    }
    const step = currentStep();
    if (!step) return null;
    if (step.timer) {
      active.timer += dt;
      if (active.timer > step.timer) {
        const failed = active;
        active = null;
        return { type: 'failed', reason: 'Out of time', mission: failed.mission };
      }
    }
    const target = markerPos(step);
    if (step.kind === 'steal-car') {
      if (ctx.inCar) return advance();
    } else if (step.kind === 'goto') {
      if (target && ctx.playerPos.distanceTo(target) < step.radius) return advance();
    } else if (step.kind === 'hold') {
      if (target && ctx.playerPos.distanceTo(target) < step.radius) {
        active.hold += dt;
        if (active.hold >= step.seconds) return advance();
      } else {
        active.hold = Math.max(0, active.hold - dt * 2);
      }
    } else if (step.kind === 'heat') {
      ctx.setHeat(step.stars);
      return advance();
    } else if (step.kind === 'defeat') {
      if (step.count - active.kills <= 0) return advance();
    }
    return null;
  }

  function onKill() {
    if (!active) return;
    const step = currentStep();
    if (step && step.kind === 'defeat') active.kills += 1;
  }

  function defeatLeft() {
    if (!active) return 0;
    const step = currentStep();
    if (!step || step.kind !== 'defeat') return 0;
    return Math.max(0, step.count - active.kills);
  }

  function fail() {
    const failed = active;
    active = null;
    return failed;
  }

  function load(completedCount) {
    completed = completedCount;
    index = Math.min(MISSIONS.length, completedCount);
  }

  return {
    get index() { return index; },
    get active() { return active; },
    get completed() { return completed; },
    get done() { return index >= MISSIONS.length; },
    startMission, currentStep, markerPos, update, onKill, defeatLeft, fail, load,
  };
}

/** The floating mission beacon: a glowing pillar and a spinning ring. */
export function createBeacon(scene) {
  const group = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 26, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xf2c230, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  pillar.position.y = 13;
  group.add(pillar);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3, 0.22, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xf2c230 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.4;
  group.add(ring);
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0 }),
  );
  dot.position.y = 1;
  group.add(dot);
  group.visible = false;
  scene.add(group);
  return {
    group,
    show(pos) {
      group.visible = true;
      group.position.set(pos.x, 0, pos.z);
    },
    hide() { group.visible = false; },
    update(dt, time) {
      if (!group.visible) return;
      ring.rotation.z += dt * 1.2;
      dot.position.y = 1 + Math.sin(time * 3) * 0.4;
    },
  };
}
