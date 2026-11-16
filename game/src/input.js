// Keyboard + mouse input with pointer lock. Keeps one state object the
// simulation reads each fixed step; look deltas are consumed once per frame.
export function createInput(canvas, onLockChange) {
  const state = {
    keys: new Set(),
    firing: false,
    lookX: 0,
    lookY: 0,
    locked: false,
  };
  let lookAccumX = 0;
  let lookAccumY = 0;

  function onKeyDown(event) {
    if (event.repeat) return;
    state.keys.add(event.code);
    if (event.code === 'Space') event.preventDefault();
  }
  function onKeyUp(event) {
    state.keys.delete(event.code);
  }
  function onMouseMove(event) {
    if (!state.locked) return;
    lookAccumX += event.movementX;
    lookAccumY += event.movementY;
  }
  function onMouseDown(event) {
    if (event.button === 0) state.firing = true;
  }
  function onMouseUp(event) {
    if (event.button === 0) state.firing = false;
  }
  function onLock() {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) state.firing = false;
    onLockChange(state.locked);
  }
  function onBlur() {
    state.keys.clear();
    state.firing = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLock);

  return {
    state,
    requestLock() {
      canvas.requestPointerLock();
    },
    releaseLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    // Consume accumulated look since the last frame; sensitivity applied here.
    takeLook() {
      const x = lookAccumX;
      const y = lookAccumY;
      lookAccumX = 0;
      lookAccumY = 0;
      return { x: x * 0.0021, y: y * 0.0021 };
    },
    pressed(code) {
      return state.keys.has(code);
    },
  };
}
