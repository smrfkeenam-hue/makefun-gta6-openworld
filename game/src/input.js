// Keyboard and pointer input for Solmar Bay. Held keys give movement and driving;
// one-shot presses (enter car, pause, mute, restart) are queued as bit flags and
// taken once by the loop, so a press between two frames is never lost or counted
// twice. The mouse aims on foot and steers the camera's aim point while driving.
//
// A standard gamepad is supported too (left stick to move/drive, right trigger
// to shoot, A to enter a car, Start to pause): its axes feed the same move /
// throttle / steer readers, so keyboard, mouse and pad all drive one input
// surface and automated tests sending real keys are unaffected.

export const ACTION_ENTER = 1;    // E: get in / out of a car
export const ACTION_PAUSE = 2;    // P or Escape
export const ACTION_CONFIRM = 4;  // Space or Enter: start, restart, dismiss
export const ACTION_MUTE = 8;     // M
export const ACTION_RESTART = 16; // R: restart the current mission

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const ENTER = new Set(['KeyE', 'KeyF']);
const PAUSE = new Set(['KeyP', 'Escape']);
const CONFIRM = new Set(['Space', 'Enter']);
const MUTE = new Set(['KeyM']);
const RESTART = new Set(['KeyR']);

// Gamepad mapping: button indices on a standard mapping pad.
const PAD_BUTTON_ENTER = 0;   // A / cross
const PAD_BUTTON_CONFIRM = 0; // A / cross doubles as confirm on menus
const PAD_BUTTON_PAUSE = 9;   // Start
const PAD_BUTTON_MUTE = 8;    // Back / select
const PAD_BUTTON_RESTART = 3; // Y / triangle
const PAD_DEADZONE = 0.20;

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let mouseClicked = false;
  let padPrev = new Set(); // gamepad buttons held last poll, for edge detection

  window.addEventListener('keydown', (event) => {
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      keys.add(event.code);
      return;
    }
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)) {
      keys.add(event.code);
      event.preventDefault();
    } else if (ENTER.has(event.code)) {
      if (!event.repeat) actions |= ACTION_ENTER;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
      event.preventDefault();
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (RESTART.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RESTART;
    } else {
      return;
    }
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything.
  window.addEventListener('blur', () => {
    keys.clear();
    mouseDown = false;
  });

  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      mouseDown = true;
      mouseClicked = true;
    }
    if (event.button === 2) keys.add('Space'); // right mouse: handbrake while driving
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouseDown = false;
    if (event.button === 2) keys.delete('Space');
  });
  // No menu on right-click: it is a driving control, not a browser action.
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  function hasAny(set) {
    for (const code of set) if (keys.has(code)) return true;
    return false;
  }

  /** The first connected standard gamepad, or null. */
  function pad() {
    try {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const p of pads) if (p && p.connected) return p;
    } catch {
      // No gamepad API: keyboard and mouse only.
    }
    return null;
  }

  /** Poll the pad once per frame: edge-detect its buttons into ACTION_* flags. */
  function pollPad() {
    const p = pad();
    if (!p) return;
    const pressed = new Set();
    for (let i = 0; i < p.buttons.length; i += 1) if (p.buttons[i].pressed) pressed.add(i);
    if (pressed.has(PAD_BUTTON_ENTER) && !padPrev.has(PAD_BUTTON_ENTER)) actions |= ACTION_ENTER;
    if (pressed.has(PAD_BUTTON_CONFIRM) && !padPrev.has(PAD_BUTTON_CONFIRM)) actions |= ACTION_CONFIRM;
    if (pressed.has(PAD_BUTTON_PAUSE) && !padPrev.has(PAD_BUTTON_PAUSE)) actions |= ACTION_PAUSE;
    if (pressed.has(PAD_BUTTON_MUTE) && !padPrev.has(PAD_BUTTON_MUTE)) actions |= ACTION_MUTE;
    if (pressed.has(PAD_BUTTON_RESTART) && !padPrev.has(PAD_BUTTON_RESTART)) actions |= ACTION_RESTART;
    padPrev = pressed;
  }

  /** Left-stick axis with a dead zone, or 0 when no pad is connected. */
  function padAxis(index) {
    const p = pad();
    if (!p || !p.axes || Math.abs(p.axes[index] || 0) < PAD_DEADZONE) return 0;
    return p.axes[index];
  }

  return {
    /** Movement vector, normalised: x right, y down. */
    move() {
      pollPad();
      let x = (hasAny(RIGHT) ? 1 : 0) - (hasAny(LEFT) ? 1 : 0) + padAxis(0);
      let y = (hasAny(DOWN) ? 1 : 0) - (hasAny(UP) ? 1 : 0) + padAxis(1);
      const len = Math.hypot(x, y);
      if (len === 0) return { x: 0, y: 0 };
      if (len > 1) {
        x /= len;
        y /= len;
      }
      return { x, y };
    },
    /** True while W/Up (accelerate) is held; S/Down brakes or reverses. */
    throttle() {
      const padUp = padAxis(1) < -PAD_DEADZONE ? 1 : 0;
      const padDown = padAxis(1) > PAD_DEADZONE ? 1 : 0;
      return (hasAny(UP) ? 1 : 0) - (hasAny(DOWN) ? 1 : 0) + padUp - padDown;
    },
    /** -1 left, 1 right, 0 neither — steering while driving. */
    steer() {
      const padSteer = padAxis(0);
      return (hasAny(RIGHT) ? 1 : 0) - (hasAny(LEFT) ? 1 : 0) + padSteer;
    },
    sprint() {
      const p = pad();
      const padSprint = p && p.buttons[5] && p.buttons[5].value > 0.4;
      return keys.has('ShiftLeft') || keys.has('ShiftRight') || !!padSprint;
    },
    handbrake() {
      const p = pad();
      const padBrake = p && p.buttons[6] && p.buttons[6].value > 0.4;
      return keys.has('Space') || !!padBrake;
    },
    mouse() {
      const p = pad();
      // Right trigger on the pad shoots on foot, like holding the mouse.
      const padShoot = p && p.buttons[7] && p.buttons[7].value > 0.4;
      return { x: mouseX, y: mouseY, down: mouseDown || !!padShoot };
    },
    /** True once per click (consumed by the caller). */
    takeClick() {
      const clicked = mouseClicked;
      mouseClicked = false;
      return clicked;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      pollPad();
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** True while any standard gamepad is connected. */
    hasGamepad() {
      return pad() !== null;
    },
  };
}
