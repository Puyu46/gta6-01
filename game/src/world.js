// The game itself: the player on foot and behind the wheel, stealing cars, the
// pistol and the fists, the wanted heat, the missions, the cash, and the save.
// No drawing here — render.js paints whatever this state holds. step() advances
// one fixed 1/60 s step and the caller reacts to the events it returns.
import * as THREE from 'three';
import { CAR, CITY, COMBAT, ECONOMY, PLAYER, SAVE_KEY } from './config.js';
import { createCity } from './city.js';
import { createPlayerCar, createTraffic } from './vehicles.js';
import { createPedestrians } from './pedestrians.js';
import { createPolice } from './police.js';
import { createEnemies, createParticles } from './combat.js';
import { createMissions, createBeacon } from './missions.js';
import { mulberry32 } from './random.js';
import { ACT_ENTER, ACT_PUNCH, ACT_RELOAD } from './input.js';

export const EVENT_NONE = 0;
export const EVENT_MISSION_DONE = 1;
export const EVENT_MISSION_FAILED = 2;
export const EVENT_BUSTED = 4;
export const EVENT_WASTED = 8;
export const EVENT_ALL_DONE = 16;

const PLAYER_SPAWN = new THREE.Vector3(29, 0, 44);

function makePlayerMesh() {
  const group = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0xd84040, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.35), jacket);
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xe8b88a, roughness: 0.8 }),
  );
  head.position.y = 1.72;
  head.castShadow = true;
  group.add(head);
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.27, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.9 }),
  );
  hair.position.y = 1.76;
  group.add(hair);
  const legs = [];
  for (const x of [-0.15, 0.15]) {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.65, 0.22),
      new THREE.MeshStandardMaterial({ color: 0x2a3a4a, roughness: 0.9 }),
    );
    leg.position.set(x, 0.32, 0);
    group.add(leg);
    legs.push(leg);
  }
  const arm = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.6, 0.16),
    new THREE.MeshStandardMaterial({ color: 0xd84040, roughness: 0.8 }),
  );
  arm.position.set(0.4, 1.2, 0.15);
  group.add(arm);
  // The pistol, held out when aiming.
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.14, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.4, metalness: 0.6 }),
  );
  gun.position.set(0.4, 1.05, 0.45);
  group.add(gun);
  group.userData.legs = legs;
  group.userData.gun = gun;
  return group;
}

export function createWorld(scene, seed) {
  const rng = mulberry32(seed);
  const city = createCity(scene, rng);
  const particles = createParticles(scene);
  const traffic = createTraffic(scene, city, rng);
  const pedestrians = createPedestrians(scene, city, rng);
  const audio = null; // set by main.js via world.attachAudio
  const police = createPolice(scene, city, rng, audio);
  const enemies = createEnemies(scene, rng, particles);
  const missions = createMissions(city);
  const beacon = createBeacon(scene);
  const playerCar = createPlayerCar(scene, city);

  const playerMesh = makePlayerMesh();
  scene.add(playerMesh);

  const state = {
    cash: ECONOMY.startCash,
    health: PLAYER.health,
    inCar: false,
    heading: 0, // where the player (or car) faces
    cameraYaw: 0,
    cameraPitch: 0.05, // aim pitch in radians: mouse up/down
    pos: PLAYER_SPAWN.clone(),
    velY: 0,
    grounded: true,
    ammo: COMBAT.pistolMag,
    fireTimer: 0,
    reloadTimer: 0,
    punchTimer: 0,
    invulnerable: 0,
    elapsed: 0,
    kills: 0,
    carsStolen: 0,
    busted: false,
    wasted: false,
    walkPhase: 0,
    gunshotPos: null,
    gunshotTimer: 0,
  };

  let audioRef = null;
  let onEvent = null;

  function attachAudio(a) { audioRef = a; }
  function onWorldEvent(fn) { onEvent = fn; }
  function emit(event, data) { if (onEvent) onEvent(event, data); }

  function reset(full = true) {
    state.pos.copy(PLAYER_SPAWN);
    state.heading = 0;
    state.cameraYaw = Math.PI;
    state.health = PLAYER.health;
    state.ammo = COMBAT.pistolMag;
    state.fireTimer = 0;
    state.reloadTimer = 0;
    state.punchTimer = 0;
    state.invulnerable = 0;
    state.velY = 0;
    state.busted = false;
    state.wasted = false;
    state.kills = 0;
    state.carsStolen = 0;
    state.elapsed = 0;
    if (full) {
      state.cash = ECONOMY.startCash;
      missions.load(0);
    }
    if (state.inCar) exitCar();
    playerCar.exit();
    police.clear();
    enemies.clear();
    beacon.hide();
    playerMesh.visible = true;
  }

  function playerPos() {
    return state.inCar ? playerCar.pos : state.pos;
  }

  function setHeat(n) {
    police.setStars(n, playerPos());
  }

  function enterCar(trafficCar) {
    state.inCar = true;
    playerCar.setColor(trafficCar.color);
    playerCar.enter(trafficCar.pos, trafficCar.heading);
    traffic.removeCar(trafficCar);
    playerMesh.visible = false;
    state.carsStolen += 1;
    police.addHeat(ECONOMY.stealHeat, playerPos());
    if (audioRef) audioRef.pickup();
    emit('steal', { car: trafficCar });
  }

  function exitCar() {
    if (!state.inCar) return;
    state.inCar = false;
    const h = playerCar.heading;
    state.pos.set(
      playerCar.pos.x + Math.cos(h) * 2.2,
      0,
      playerCar.pos.z - Math.sin(h) * 2.2,
    );
    city.collideCircle(state.pos, PLAYER.radius);
    state.heading = h;
    state.cameraYaw = h;
    playerCar.exit();
    playerMesh.visible = true;
  }

  function shoot(camera) {
    if (state.reloadTimer > 0 || state.fireTimer > 0) return;
    if (state.ammo <= 0) {
      state.reloadTimer = COMBAT.reloadMs / 1000;
      if (audioRef) audioRef.click();
      return;
    }
    state.fireTimer = COMBAT.pistolFireMs / 1000;
    state.ammo -= 1;
    if (audioRef) audioRef.gunshot();
    // The shot goes where the crosshair points: from the camera, through the
    // centre of the screen — not from the player's chest along the camera's
    // downward tilt, which would pass under anything close.
    const origin = new THREE.Vector3();
    camera.getWorldPosition(origin);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const hit = enemies.raycast(origin, dir);
    const muzzle = new THREE.Vector3(state.pos.x, 1.3, state.pos.z).addScaledVector(dir, 1.2);
    particles.burst(muzzle, 0xffd98a, 6, 5);
    state.gunshotPos = state.pos.clone();
    state.gunshotTimer = 1.2;
    if (hit) {
      const killed = enemies.damage(hit, COMBAT.pistolDamage);
      particles.burst(new THREE.Vector3(hit.pos.x, 1.3, hit.pos.z), 0xe2483d, 10, 6);
      if (killed) {
        state.kills += 1;
        missions.onKill();
        police.addHeat(ECONOMY.killHeat, playerPos());
        emit('kill', { enemy: hit });
      }
    } else {
      // A missed shot still draws heat when the police are near.
      if (police.stars > 0 || police.nearestDistance(state.pos) < 40) {
        police.addHeat(ECONOMY.shootHeat, playerPos());
      }
    }
  }

  function punch() {
    if (state.punchTimer > 0 || state.inCar) return;
    state.punchTimer = COMBAT.punchMs / 1000;
    if (audioRef) audioRef.punch();
    const forward = new THREE.Vector3(Math.sin(state.heading), 0, Math.cos(state.heading));
    for (const enemy of enemies.list) {
      if (!enemy.alive) continue;
      const to = new THREE.Vector3().subVectors(enemy.pos, state.pos);
      const dist = to.length();
      if (dist < COMBAT.punchRange && to.normalize().dot(forward) > 0.3) {
        const killed = enemies.damage(enemy, COMBAT.punchDamage);
        particles.burst(new THREE.Vector3(enemy.pos.x, 1.2, enemy.pos.z), 0xfff2b0, 8, 5);
        if (killed) {
          state.kills += 1;
          missions.onKill();
          emit('kill', { enemy });
        }
      }
    }
  }

  function damagePlayer(amount) {
    if (state.invulnerable > 0) return;
    state.health -= amount;
    state.invulnerable = 0.4;
    emit('hurt', { amount });
    if (state.health <= 0) {
      state.health = 0;
      state.wasted = true;
      emit('wasted', {});
    }
  }

  function bust() {
    state.busted = true;
    const fine = Math.min(state.cash, ECONOMY.bustFine);
    state.cash -= fine;
    if (state.inCar) exitCar();
    state.pos.copy(PLAYER_SPAWN);
    state.health = PLAYER.health;
    police.clear();
    emit('busted', { fine });
  }

  function startMission() {
    if (missions.active || missions.done) return null;
    const active = missions.startMission(missions.index);
    if (!active) return null;
    emit('mission-start', { mission: active.mission });
    return active;
  }

  function save() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: state.cash,
        completed: missions.completed,
        pos: [state.pos.x, state.pos.z],
        health: state.health,
        kills: state.kills,
        carsStolen: state.carsStolen,
      }));
      return true;
    } catch {
      return false;
    }
  }

  function load() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (typeof data.cash !== 'number') return false;
      state.cash = data.cash;
      missions.load(data.completed || 0);
      if (Array.isArray(data.pos)) {
        state.pos.set(data.pos[0], 0, data.pos[1]);
        city.collideCircle(state.pos, PLAYER.radius);
      }
      state.health = data.health || PLAYER.health;
      state.kills = data.kills || 0;
      state.carsStolen = data.carsStolen || 0;
      return true;
    } catch {
      return false;
    }
  }

  /** One fixed step. `live` false means the backdrop is running (title screen):
   * traffic and pedestrians move, but the player cannot act. */
  function step(dt, input, camera, live = true) {
    state.elapsed += dt;
    if (state.invulnerable > 0) state.invulnerable -= dt;
    if (state.fireTimer > 0) state.fireTimer -= dt;
    if (state.punchTimer > 0) state.punchTimer -= dt;
    if (state.gunshotTimer > 0) {
      state.gunshotTimer -= dt;
      if (state.gunshotTimer <= 0) state.gunshotPos = null;
    }
    if (state.reloadTimer > 0) {
      state.reloadTimer -= dt;
      if (state.reloadTimer <= 0) state.ammo = COMBAT.pistolMag;
    }

    const mouse = input.takeMouse();
    state.cameraYaw -= mouse.dx * 0.0032;
    // Mouse up/down pitches the aim: up looks up, down looks down.
    state.cameraPitch = Math.max(-0.45, Math.min(0.6, state.cameraPitch - mouse.dy * 0.0022));

    const actions = input.takeActions();

    // --- The player (only when the game is live) ---
    if (live && state.inCar) {
      playerCar.update(dt, input, (strength) => {
        if (audioRef) audioRef.crash(strength);
        damagePlayer(strength * 14);
        particles.burst(playerCar.pos.clone().setY(1), 0xffa040, 10, 6);
      });
      state.heading = playerCar.heading;
      if (actions & ACT_ENTER) exitCar(); // get out of the car
      // Hitting a pedestrian at speed is a crime.
      const ped = pedestrians.nearest(playerCar.pos, 2.4);
      if (ped && Math.abs(playerCar.speed) > 4) {
        ped.pos.x += Math.sin(playerCar.heading) * 6;
        ped.pos.z += Math.cos(playerCar.heading) * 6;
        police.addHeat(1, playerPos());
      }
    } else if (live) {
      const move = input.move();
      const speed = input.running() ? PLAYER.runSpeed : PLAYER.walkSpeed;
      const sin = Math.sin(state.cameraYaw);
      const cos = Math.cos(state.cameraYaw);
      let mx = 0;
      let mz = 0;
      if (move.forward !== 0 || move.strafe !== 0) {
        mx = sin * move.forward + cos * move.strafe;
        mz = cos * move.forward - sin * move.strafe;
        const len = Math.hypot(mx, mz);
        mx /= len; mz /= len;
        state.pos.x += mx * speed * dt;
        state.pos.z += mz * speed * dt;
        state.heading = Math.atan2(mx, mz);
        state.walkPhase += dt * speed * 1.6;
      }
      city.collideCircle(state.pos, PLAYER.radius);
      // Jump.
      if (input.jumpHeld() && state.grounded) {
        state.velY = PLAYER.jumpSpeed;
        state.grounded = false;
      }
      if (!state.grounded) {
        state.velY -= 22 * dt;
        state.pos.y += state.velY * dt;
        if (state.pos.y <= 0) {
          state.pos.y = 0;
          state.velY = 0;
          state.grounded = true;
        }
      }
      playerMesh.position.copy(state.pos);
      playerMesh.rotation.y = state.heading;
      const swing = Math.sin(state.walkPhase) * (move.forward !== 0 || move.strafe !== 0 ? 0.5 : 0);
      playerMesh.userData.legs[0].rotation.x = swing;
      playerMesh.userData.legs[1].rotation.x = -swing;
      playerMesh.userData.gun.visible = input.firing();
      // While firing, the player turns to face where they are aiming.
      if (input.firing()) state.heading = state.cameraYaw;

      // Enter a car, or start the next job at the safehouse marker.
      if (actions & ACT_ENTER) {
        const near = traffic.nearestCar(state.pos, 4.5);
        if (near) enterCar(near.car);
        else if (missions.active === null && !missions.done) {
          const sh = city.landmarks.safehouse;
          if (Math.hypot(state.pos.x - sh.x, state.pos.z - sh.z) < 9) startMission();
        }
      }
      // Combat on foot.
      if (input.firing()) shoot(camera);
      if (actions & ACT_PUNCH) punch();
      if (actions & ACT_RELOAD) {
        if (state.ammo < COMBAT.pistolMag && state.reloadTimer <= 0) {
          state.reloadTimer = COMBAT.reloadMs / 1000;
        }
      }
    }

    // --- The city around the player ---
    const playerSpeed = state.inCar ? Math.abs(playerCar.speed) : 0;
    traffic.update(dt, playerPos(), state.inCar ? playerCar : null);
    pedestrians.update(dt, playerPos(), playerSpeed, state.gunshotPos);
    enemies.update(dt, playerPos(), (hitChance, fromPos) => {
      if (Math.random() < hitChance) {
        damagePlayer(8);
        particles.burst(new THREE.Vector3(state.pos.x, 1.4, state.pos.z), 0xe2483d, 5, 4);
      }
      if (audioRef) audioRef.gunshot();
    });

    const bustResult = police.update(dt, playerPos(), state.inCar, state.inCar ? playerCar : null, (dmg) => {
      damagePlayer(dmg);
      if (audioRef) audioRef.crash(0.5);
    });
    if (bustResult === 'busted') bust();

    // --- Missions ---
    const missionEvent = missions.update(dt, {
      playerPos: playerPos(),
      inCar: state.inCar,
      setHeat: (n) => setHeat(n),
    });
    if (missionEvent) {
      if (missionEvent.type === 'done') {
        state.cash += missionEvent.mission.reward;
        if (audioRef) audioRef.jingle();
        save();
        emit('mission-done', { mission: missionEvent.mission });
        if (missions.done) {
          emit('all-done', {});
          return EVENT_ALL_DONE | EVENT_MISSION_DONE;
        }
        return EVENT_MISSION_DONE;
      }
      if (missionEvent.type === 'failed') {
        if (audioRef) audioRef.fail();
        enemies.clear();
        emit('mission-failed', { mission: missionEvent.mission, reason: missionEvent.reason });
        return EVENT_MISSION_FAILED;
      }
      if (missionEvent.type === 'step') {
        emit('mission-step', { mission: missionEvent.mission });
      }
    }

    // Mission beacon and enemy spawns for the defeat step.
    const step = missions.currentStep();
    if (missions.active && step) {
      const target = missions.markerPos(step);
      if (target) beacon.show(target);
      else beacon.hide();
      if (step.kind === 'defeat' && enemies.aliveCount() === 0 && missions.defeatLeft() > 0) {
        const plaza = city.landmarks.plaza;
        enemies.spawn(plaza, missions.defeatLeft());
        emit('enemies', { count: missions.defeatLeft() });
      }
    } else if (!missions.active && !missions.done) {
      // Idle: the next mission waits at the safehouse marker.
      beacon.show(city.landmarks.safehouse);
    } else {
      beacon.hide();
    }
    beacon.update(dt, state.elapsed);
    particles.update(dt);

    // --- Audio that follows the game ---
    if (audioRef) {
      audioRef.setEngine(state.inCar ? Math.abs(playerCar.speed) / CAR.maxSpeed : 0, state.inCar);
      audioRef.setSiren(police.sirenOn, police.nearestDistance(playerPos()));
    }

    if (state.busted) return EVENT_BUSTED;
    if (state.wasted) return EVENT_WASTED;
    return EVENT_NONE;
  }

  return {
    state, city, traffic, pedestrians, police, enemies, missions, playerCar,
    particles, beacon, playerMesh,
    get heading() { return state.heading; },
    get playerPos() { return playerPos(); },
    get missionMarker() {
      if (missions.active) {
        const step = missions.currentStep();
        return step ? missions.markerPos(step) : null;
      }
      return missions.done ? null : city.landmarks.safehouse;
    },
    attachAudio, onWorldEvent, reset, step, save, load, startMission,
    enterCar, exitCar, bust, damagePlayer, setHeat,
  };
}
