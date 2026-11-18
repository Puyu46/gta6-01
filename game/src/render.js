// Drawing only: the renderer, the third-person camera rig that follows the player
// or the car, and the golden-hour lighting. The HUD is DOM (hud.js); this file
// only paints the 3D world.
import * as THREE from 'three';
import { CHASE_CAM, PALETTE } from './config.js';

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.skyHorizon);
  scene.fog = new THREE.Fog(PALETTE.fog, 90, 320);

  const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 900);

  // Golden hour: a low warm sun from the west and a soft sky fill.
  const sun = new THREE.DirectionalLight(0xffb36b, 2.6);
  sun.position.set(-120, 70, -160);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70;
  sun.shadow.camera.bottom = -70;
  sun.shadow.camera.far = 500;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xffd9a0, 0x3a4a5a, 0.85);
  scene.add(hemi);
  const fill = new THREE.DirectionalLight(0x7aa0c0, 0.5);
  fill.position.set(80, 60, 120);
  scene.add(fill);

  const camPos = new THREE.Vector3(0, 8, -14);
  const camTarget = new THREE.Vector3();
  const desired = new THREE.Vector3();
  let firstFrame = true;

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', resize);

  /** Follow the player (or their car) with a smoothed chase camera. The camera
   * sits behind the aim direction and looks at a point ahead of the player, so
   * the crosshair in the middle of the screen is where the pistol shoots. */
  function updateCamera(world, dt) {
    const st = world.state;
    const focus = world.playerPos;
    const yaw = st.cameraYaw;
    const pitch = st.cameraPitch;
    const aimDir = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch),
    );
    const eye = new THREE.Vector3(focus.x, focus.y + 1.6, focus.z);
    const dist = st.inCar ? CHASE_CAM.carDist : CHASE_CAM.onFootDist;
    desired.copy(eye).addScaledVector(aimDir, -dist);
    if (firstFrame) {
      camPos.copy(desired);
      firstFrame = false;
    } else {
      const k = 1 - Math.exp(-dt * CHASE_CAM.smooth);
      camPos.lerp(desired, k);
    }
    camTarget.copy(eye).addScaledVector(aimDir, CHASE_CAM.aimDistance);
    camera.position.copy(camPos);
    camera.lookAt(camTarget);
    // The shadow frustum follows the player so shadows stay crisp.
    sun.position.set(focus.x - 120, 70, focus.z - 160);
    sun.target.position.set(focus.x, 0, focus.z);
    sun.target.updateMatrixWorld();
  }

  function render(world, dt) {
    updateCamera(world, dt);
    renderer.render(scene, camera);
  }

  return { renderer, scene, camera, render, resize };
}
