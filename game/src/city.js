// Solmar City: a sun-soaked coastal grid. Seven by seven blocks on a road grid,
// a beach and the sea along the south edge, palms, streetlights and a few
// landmarks the missions point at. Everything is boxes, cylinders and one shared
// window texture, so the whole city is a few hundred cheap meshes.
import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';
import { chance, pick, range } from './random.js';

const ROADS = [-3, -2, -1, 0, 1, 2, 3].map((i) => i * CITY.pitch);

/** A small canvas texture: lit windows on a wall, tinted per building. */
function makeFacadeTexture(baseColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = `#${baseColor.toString(16).padStart(6, '0')}`;
  g.fillRect(0, 0, 64, 128);
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const lit = Math.random() < 0.35;
      g.fillStyle = lit ? '#ffd98a' : '#2a4a66';
      g.fillRect(6 + col * 14, 8 + row * 15, 9, 10);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function box(w, h, d, color, x, y, z, opts = {}) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = opts.material || new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = opts.cast !== false;
  mesh.receiveShadow = true;
  return mesh;
}

export function createCity(scene, rng) {
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);
  const facades = PALETTE.building.map((c) => makeFacadeTexture(c));

  // Ground: one big asphalt slab, then sand and sea to the south.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.extent * 2 + 60, CITY.extent * 2 + 60),
    new THREE.MeshStandardMaterial({ color: PALETTE.asphalt, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 10);
  ground.receiveShadow = true;
  group.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 30),
    new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 1 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, CITY.beachZ - 13);
  sand.receiveShadow = true;
  group.add(sand);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 300),
    new THREE.MeshStandardMaterial({ color: PALETTE.sea, roughness: 0.25, metalness: 0.4 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.05, CITY.seaZ - 150);
  group.add(sea);

  // Sidewalk slabs along every road, a touch above the asphalt.
  const walkMat = new THREE.MeshStandardMaterial({ color: PALETTE.sidewalk, roughness: 1 });
  for (const at of ROADS) {
    for (const [w, d, x, z] of [
      [CITY.extent * 2, CITY.roadHalf + 4, 0, at],
      [CITY.roadHalf + 4, CITY.extent * 2, at, 0],
    ]) {
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(w, d), walkMat);
      walk.rotation.x = -Math.PI / 2;
      walk.position.set(x, 0.06, z);
      walk.receiveShadow = true;
      group.add(walk);
    }
  }

  // Lane dashes, instanced: one mesh, hundreds of dashes.
  const dashGeo = new THREE.PlaneGeometry(0.5, 3);
  const dashMat = new THREE.MeshBasicMaterial({ color: PALETTE.asphaltLine });
  const dashCount = ROADS.length * 2 * 12;
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashCount);
  const dummy = new THREE.Object3D();
  let di = 0;
  for (const at of ROADS) {
    for (let k = -5; k <= 5; k += 1) {
      if (k === 0) continue;
      const along = k * CITY.pitch + CITY.pitch / 2;
      dummy.position.set(at, 0.09, along);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.updateMatrix();
      dashes.setMatrixAt(di, dummy.matrix); di += 1;
      dummy.position.set(along, 0.09, at);
      dummy.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
      dummy.updateMatrix();
      dashes.setMatrixAt(di, dummy.matrix); di += 1;
    }
  }
  dashes.count = di;
  group.add(dashes);

  // Blocks: buildings, parks, parking lots and the landmarks.
  const parkBlocks = new Set(['0,-1', '-2,1', '2,2']); // '0,-1' is the plaza, with its fountain
  const lotBlocks = new Set(['-1,2', '3,-2', '-3,-2']);
  const landmarks = {
    safehouse: new THREE.Vector3(29, 0, 29),
    bank: new THREE.Vector3(87, 0, -29),
    docks: new THREE.Vector3(-145, 0, -180),
    plaza: new THREE.Vector3(29, 0, -29),
    marina: new THREE.Vector3(174, 0, 87),
    airport: new THREE.Vector3(-174, 0, 145),
  };

  function addCollider(cx, cz, hw, hd) {
    colliders.push({ minX: cx - hw, maxX: cx + hw, minZ: cz - hd, maxZ: cz + hd });
  }

  for (let bi = -3; bi <= 2; bi += 1) {
    for (let bj = -3; bj <= 2; bj += 1) {
      const cx = bi * CITY.pitch + CITY.pitch / 2;
      const cz = bj * CITY.pitch + CITY.pitch / 2;
      const key = `${bi},${bj}`;
      if (key === '0,0') continue; // safehouse block
      if (key === '1,-1') continue; // bank block
      if (parkBlocks.has(key)) {
        // Park: grass, palms, a fountain disc.
        const grass = new THREE.Mesh(
          new THREE.PlaneGeometry(CITY.blockHalf * 2, CITY.blockHalf * 2),
          new THREE.MeshStandardMaterial({ color: PALETTE.grass, roughness: 1 }),
        );
        grass.rotation.x = -Math.PI / 2;
        grass.position.set(cx, 0.08, cz);
        grass.receiveShadow = true;
        group.add(grass);
        const fountain = new THREE.Mesh(
          new THREE.CylinderGeometry(5, 5.6, 1, 20),
          new THREE.MeshStandardMaterial({ color: 0x9fc3d8, roughness: 0.3 }),
        );
        fountain.position.set(cx, 0.6, cz);
        fountain.castShadow = true;
        group.add(fountain);
        addCollider(cx, cz, 5.6, 5.6);
        for (let p = 0; p < 5; p += 1) {
          const px = cx + range(rng, -18, 18);
          const pz = cz + range(rng, -18, 18);
          if (Math.hypot(px - cx, pz - cz) < 8) continue;
          group.add(makePalm(px, pz, rng));
        }
        continue;
      }
      if (lotBlocks.has(key)) {
        // Parking lot: flat slab with painted bays.
        const lot = new THREE.Mesh(
          new THREE.PlaneGeometry(CITY.blockHalf * 2, CITY.blockHalf * 2),
          new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 1 }),
        );
        lot.rotation.x = -Math.PI / 2;
        lot.position.set(cx, 0.08, cz);
        lot.receiveShadow = true;
        group.add(lot);
        continue;
      }
      // Ordinary block: one to three towers.
      const towers = chance(rng, 0.45) ? 2 : 1;
      for (let t = 0; t < towers; t += 1) {
        const w = range(rng, 12, 20);
        const d = range(rng, 12, 20);
        const h = range(rng, 9, 34) * (chance(rng, 0.18) ? 1.8 : 1);
        const ox = towers === 1 ? 0 : (t === 0 ? -11 : 11);
        const oz = towers === 1 ? 0 : (t === 0 ? -9 : 9);
        const bx = cx + ox;
        const bz = cz + oz;
        const mat = new THREE.MeshStandardMaterial({
          map: pick(rng, facades), roughness: 0.85, metalness: 0.05,
        });
        const tower = box(w, h, d, 0xffffff, bx, h / 2, bz, { material: mat });
        group.add(tower);
        // Roof rim so towers read at a distance.
        group.add(box(w + 0.6, 0.7, d + 0.6, 0x6a5a48, bx, h + 0.35, bz, { cast: false }));
        addCollider(bx, bz, w / 2 + 0.4, d / 2 + 0.4);
      }
    }
  }

  // Safehouse: a low coral bungalow with a striped awning, at block (0,0).
  const sh = landmarks.safehouse;
  group.add(box(14, 5, 10, 0xe07856, sh.x, 2.5, sh.z));
  group.add(box(15, 0.6, 11, 0x8a4a3a, sh.x, 5.3, sh.z, { cast: false }));
  group.add(box(6, 3, 0.4, 0x2a4a66, sh.x, 1.5, sh.z + 5.1, { cast: false }));
  addCollider(sh.x, sh.z, 7.4, 5.4);

  // The bank: the tallest tower in town, glass and gold, at block (1,-1).
  const bk = landmarks.bank;
  const bankMat = new THREE.MeshStandardMaterial({ map: facades[3], roughness: 0.4, metalness: 0.3 });
  group.add(box(22, 52, 22, 0xffffff, bk.x, 26, bk.z, { material: bankMat }));
  group.add(box(24, 1.2, 24, 0xf2c230, bk.x, 52.6, bk.z, { cast: false }));
  addCollider(bk.x, bk.z, 11.4, 11.4);

  // The docks: crates and a pier jutting into the sea, south-west.
  const dk = landmarks.docks;
  for (let i = 0; i < 8; i += 1) {
    const cw = range(rng, 3, 5);
    const crate = box(cw, range(rng, 2, 4), cw, pick(rng, [0xb07840, 0x7a8a9a, 0xa89050]), dk.x + range(rng, -14, 14), 1.5, dk.z + range(rng, -8, 8));
    group.add(crate);
    addCollider(crate.position.x, crate.position.z, cw / 2 + 0.3, cw / 2 + 0.3);
  }
  const pier = box(8, 1, 26, 0x6a5a48, dk.x, 0.6, CITY.seaZ + 8);
  group.add(pier);

  // Palms along the beach boardwalk and a few street corners.
  for (let x = -190; x <= 190; x += 24) {
    group.add(makePalm(x + range(rng, -4, 4), CITY.beachZ + 6 + range(rng, 0, 4), rng));
  }
  for (let i = 0; i < 14; i += 1) {
    const road = pick(rng, ROADS);
    const along = range(rng, -180, 180);
    group.add(makePalm(road + (rng() < 0.5 ? -11 : 11), along, rng));
  }

  // Streetlights along every road, instanced poles and glowing heads.
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7, 6);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.6, metalness: 0.6 });
  const headGeo = new THREE.SphereGeometry(0.45, 8, 6);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffd98a, emissive: 0xffb84d, emissiveIntensity: 1.4 });
  const lightSpots = [];
  for (const at of ROADS) {
    for (let k = -3; k <= 2; k += 1) {
      lightSpots.push([at + CITY.roadHalf + 1.5, k * CITY.pitch + CITY.pitch / 2]);
      lightSpots.push([k * CITY.pitch + CITY.pitch / 2, at + CITY.roadHalf + 1.5]);
    }
  }
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lightSpots.length);
  const heads = new THREE.InstancedMesh(headGeo, headMat, lightSpots.length);
  lightSpots.forEach(([x, z], i) => {
    dummy.position.set(x, 3.5, z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 7.1, z);
    dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
  });
  group.add(poles);
  group.add(heads);

  // The sun: a big warm disc low over the sea, and a few flat clouds.
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(26, 32),
    new THREE.MeshBasicMaterial({ color: PALETTE.sun, fog: false }),
  );
  sun.position.set(-60, 42, -420);
  sun.lookAt(0, 20, 0);
  scene.add(sun);
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffd9b0, transparent: true, opacity: 0.55, fog: false });
  for (let i = 0; i < 7; i += 1) {
    const cloud = new THREE.Mesh(new THREE.PlaneGeometry(range(rng, 40, 90), range(rng, 6, 12)), cloudMat);
    cloud.position.set(range(rng, -260, 260), range(rng, 70, 120), range(rng, -320, -140));
    cloud.lookAt(0, 60, 0);
    scene.add(cloud);
  }

  function isOnRoad(x, z) {
    for (const at of ROADS) {
      if (Math.abs(x - at) <= CITY.roadHalf + 1 || Math.abs(z - at) <= CITY.roadHalf + 1) return true;
    }
    return false;
  }

  /** Push a circle out of every building collider; returns true on a hit. */
  function collideCircle(pos, radius) {
    let hit = false;
    for (const c of colliders) {
      const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      const dx = pos.x - nx;
      const dz = pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        hit = true;
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          pos.x = nx + (dx / d) * radius;
          pos.z = nz + (dz / d) * radius;
        } else {
          // The centre is inside the box: leave by the nearest face, not blindly +x.
          const left = pos.x - c.minX;
          const right = c.maxX - pos.x;
          const near = pos.z - c.minZ;
          const far = c.maxZ - pos.z;
          const min = Math.min(left, right, near, far);
          if (min === left) pos.x = c.minX - radius;
          else if (min === right) pos.x = c.maxX + radius;
          else if (min === near) pos.z = c.minZ - radius;
          else pos.z = c.maxZ + radius;
        }
      }
    }
    // The sea is a wall; the sand is not.
    if (pos.z < CITY.seaZ + 1) { pos.z = CITY.seaZ + 1; hit = true; }
    pos.x = Math.max(-CITY.extent - 20, Math.min(CITY.extent + 20, pos.x));
    pos.z = Math.max(CITY.seaZ + 1, Math.min(CITY.extent + 20, pos.z));
    return hit;
  }

  return { group, colliders, roadLines: ROADS, landmarks, isOnRoad, collideCircle };
}

function makePalm(x, z, rng) {
  const palm = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.34, 6, 7),
    new THREE.MeshStandardMaterial({ color: PALETTE.palmTrunk, roughness: 1 }),
  );
  trunk.position.y = 3;
  trunk.castShadow = true;
  palm.add(trunk);
  const leafMat = new THREE.MeshStandardMaterial({ color: PALETTE.palmLeaf, roughness: 1 });
  for (let i = 0; i < 6; i += 1) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.4, 4), leafMat);
    const angle = (i / 6) * Math.PI * 2 + range(rng, -0.2, 0.2);
    leaf.position.set(Math.cos(angle) * 1.1, 6.4, Math.sin(angle) * 1.1);
    leaf.rotation.z = Math.cos(angle) * 1.1;
    leaf.rotation.x = -Math.sin(angle) * 1.1;
    leaf.castShadow = true;
    palm.add(leaf);
  }
  palm.position.set(x, 0, z);
  palm.rotation.y = rng() * Math.PI * 2;
  return palm;
}
