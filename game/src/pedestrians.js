// Pedestrians: Solmar locals strolling the sidewalks. They pick a road, walk along
// it, turn at intersections, and scatter (with a scream of panic in the code's
// sense: they run) when a car comes at them or a gun goes off nearby.
import * as THREE from 'three';
import { CITY, PEDS } from './config.js';
import { pick, range } from './random.js';

const SHIRTS = [0xe8e4da, 0xd84040, 0x3a6fd8, 0x38b24a, 0xf2c230, 0x8a4fd0, 0xe07830, 0x22242a];
const PANTS = [0x2a3a4a, 0x4a3a2a, 0x222222, 0x5a6a7a];

function makePedMesh(rng) {
  const group = new THREE.Group();
  const shirt = pick(rng, SHIRTS);
  const pants = pick(rng, PANTS);
  const skin = pick(rng, [0xe8b88a, 0xc98a5a, 0x8a5a3a, 0xf0c8a0]);
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.85, 0.32),
    new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 }),
  );
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 10, 8),
    new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 }),
  );
  head.position.y = 1.68;
  head.castShadow = true;
  group.add(head);
  for (const x of [-0.14, 0.14]) {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.6, 0.2),
      new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 }),
    );
    leg.position.set(x, 0.3, 0);
    group.add(leg);
  }
  group.userData.legs = group.children.filter((c) => c.position.y === 0.3);
  return group;
}

export function createPedestrians(scene, city, rng) {
  const roads = city.roadLines;
  const peds = [];

  function randomSpot() {
    const at = pick(rng, roads);
    const along = range(rng, -CITY.extent, CITY.extent);
    const side = rng() < 0.5 ? -1 : 1;
    if (rng() < 0.5) return new THREE.Vector3(at + side * (CITY.roadHalf + 2.5), 0, along);
    return new THREE.Vector3(along, 0, at + side * (CITY.roadHalf + 2.5));
  }

  function spawn() {
    const mesh = makePedMesh(rng);
    scene.add(mesh);
    const pos = randomSpot();
    const ped = {
      mesh, pos, heading: range(rng, 0, Math.PI * 2),
      speed: range(rng, PEDS.speedMin, PEDS.speedMax),
      panic: 0, walkPhase: rng() * Math.PI * 2,
    };
    mesh.position.copy(pos);
    return ped;
  }

  for (let i = 0; i < PEDS.count; i += 1) peds.push(spawn());

  function update(dt, playerPos, playerSpeed, gunshotPos) {
    for (const ped of peds) {
      // Panic: run away from a fast car or a gunshot.
      let flee = null;
      if (gunshotPos && ped.pos.distanceTo(gunshotPos) < 18) flee = gunshotPos;
      else if (playerPos && playerSpeed > 8 && ped.pos.distanceTo(playerPos) < 10) flee = playerPos;
      if (flee) {
        ped.panic = 2.5;
        ped.heading = Math.atan2(ped.pos.x - flee.x, ped.pos.z - flee.z);
      }
      if (ped.panic > 0) {
        ped.panic -= dt;
        ped.pos.x += Math.sin(ped.heading) * 4.5 * dt;
        ped.pos.z += Math.cos(ped.heading) * 4.5 * dt;
      } else {
        ped.pos.x += Math.sin(ped.heading) * ped.speed * dt;
        ped.pos.z += Math.cos(ped.heading) * ped.speed * dt;
        // Turn at intersections so they stay on the sidewalks.
        const nearX = roads.some((r) => Math.abs(ped.pos.x - r - (CITY.roadHalf + 2.5)) < 0.6 || Math.abs(ped.pos.x - r + (CITY.roadHalf + 2.5)) < 0.6);
        const nearZ = roads.some((r) => Math.abs(ped.pos.z - r - (CITY.roadHalf + 2.5)) < 0.6 || Math.abs(ped.pos.z - r + (CITY.roadHalf + 2.5)) < 0.6);
        if ((nearX || nearZ) && rng() < dt * 0.8) {
          ped.heading += pick(rng, [-Math.PI / 2, Math.PI / 2, Math.PI]);
        }
        if (Math.abs(ped.pos.x) > CITY.extent + 8 || Math.abs(ped.pos.z) > CITY.extent + 8) {
          ped.pos.copy(randomSpot());
        }
      }
      city.collideCircle(ped.pos, 0.4);
      ped.walkPhase += dt * (ped.panic > 0 ? 11 : 6);
      ped.mesh.position.copy(ped.pos);
      ped.mesh.rotation.y = ped.heading;
      const swing = Math.sin(ped.walkPhase) * 0.45;
      ped.mesh.userData.legs[0].rotation.x = swing;
      ped.mesh.userData.legs[1].rotation.x = -swing;
    }
  }

  /** The nearest pedestrian to `pos` within `maxDist`, or null. */
  function nearest(pos, maxDist) {
    let best = null;
    let bestDist = maxDist;
    for (const ped of peds) {
      const d = Math.hypot(ped.pos.x - pos.x, ped.pos.z - pos.z);
      if (d < bestDist) { bestDist = d; best = ped; }
    }
    return best;
  }

  return { peds, update, nearest };
}
