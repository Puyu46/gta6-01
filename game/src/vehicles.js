// Cars: the meshes, the traffic that drives them, and the arcade driving model the
// player uses. A car is a body box, a cabin box, four cylinder wheels and two
// headlight discs — cheap enough to have twenty on screen at once.
import * as THREE from 'three';
import { CAR, CITY, PALETTE, TRAFFIC } from './config.js';
import { chance, pick, range } from './random.js';

const CAR_LENGTH = 4.4;
const CAR_WIDTH = 2.0;

export function makeCarMesh(color, isPolice = false, isTaxi = false) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(CAR_WIDTH, 0.75, CAR_LENGTH), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(CAR_WIDTH - 0.3, 0.6, CAR_LENGTH * 0.45),
    new THREE.MeshStandardMaterial({ color: 0x1a2733, roughness: 0.2, metalness: 0.7 }),
  );
  cabin.position.set(0, 1.2, -0.2);
  cabin.castShadow = true;
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.9 });
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.38, z);
    group.add(wheel);
    wheels.push(wheel);
  }
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffe9a0, emissiveIntensity: 1.2 });
  for (const x of [-0.6, 0.6]) {
    const light = new THREE.Mesh(new THREE.CircleGeometry(0.18, 10), lightMat);
    light.position.set(x, 0.6, CAR_LENGTH / 2 + 0.01);
    group.add(light);
  }
  if (isPolice) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.18, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4 }),
    );
    bar.position.set(0, 1.62, -0.2);
    group.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.5), new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff2020, emissiveIntensity: 2 }));
    red.position.set(-0.28, 1.62, -0.2);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.5), new THREE.MeshStandardMaterial({ color: 0x2040ff, emissive: 0x2040ff, emissiveIntensity: 2 }));
    blue.position.set(0.28, 1.62, -0.2);
    group.add(blue);
    group.userData.flashers = [red, blue];
  }
  if (isTaxi) {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.25, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xf2c230, emissive: 0xf2c230, emissiveIntensity: 0.8 }),
    );
    sign.position.set(0, 1.62, -0.2);
    group.add(sign);
  }
  group.userData.wheels = wheels;
  return group;
}

/** The player's car: arcade physics — speed, steering, drift, damage, skid marks. */
export function createPlayerCar(scene, city) {
  const mesh = makeCarMesh(0xd84040);
  scene.add(mesh);
  const skidGeo = new THREE.PlaneGeometry(0.35, 1.4);
  const skidMat = new THREE.MeshBasicMaterial({ color: 0x141414, transparent: true, opacity: 0.55 });
  const skids = [];
  for (let i = 0; i < 120; i += 1) {
    const skid = new THREE.Mesh(skidGeo, skidMat);
    skid.rotation.x = -Math.PI / 2;
    skid.visible = false;
    scene.add(skid);
    skids.push(skid);
  }
  let skidIndex = 0;
  let skidTimer = 0;

  const car = {
    mesh, active: false, speed: 0, heading: 0, health: CAR.health,
    pos: new THREE.Vector3(0, 0, 0),
    setColor(color) {
      mesh.children[0].material.color.setHex(color);
    },
    enter(pos, heading) {
      car.pos.copy(pos);
      car.heading = heading;
      car.speed = 0;
      car.health = CAR.health;
      car.active = true;
      mesh.visible = true;
    },
    exit() { car.active = false; mesh.visible = false; },
    update(dt, input, onCrash) {
      if (!car.active) return;
      const move = input.move();
      const forward = move.forward;
      const steer = move.strafe;
      const drifting = input.jumpHeld();
      const accel = forward > 0 ? CAR.accel : forward < 0 ? CAR.reverseAccel : 0;
      const target = forward > 0 ? CAR.maxSpeed : forward < 0 ? -CAR.maxReverse : 0;
      if (forward !== 0) {
        car.speed += Math.sign(target - car.speed) * accel * dt * (drifting ? 0.7 : 1);
        if (forward > 0 && car.speed > CAR.maxSpeed) car.speed = CAR.maxSpeed;
        if (forward < 0 && car.speed < -CAR.maxReverse) car.speed = -CAR.maxReverse;
      } else {
        car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), CAR.brake * 0.6 * dt);
      }
      const speedFactor = Math.min(1, Math.abs(car.speed) / 12);
      car.heading -= steer * CAR.steer * speedFactor * Math.sign(car.speed || 1) * dt * (drifting ? 1.5 : 1);
      const dx = Math.sin(car.heading) * car.speed * dt;
      const dz = Math.cos(car.heading) * car.speed * dt;
      car.pos.x += dx;
      car.pos.z += dz;
      const hitWall = city.collideCircle(car.pos, 1.6);
      if (hitWall && Math.abs(car.speed) > 6) {
        onCrash(Math.abs(car.speed) / CAR.maxSpeed);
        car.speed *= 0.15; // a thud, not a reversal: the car keeps facing where it was going
      } else if (hitWall) {
        car.speed *= 0.4;
      }
      // Skid marks while drifting or hard cornering at speed.
      skidTimer -= dt;
      if ((drifting || Math.abs(steer) > 0.7) && Math.abs(car.speed) > 10 && skidTimer <= 0) {
        skidTimer = 0.05;
        for (const side of [-0.95, 0.95]) {
          const skid = skids[skidIndex % skids.length];
          skidIndex += 1;
          const back = -1.4; // rear wheels trail the car's centre by this much
          skid.position.x = car.pos.x + Math.cos(car.heading) * side + Math.sin(car.heading) * back;
          skid.position.y = 0.1;
          skid.position.z = car.pos.z - Math.sin(car.heading) * side + Math.cos(car.heading) * back;
          skid.rotation.z = -car.heading;
          skid.visible = true;
        }
      }
      mesh.position.set(car.pos.x, 0, car.pos.z);
      mesh.rotation.y = car.heading;
      const wheelSpin = (car.speed * dt) / 0.38;
      for (const wheel of mesh.userData.wheels) wheel.rotation.x += wheelSpin;
      mesh.userData.wheels[0].rotation.y = steer * 0.35;
      mesh.userData.wheels[1].rotation.y = steer * 0.35;
    },
  };
  mesh.visible = false;
  return car;
}

/** Traffic: cars that follow the road grid, turn at intersections and slow for the car ahead. */
export function createTraffic(scene, city, rng) {
  const cars = [];
  const roads = city.roadLines;

  function randomRoadSpot(minPlayerDist, playerPos) {
    for (let tries = 0; tries < 40; tries += 1) {
      const axis = rng() < 0.5 ? 'x' : 'z';
      const at = pick(rng, roads);
      const along = range(rng, -CITY.extent, CITY.extent);
      const pos = axis === 'x'
        ? new THREE.Vector3(at + (rng() < 0.5 ? -3.5 : 3.5), 0, along)
        : new THREE.Vector3(along, 0, at + (rng() < 0.5 ? -3.5 : 3.5));
      if (playerPos && pos.distanceTo(playerPos) < minPlayerDist) continue;
      return { pos, axis, at };
    }
    return { pos: new THREE.Vector3(roads[0], 0, -100), axis: 'x', at: roads[0] };
  }

  function spawnCar(playerPos) {
    const spot = randomRoadSpot(30, playerPos);
    const isTaxi = chance(rng, 0.18);
    const color = isTaxi ? PALETTE.taxi : pick(rng, PALETTE.car);
    const mesh = makeCarMesh(color, false, isTaxi);
    scene.add(mesh);
    const heading = spot.axis === 'x'
      ? (spot.pos.x < spot.at ? Math.PI / 2 : -Math.PI / 2)
      : (spot.pos.z < spot.at ? 0 : Math.PI);
    const car = {
      mesh, pos: spot.pos, axis: spot.axis, at: spot.at, heading,
      speed: range(rng, TRAFFIC.speedMin, TRAFFIC.speedMax),
      cruise: 0, color, isTaxi, driver: true,
    };
    car.cruise = car.speed;
    mesh.position.copy(car.pos);
    mesh.rotation.y = car.heading;
    return car;
  }

  for (let i = 0; i < TRAFFIC.count; i += 1) cars.push(spawnCar(null));

  function nearestAhead(car) {
    let best = Infinity;
    for (const other of cars) {
      if (other === car) continue;
      const dx = other.pos.x - car.pos.x;
      const dz = other.pos.z - car.pos.z;
      const forward = car.axis === 'x' ? dz * Math.cos(car.heading) + dx * Math.sin(car.heading) : 0;
      const fwd = Math.sin(car.heading) * dx + Math.cos(car.heading) * dz;
      const side = Math.abs(Math.cos(car.heading) * dx - Math.sin(car.heading) * dz);
      if (fwd > 0 && fwd < best && side < 2.2) best = fwd;
    }
    return best;
  }

  function update(dt, playerPos, playerCar) {
    for (const car of cars) {
      // Slow down for the car ahead, and for the player's car.
      let want = car.cruise;
      const gap = nearestAhead(car);
      if (gap < 12) want = Math.min(want, Math.max(0, (gap - 6) * 0.8));
      if (playerCar && playerCar.active) {
        const dx = playerCar.pos.x - car.pos.x;
        const dz = playerCar.pos.z - car.pos.z;
        const fwd = Math.sin(car.heading) * dx + Math.cos(car.heading) * dz;
        const side = Math.abs(Math.cos(car.heading) * dx - Math.sin(car.heading) * dz);
        if (fwd > 0 && fwd < 10 && side < 2.4) want = 0;
      }
      car.speed += Math.sign(want - car.speed) * Math.min(Math.abs(want - car.speed), 8 * dt);
      car.pos.x += Math.sin(car.heading) * car.speed * dt;
      car.pos.z += Math.cos(car.heading) * car.speed * dt;
      // At an intersection, sometimes turn onto the cross road.
      const onCross = Math.abs(car.pos.x % CITY.pitch) < 1.2 || Math.abs(car.pos.z % CITY.pitch) < 1.2;
      const nearLine = roads.some((r) => Math.abs(car.pos.x - r) < 1.2 || Math.abs(car.pos.z - r) < 1.2);
      if (nearLine && onCross && chance(rng, dt * 0.5)) {
        const turn = pick(rng, [-Math.PI / 2, Math.PI / 2]);
        car.heading += turn;
        // Snap onto the cross road's lane.
        const snap = Math.round(car.pos.x / CITY.pitch) * CITY.pitch;
        const snapZ = Math.round(car.pos.z / CITY.pitch) * CITY.pitch;
        if (Math.abs(car.pos.x - snap) < Math.abs(car.pos.z - snapZ)) car.pos.x = snap + (rng() < 0.5 ? -3.5 : 3.5);
        else car.pos.z = snapZ + (rng() < 0.5 ? -3.5 : 3.5);
      }
      // Wrap around the city edge so traffic never runs out.
      if (car.pos.x > CITY.extent + 10) car.pos.x = -CITY.extent - 10;
      if (car.pos.x < -CITY.extent - 10) car.pos.x = CITY.extent + 10;
      if (car.pos.z > CITY.extent + 10) car.pos.z = -CITY.extent - 10;
      if (car.pos.z < -CITY.extent - 10) car.pos.z = CITY.extent + 10;
      car.mesh.position.copy(car.pos);
      car.mesh.rotation.y = car.heading;
      const spin = (car.speed * dt) / 0.38;
      for (const wheel of car.mesh.userData.wheels) wheel.rotation.x += spin;
    }
  }

  /** The nearest drivable car to `pos` (traffic cars count as stealable). */
  function nearestCar(pos, maxDist) {
    let best = null;
    let bestDist = maxDist;
    for (const car of cars) {
      const d = Math.hypot(car.pos.x - pos.x, car.pos.z - pos.z);
      if (d < bestDist) { bestDist = d; best = car; }
    }
    return best ? { car: best, dist: bestDist } : null;
  }

  function removeCar(car) {
    scene.remove(car.mesh);
    const i = cars.indexOf(car);
    if (i >= 0) cars.splice(i, 1);
    cars.push(spawnCar(car.pos));
  }

  return { cars, update, nearestCar, removeCar, spawnCar };
}
