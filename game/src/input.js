// Keyboard and mouse input. Held keys are read every frame; one-shot presses (E,
// pause, reload, punch) are queued as flags and taken once, so a press between two
// frames is never lost and never counted twice. A virtual pad lets the screenshot
// autopilot and the headless playtest drive the same code path as a real player.
export const ACT_ENTER = 1;
export const ACT_PAUSE = 2;
export const ACT_RELOAD = 4;
export const ACT_PUNCH = 8;
export const ACT_MISSION = 16;

const FORWARD = new Set(['KeyW', 'ArrowUp']);
const BACK = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const JUMP = new Set(['Space']);
const ENTER = new Set(['KeyE']);
const PAUSE = new Set(['KeyP', 'Escape']);
const RELOAD = new Set(['KeyR']);
const PUNCH = new Set(['KeyF']);

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseDX = 0;
  let mouseDY = 0;
  let mouseDown = false;
  let locked = false;
  const virtual = { forward: 0, back: 0, left: 0, right: 0, run: 0, jump: 0, fire: 0 };
  let virtualMouseDX = 0;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(event.code);
    if (ENTER.has(event.code)) actions |= ACT_ENTER;
    else if (PAUSE.has(event.code)) actions |= ACT_PAUSE;
    else if (RELOAD.has(event.code)) actions |= ACT_RELOAD;
    else if (PUNCH.has(event.code)) actions |= ACT_PUNCH;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => { keys.delete(event.code); });
  window.addEventListener('blur', () => { keys.clear(); mouseDown = false; });

  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) mouseDown = true;
    if (!locked && document.pointerLockElement !== canvas) {
      try { canvas.requestPointerLock(); } catch { /* pointer lock is a nicety, not a need */ }
    }
  });
  window.addEventListener('mouseup', (event) => { if (event.button === 0) mouseDown = false; });
  document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; });
  document.addEventListener('mousemove', (event) => {
    if (locked) { mouseDX += event.movementX; mouseDY += event.movementY; }
  });

  return {
    /** -1..1 forward/back and strafe, from keys or the virtual pad. */
    move() {
      const f = (keys.has('KeyW') || keys.has('ArrowUp') || virtual.forward ? 1 : 0)
        - (keys.has('KeyS') || keys.has('ArrowDown') || virtual.back ? 1 : 0);
      const s = (keys.has('KeyD') || keys.has('ArrowRight') || virtual.right ? 1 : 0)
        - (keys.has('KeyA') || keys.has('ArrowLeft') || virtual.left ? 1 : 0);
      return { forward: f, strafe: s };
    },
    running() {
      return keys.has('ShiftLeft') || keys.has('ShiftRight') || !!virtual.run;
    },
    jumpHeld() {
      return keys.has('Space') || !!virtual.jump;
    },
    firing() {
      return mouseDown || !!virtual.fire;
    },
    /** Mouse look since the last call, in pixels. */
    takeMouse() {
      const dx = mouseDX + virtualMouseDX;
      const dy = mouseDY;
      mouseDX = 0; mouseDY = 0; virtualMouseDX = 0;
      return { dx, dy };
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Take one flag only, leaving the rest queued for the next reader. */
    takeFlag(flag) {
      const taken = actions & flag;
      actions &= ~flag;
      return taken;
    },
    pressAction(flag) { actions |= flag; },
    /** Drive the game without a keyboard (screenshots, playtests). */
    setVirtual(pad) {
      Object.assign(virtual, pad);
    },
    addVirtualMouse(dx) { virtualMouseDX += dx; },
    clearVirtual() {
      for (const key of Object.keys(virtual)) virtual[key] = 0;
    },
  };
}
