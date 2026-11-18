// The Solmar PD: a wanted level in stars, police cruisers that chase and ram the
// player's car, and foot cops who run the player down and bust them. Wanted heat
// rises when the player steals, shoots or kills, and cools off when they stay out
// of sight — the classic crime-game loop.
import * as THREE from 'three';
import { CITY, WANTED } from './config.js';
import { makeCarMesh } from './vehicles.js';
import { range } from './random.js';

function makeCopMesh() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.85, 0.32),
    new THREE.MeshStandardMaterial({ color: 0x1c2a44, roughness: 0.85 }),
  );
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xe8b88a, roughness: 0.8 }),
  );
  head.position.y = 1.68;
  group.add(head);
  const hat = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.28, 0.1, 10),
    new THREE.MeshStandardMaterial({ color: 0x101828, roughness: 0.6 }),
  );
  hat.position.y = 1.88;
  group.add(hat);
  for (const x of [-0.14, 0.14]) {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.6, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.9 }),
    );
    leg.position.set(x, 0.3, 0);
    group.add(leg);
  }
  group.userData.legs = group.children.filter((c) => c.position.y === 0.3);
  return group;
}

export function createPolice(scene, city, rng, audio) {
  let stars = 0;
  let unseenTimer = 0;
  let bustTimer = 0;
  let sirenOn = false;
  const cruisers = [];
  const cops = [];

  function spawnCruiser(playerPos) {
    const mesh = makeCarMesh(0x1c2a44, true);
    scene.add(mesh);
    // Spawn on a road some distance from the player, in front of them.
    const angle = range(rng, 0, Math.PI * 2);
    const pos = new THREE.Vector3(
      playerPos.x + Math.cos(angle) * 55,
      0,
      playerPos.z + Math.sin(angle) * 55,
    );
    pos.x = Math.max(-CITY.extent, Math.min(CITY.extent, pos.x));
    pos.z = Math.max(-CITY.extent, Math.min(CITY.extent, pos.z));
    cruisers.push({ mesh, pos, heading: 0, speed: 0, flash: rng(), ramTimer: 0 });
    mesh.position.copy(pos);
  }

  function spawnCop(playerPos) {
    const mesh = makeCopMesh();
    scene.add(mesh);
    const angle = range(rng, 0, Math.PI * 2);
    const pos = new THREE.Vector3(
      playerPos.x + Math.cos(angle) * 22,
      0,
      playerPos.z + Math.sin(angle) * 22,
    );
    city.collideCircle(pos, 0.5);
    cops.push({ mesh, pos, heading: 0, walkPhase: rng() * 6 });
    mesh.position.copy(pos);
  }

  function setStars(n, playerPos) {
    stars = Math.max(0, Math.min(WANTED.maxStars, n));
    unseenTimer = 0;
    bustTimer = 0;
    const wantCars = stars === 0 ? 0 : WANTED.policeCars[stars];
    const wantCops = stars === 0 ? 0 : WANTED.footCops[stars];
    while (cruisers.length < wantCars) spawnCruiser(playerPos);
    while (cruisers.length > wantCars) {
      const c = cruisers.pop();
      scene.remove(c.mesh);
    }
    while (cops.length < wantCops) spawnCop(playerPos);
    while (cops.length > wantCops) {
      const c = cops.pop();
      scene.remove(c.mesh);
    }
  }

  function addHeat(n, playerPos) {
    if (stars < WANTED.maxStars) setStars(stars + n, playerPos);
    else unseenTimer = 0;
  }

  function clear() {
    setStars(0, new THREE.Vector3());
  }

  /** Chase the player; returns 'busted' when a cop holds the player, else null. */
  function update(dt, playerPos, inCar, playerCar, onRam) {
    if (stars === 0) {
      sirenOn = false;
      return null;
    }
    sirenOn = true;
    // Wanted cools off if the player is far from every unit.
    let nearest = Infinity;
    for (const c of cruisers) nearest = Math.min(nearest, c.pos.distanceTo(playerPos));
    for (const c of cops) nearest = Math.min(nearest, c.pos.distanceTo(playerPos));
    if (nearest > 70) {
      unseenTimer += dt;
      if (unseenTimer > WANTED.decayDelay) setStars(stars - 1, playerPos);
    } else {
      unseenTimer = 0;
    }

    for (const cruiser of cruisers) {
      const dx = playerPos.x - cruiser.pos.x;
      const dz = playerPos.z - cruiser.pos.z;
      const dist = Math.hypot(dx, dz);
      const wantHeading = Math.atan2(dx, dz);
      let diff = wantHeading - cruiser.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      cruiser.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
      const targetSpeed = dist > 60 ? 42 : dist > 14 ? 38 : 26;
      cruiser.speed += Math.sign(targetSpeed - cruiser.speed) * Math.min(Math.abs(targetSpeed - cruiser.speed), 16 * dt);
      cruiser.pos.x += Math.sin(cruiser.heading) * cruiser.speed * dt;
      cruiser.pos.z += Math.cos(cruiser.heading) * cruiser.speed * dt;
      city.collideCircle(cruiser.pos, 1.6);
      cruiser.mesh.position.copy(cruiser.pos);
      cruiser.mesh.rotation.y = cruiser.heading;
      cruiser.flash += dt * 6;
      const on = Math.floor(cruiser.flash) % 2 === 0;
      if (cruiser.mesh.userData.flashers) {
        cruiser.mesh.userData.flashers[0].material.emissiveIntensity = on ? 2.5 : 0.2;
        cruiser.mesh.userData.flashers[1].material.emissiveIntensity = on ? 0.2 : 2.5;
      }
      // Ram the player's car — but only once a moment, and never wedged inside it:
      // the cruiser bounces off and backs away, so the player can always escape.
      if (cruiser.ramTimer > 0) cruiser.ramTimer -= dt;
      if (inCar && playerCar && dist < 4.6 && cruiser.ramTimer <= 0 && cruiser.speed > 5) {
        onRam(WANTED.ramDamage);
        cruiser.ramTimer = 1.5;
        cruiser.speed = -8;
        playerCar.speed *= 0.7;
      }
      if (inCar && playerCar && dist < 4.2 && dist > 0.01) {
        // Separation: keep the cruiser out of the player's bodywork.
        const push = (4.2 - dist);
        cruiser.pos.x += (dx / dist) * -push;
        cruiser.pos.z += (dz / dist) * -push;
      }
      // A cruiser that pins the player on foot busts them.
      if (!inCar && dist < 3.2) {
        bustTimer += dt;
        if (bustTimer > WANTED.bustSeconds) return 'busted';
      }
    }

    let nearCop = false;
    for (const cop of cops) {
      const dx = playerPos.x - cop.pos.x;
      const dz = playerPos.z - cop.pos.z;
      const dist = Math.hypot(dx, dz);
      const heading = Math.atan2(dx, dz);
      cop.heading = heading;
      const speed = dist < 1.2 ? 0 : 7.2;
      cop.pos.x += Math.sin(heading) * speed * dt;
      cop.pos.z += Math.cos(heading) * speed * dt;
      city.collideCircle(cop.pos, 0.5);
      cop.walkPhase += dt * 10;
      cop.mesh.position.copy(cop.pos);
      cop.mesh.rotation.y = heading;
      const swing = Math.sin(cop.walkPhase) * 0.5;
      cop.mesh.userData.legs[0].rotation.x = swing;
      cop.mesh.userData.legs[1].rotation.x = -swing;
      if (dist < 1.8) nearCop = true;
    }
    if (!inCar && nearCop) {
      bustTimer += dt;
      if (bustTimer > WANTED.bustSeconds) return 'busted';
    } else if (cruisers.every((c) => c.pos.distanceTo(playerPos) > 3.2)) {
      bustTimer = Math.max(0, bustTimer - dt * 2);
    }
    return null;
  }

  function nearestDistance(playerPos) {
    let best = Infinity;
    for (const c of cruisers) best = Math.min(best, c.pos.distanceTo(playerPos));
    for (const c of cops) best = Math.min(best, c.pos.distanceTo(playerPos));
    return best;
  }

  return {
    get stars() { return stars; },
    get sirenOn() { return sirenOn; },
    get cruisers() { return cruisers; },
    get cops() { return cops; },
    setStars, addHeat, clear, update, nearestDistance,
  };
}
