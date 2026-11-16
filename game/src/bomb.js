// The bomb: carried by the player, planted at site A or B, ticking down to
// an explosion the bots race to stop. Planting takes 3 seconds of holding E
// inside a site ring; moving or letting go cancels it.
import * as THREE from 'three';

export const PLANT_TIME = 3;
export const BOMB_TIMER = 40;
export const DEFUSE_TIME = 4;

export function createBomb(scene, sites) {
  const mesh = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.28, 0.35),
    new THREE.MeshStandardMaterial({ color: '#2b2f3a', roughness: 0.5, metalness: 0.4 }),
  );
  const light = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.06, 0.1),
    new THREE.MeshBasicMaterial({ color: '#ff4444' }),
  );
  light.position.set(0.15, 0.17, 0);
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.015, 0.4, 6),
    new THREE.MeshStandardMaterial({ color: '#888888', metalness: 0.8, roughness: 0.3 }),
  );
  antenna.position.set(-0.18, 0.3, 0);
  mesh.add(body, light, antenna);
  mesh.visible = false;
  scene.add(mesh);

  const state = {
    status: 'carried', // carried | planting | planted | exploded | defused
    site: null,
    plantProgress: 0,
    timer: BOMB_TIMER,
    position: new THREE.Vector3(),
  };
  let blink = 0;

  return {
    state,
    mesh,
    reset() {
      state.status = 'carried';
      state.site = null;
      state.plantProgress = 0;
      state.timer = BOMB_TIMER;
      mesh.visible = false;
    },
    // The site the player stands in, or null.
    siteAt(x, z) {
      for (const key of Object.keys(sites)) {
        const site = sites[key];
        const d = Math.hypot(x - site.center.x, z - site.center.z);
        if (d <= site.radius) return site;
      }
      return null;
    },
    step(dt, { planting, x, z, onExplode }) {
      if (state.status === 'planting') {
        const site = this.siteAt(x, z);
        if (!planting || !site || site !== state.site) {
          state.status = 'carried';
          state.plantProgress = 0;
          state.site = null;
          return;
        }
        state.plantProgress += dt;
        if (state.plantProgress >= PLANT_TIME) {
          state.status = 'planted';
          state.timer = BOMB_TIMER;
          state.position.set(x, 0.2, z);
          mesh.position.copy(state.position);
          mesh.visible = true;
        }
        return;
      }
      if (state.status === 'carried' && planting) {
        const site = this.siteAt(x, z);
        if (site) {
          state.status = 'planting';
          state.site = site;
          state.plantProgress = 0;
        }
        return;
      }
      if (state.status === 'planted') {
        state.timer -= dt;
        blink += dt;
        light.material.color.setHex(Math.sin(blink * 9) > 0 ? '#ff2222' : '#440000');
        if (state.timer <= 0) {
          state.status = 'exploded';
          mesh.visible = false;
          onExplode();
        }
      }
    },
    startPlant() {
      if (state.status !== 'carried') return false;
      return true;
    },
    defuse() {
      if (state.status !== 'planted') return false;
      state.status = 'defused';
      mesh.visible = false;
      return true;
    },
  };
}
