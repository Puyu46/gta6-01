// The screenshot scenes behind ?shot=1|2|3|4. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by a simple
// autopilot (drive the road, chase the marker, aim at the nearest rival), so the
// frame is what a short game really looks like and the same seed always gives the
// same frame.

const SAMPLE = 1 / 60;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Steering for the driving autopilot: -1 (left) .. 1 (right), from the heading error. */
function driveSteer(world) {
  const car = world.playerCar;
  const laneX = 3.5;
  const lookAhead = 14;
  const desired = Math.atan2(laneX - car.pos.x, lookAhead);
  const diff = angleDiff(desired, car.heading);
  // Steering flips when the car rolls backwards, so the sign follows the speed.
  const sign = car.speed < -0.5 ? 1 : -1;
  return clamp(sign * diff * 1.6, -1, 1);
}

function stepWorld(world, input, camera, seconds, drive) {
  const steps = Math.round(seconds / SAMPLE);
  for (let i = 0; i < steps; i += 1) {
    if (drive) {
      const steer = driveSteer(world);
      input.setVirtual({ forward: 1, left: steer < -0.15 ? 1 : 0, right: steer > 0.15 ? 1 : 0 });
      world.state.cameraYaw = world.state.heading;
    }
    world.step(SAMPLE, input, camera);
  }
  input.clearVirtual();
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * Screens: 'title' | 'play'.
 */
export function stageShot(name, world, input, camera) {
  world.reset();
  const st = world.state;
  if (name === '2') {
    // Driving through traffic on Palma Ave (road x = 0), HUD and minimap live.
    // The car is placed on the road, heading south, so the autopilot has a clean run.
    // Mission 1 is already running: the stolen car is the getaway car, and the
    // docks marker is the objective.
    const car = world.traffic.cars[0];
    car.pos.set(3.5, 0, -120);
    car.heading = 0;
    car.color = 0xd84040;
    car.mesh.position.copy(car.pos);
    car.mesh.rotation.y = 0;
    st.pos.set(car.pos.x + 2, 0, car.pos.z);
    world.missions.load(0);
    world.startMission();
    world.enterCar(car);
    stepWorld(world, input, camera, 7, true);
    return { screen: 'play' };
  }
  if (name === '3') {
    // A three-star chase: cruisers cut the player off ahead and close in behind.
    const car = world.traffic.cars[1];
    car.pos.set(3.5, 0, -140);
    car.heading = 0;
    car.color = 0xd84040;
    car.mesh.position.copy(car.pos);
    car.mesh.rotation.y = 0;
    st.pos.set(car.pos.x + 2, 0, car.pos.z);
    world.enterCar(car);
    world.setHeat(3);
    const playerZ = world.playerCar.pos.z;
    world.police.cruisers.forEach((cruiser, i) => {
      if (i === 0) {
        // Ahead in the next lane, pacing the player — visible in the chase camera.
        cruiser.pos.set(-3.5, 0, playerZ + 25);
        cruiser.heading = 0;
      } else if (i === 1) {
        // Ahead on the right shoulder, closing in.
        cruiser.pos.set(10.5, 0, playerZ + 38);
        cruiser.heading = 0;
      } else {
        // Behind, closing in.
        cruiser.pos.set(3.5 + (i === 2 ? -7 : 7), 0, playerZ - 24 - i * 8);
        cruiser.heading = 0;
      }
      cruiser.mesh.position.copy(cruiser.pos);
      cruiser.mesh.rotation.y = cruiser.heading;
    });
    stepWorld(world, input, camera, 5, true);
    // Look back: the chase camera usually faces forward, but the cruisers are
    // behind the player — turn it around so the pursuit is in the frame.
    st.cameraYaw = world.playerCar.heading + Math.PI;
    return { screen: 'play' };
  }
  if (name === '4') {
    // Mission 3 in progress: on foot at the plaza, the Dune crew closing in.
    world.missions.load(2);
    world.startMission();
    const plaza = world.city.landmarks.plaza;
    st.pos.set(plaza.x + 12, 0, plaza.z + 14);
    st.cameraYaw = Math.atan2(plaza.x - st.pos.x, plaza.z - st.pos.z);
    // Walk to the plaza, then hold and fire at the nearest rival.
    for (let i = 0; i < 6 / SAMPLE; i += 1) {
      const enemies = world.enemies.list.filter((e) => e.alive);
      if (enemies.length > 0) {
        const foe = enemies[0];
        st.cameraYaw = Math.atan2(foe.pos.x - st.pos.x, foe.pos.z - st.pos.z);
        const dist = Math.hypot(foe.pos.x - st.pos.x, foe.pos.z - st.pos.z);
        input.setVirtual({ forward: dist > 10 ? 1 : 0, fire: dist < 45 ? 1 : 0 });
      } else {
        st.cameraYaw = Math.atan2(plaza.x - st.pos.x, plaza.z - st.pos.z);
        input.setVirtual({ forward: 1, fire: 0 });
      }
      world.step(SAMPLE, input, camera);
    }
    input.clearVirtual();
    return { screen: 'play' };
  }
  // Shot 1 (and anything else): the title screen over a living city at sunset.
  stepWorld(world, input, camera, 6, false);
  return { screen: 'title' };
}
