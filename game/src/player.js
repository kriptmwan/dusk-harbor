// Player movement: acceleration-based, with crouch, collision against the
// map's AABB colliders, and recoil recovery. One state object; the main loop
// owns the fixed-step call.
import * as THREE from 'three';

export const PLAYER = {
  radius: 0.42,
  eyeStand: 1.62,
  eyeCrouch: 1.08,
  walkSpeed: 5.4,
  crouchSpeed: 2.6,
  accel: 34,
  friction: 11,
};

export function createPlayer(colliders, bounds) {
  const state = {
    position: new THREE.Vector3(0, 0, 21),
    velocity: new THREE.Vector3(),
    yaw: Math.PI,
    pitch: 0,
    crouched: false,
    eye: PLAYER.eyeStand,
    onGround: true,
  };
  let recoilPitch = 0;
  let recoilYaw = 0;
  const wish = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();

  // Axis-separated AABB resolution: slide along walls instead of sticking.
  function collideAxis(axis, delta) {
    if (delta === 0) return;
    const r = PLAYER.radius;
    const next = state.position.clone();
    if (axis === 'x') next.x += delta;
    else next.z += delta;
    for (const c of colliders) {
      if (next.y + 1.7 < c.minY || next.y + 0.1 > c.maxY) continue;
      const overlapX = next.x + r > c.minX && next.x - r < c.maxX;
      const overlapZ = next.z + r > c.minZ && next.z - r < c.maxZ;
      if (overlapX && overlapZ) return; // blocked on this axis
    }
    if (axis === 'x') state.position.x = next.x;
    else state.position.z = next.z;
  }

  return {
    state,
    reset(x, z, yaw) {
      state.position.set(x, 0, z);
      state.velocity.set(0, 0, 0);
      state.yaw = yaw;
      state.pitch = 0;
      state.crouched = false;
      state.eye = PLAYER.eyeStand;
      recoilPitch = 0;
      recoilYaw = 0;
    },
    look(dx, dy) {
      state.yaw -= dx;
      state.pitch -= dy;
      const limit = Math.PI / 2 - 0.02;
      state.pitch = Math.max(-limit, Math.min(limit, state.pitch));
    },
    addRecoil(pitch, yaw) {
      recoilPitch += pitch;
      recoilYaw += yaw;
    },
    groundSpeed() {
      return Math.hypot(state.velocity.x, state.velocity.z);
    },
    step(dt, keys) {
      // Recoil decays back toward zero; the camera reads pitch + recoil.
      recoilPitch *= Math.pow(0.0001, dt);
      recoilYaw *= Math.pow(0.0001, dt);
      const wantCrouch = keys.has('ControlLeft') || keys.has('KeyC');
      state.crouched = wantCrouch;
      const targetEye = wantCrouch ? PLAYER.eyeCrouch : PLAYER.eyeStand;
      state.eye += (targetEye - state.eye) * Math.min(1, dt * 12);

      forward.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
      right.set(Math.cos(state.yaw), 0, -Math.sin(state.yaw));
      wish.set(0, 0, 0);
      if (keys.has('KeyW') || keys.has('ArrowUp')) wish.add(forward);
      if (keys.has('KeyS') || keys.has('ArrowDown')) wish.sub(forward);
      if (keys.has('KeyD') || keys.has('ArrowRight')) wish.add(right);
      if (keys.has('KeyA') || keys.has('ArrowLeft')) wish.sub(right);
      if (wish.lengthSq() > 0) wish.normalize();

      const maxSpeed = wantCrouch ? PLAYER.crouchSpeed : PLAYER.walkSpeed;
      const target = wish.multiplyScalar(maxSpeed);
      const rate = wish.lengthSq() > 0 ? PLAYER.accel : PLAYER.friction;
      state.velocity.x += (target.x - state.velocity.x) * Math.min(1, rate * dt);
      state.velocity.z += (target.z - state.velocity.z) * Math.min(1, rate * dt);
      if (Math.hypot(state.velocity.x, state.velocity.z) < 0.02) {
        state.velocity.x = 0;
        state.velocity.z = 0;
      }

      collideAxis('x', state.velocity.x * dt);
      collideAxis('z', state.velocity.z * dt);
      state.position.x = Math.max(bounds.minX + 0.6, Math.min(bounds.maxX - 0.6, state.position.x));
      state.position.z = Math.max(bounds.minZ + 0.6, Math.min(bounds.maxZ - 0.6, state.position.z));
      state.position.y = 0;
    },
    // Camera pitch including the recoil kick that has not recovered yet.
    cameraPitch() { return state.pitch + recoilPitch; },
    cameraYaw() { return state.yaw + recoilYaw; },
  };
}
