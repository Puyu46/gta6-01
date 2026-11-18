// Combat: the player's pistol and fists, the rival crew members a mission spawns,
// and the shared particle pool (muzzle flashes, sparks, smoke, pickup sparkles).
// Hits are raycasts against enemy bounding spheres — no physics library needed.
import * as THREE from 'three';
import { COMBAT } from './config.js';
import { pick, range } from './random.js';

export function createParticles(scene, count = 90) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({ size: 0.5, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  const parts = [];
  for (let i = 0; i < count; i += 1) parts.push({ life: 0, vx: 0, vy: 0, vz: 0 });

  function burst(pos, color, n, speed, up = 2) {
    let placed = 0;
    const c = new THREE.Color(color);
    for (let i = 0; i < count && placed < n; i += 1) {
      const p = parts[i];
      if (p.life > 0) continue;
      p.life = range(Math.random, 0.3, 0.7);
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI - Math.PI / 2;
      p.vx = Math.cos(a) * Math.cos(b) * speed;
      p.vy = Math.abs(Math.sin(b)) * speed + up;
      p.vz = Math.sin(a) * Math.cos(b) * speed;
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
      placed += 1;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }

  function update(dt) {
    let any = false;
    for (let i = 0; i < count; i += 1) {
      const p = parts[i];
      if (p.life <= 0) continue;
      any = true;
      p.life -= dt;
      positions[i * 3] += p.vx * dt;
      positions[i * 3 + 1] += p.vy * dt;
      positions[i * 3 + 2] += p.vz * dt;
      p.vy -= 6 * dt;
      if (p.life <= 0) positions[i * 3 + 1] = -100;
    }
    if (any) geo.attributes.position.needsUpdate = true;
  }

  return { burst, update };
}

function makeEnemyMesh(rng, color) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.9, 0.35),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 }),
  );
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xc98a5a, roughness: 0.8 }),
  );
  head.position.y = 1.7;
  group.add(head);
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.12, 0.55),
    new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.4, metalness: 0.6 }),
  );
  gun.position.set(0.35, 1.15, 0.3);
  group.add(gun);
  // Health bar above the head; hidden until the rival is hurt.
  const barBg = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.12), new THREE.MeshBasicMaterial({ color: 0x222222 }));
  barBg.position.y = 2.15;
  barBg.visible = false;
  const barFg = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 0.08), new THREE.MeshBasicMaterial({ color: 0xe2483d }));
  barFg.position.set(0, 2.15, 0.01);
  barFg.visible = false;
  group.add(barBg);
  group.add(barFg);
  group.userData.barFg = barFg;
  group.userData.barBg = barBg;
  return group;
}

/** Rival crew members: they chase the player on foot and shoot back. */
export function createEnemies(scene, rng, particles) {
  const list = [];

  function spawn(pos, count, color = 0x6a2a8a) {
    for (let i = 0; i < count; i += 1) {
      const mesh = makeEnemyMesh(rng, color);
      scene.add(mesh);
      const spawnPos = pos.clone();
      spawnPos.x += range(rng, -6, 6);
      spawnPos.z += range(rng, -6, 6);
      list.push({
        mesh, pos: spawnPos, health: COMBAT.enemyHealth,
        shootTimer: range(rng, 0.5, 1.5), alive: true, isCop: false,
      });
      mesh.position.copy(spawnPos);
    }
  }

  function update(dt, playerPos, onEnemyShot) {
    for (const enemy of list) {
      if (!enemy.alive) continue;
      const dx = playerPos.x - enemy.pos.x;
      const dz = playerPos.z - enemy.pos.z;
      const dist = Math.hypot(dx, dz);
      const heading = Math.atan2(dx, dz);
      enemy.mesh.rotation.y = heading;
      enemy.mesh.userData.barFg.lookAt(playerPos.x, 2.15, playerPos.z);
      enemy.mesh.userData.barBg.lookAt(playerPos.x, 2.15, playerPos.z);
      if (dist > 14) {
        enemy.pos.x += Math.sin(heading) * 5.5 * dt;
        enemy.pos.z += Math.cos(heading) * 5.5 * dt;
      } else if (dist < 6) {
        enemy.pos.x -= Math.sin(heading) * 2 * dt;
        enemy.pos.z -= Math.cos(heading) * 2 * dt;
      }
      enemy.mesh.position.copy(enemy.pos);
      enemy.shootTimer -= dt;
      if (enemy.shootTimer <= 0 && dist < 42) {
        enemy.shootTimer = range(rng, 1.1, 2.0);
        const hitChance = dist < 12 ? 0.3 : dist < 25 ? 0.18 : 0.08;
        particles.burst(
          new THREE.Vector3(enemy.pos.x + Math.sin(heading) * 0.6, 1.3, enemy.pos.z + Math.cos(heading) * 0.6),
          0xffd98a, 4, 6,
        );
        onEnemyShot(hitChance, enemy.pos);
      }
    }
  }

  /** Raycast a shot from `origin` along `dir`; returns the enemy hit, if any. */
  function raycast(origin, dir) {
    let best = null;
    let bestT = COMBAT.pistolRange;
    for (const enemy of list) {
      if (!enemy.alive) continue;
      const to = new THREE.Vector3().subVectors(enemy.pos, origin);
      const t = to.dot(dir);
      if (t < 0 || t > bestT) continue;
      const closest = new THREE.Vector3().copy(origin).addScaledVector(dir, t);
      const d = closest.distanceTo(new THREE.Vector3(enemy.pos.x, 1.2, enemy.pos.z));
      if (d < 1.1) { best = enemy; bestT = t; }
    }
    return best;
  }

  function damage(enemy, amount) {
    enemy.health -= amount;
    const scale = Math.max(0, enemy.health / COMBAT.enemyHealth);
    enemy.mesh.userData.barFg.scale.x = scale;
    enemy.mesh.userData.barFg.position.x = -(1 - scale) * 0.53;
    // A full-health rival shows no bar: the bar appears once they are hurt.
    const showBar = enemy.health < COMBAT.enemyHealth;
    enemy.mesh.userData.barFg.visible = showBar;
    enemy.mesh.userData.barBg.visible = showBar;
    if (enemy.health <= 0) {
      enemy.alive = false;
      enemy.mesh.visible = false;
      particles.burst(new THREE.Vector3(enemy.pos.x, 1.2, enemy.pos.z), 0xe2483d, 16, 7);
      return true;
    }
    return false;
  }

  function aliveCount() {
    return list.filter((e) => e.alive).length;
  }

  function clear() {
    for (const enemy of list) scene.remove(enemy.mesh);
    list.length = 0;
  }

  return { list, spawn, update, raycast, damage, aliveCount, clear };
}
