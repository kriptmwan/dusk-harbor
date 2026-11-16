// Dusk Harbor map: a working container terminal at last light. One yard,
// two bombsites, three lanes. All geometry is procedural boxes with a chosen
// dusk palette — no textures, no external assets.
//
// Layout (metres, x east, z south, player spawns south, bots north):
//   Site A — container yard, east (x +20..+34, z -24..-8)
//   Site B — warehouse hall, west (x -34..-18, z -24..-6)
//   Mid    — crane gantry and crate lane down the centre
//   South  — open plaza where the player spawns
import * as THREE from 'three';
import { PALETTE as P } from './palette.js';

const YARD = { minX: -38, maxX: 38, minZ: -28, maxZ: 28 };

function mat(color, roughness = 0.9) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05 });
}

function box(scene, solids, colliders, { x, z, w, d, h, y = 0, color, collide = true, castShadow = true }) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  scene.add(mesh);
  solids.push(mesh);
  if (collide) {
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY: y, maxY: y + h });
  }
  return mesh;
}

export function createMap(scene) {
  const colliders = [];
  const solids = [];
  const siteMarkers = {};
  const materials = {};

  // --- Ground: two-tone concrete slabs with painted lane lines. ---
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(76, 56), mat(P.ground, 1));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  for (let gx = -36; gx <= 36; gx += 6) {
    const slab = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 55.6), mat(P.groundDark, 1));
    slab.rotation.x = -Math.PI / 2;
    slab.position.set(gx, 0.01, 0);
    slab.receiveShadow = true;
    scene.add(slab);
  }
  // Painted centre lane line and site borders (thin flat boxes, no collision).
  const laneMat = mat('#c9b458', 1);
  const lane = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 40), laneMat);
  lane.position.set(0, 0.02, 0);
  scene.add(lane);

  // --- Perimeter walls with a lit top edge. ---
  const wallH = 4.5;
  box(scene, solids, colliders, { x: 0, z: -28.6, w: 78, d: 1.2, h: wallH, color: P.wall });
  box(scene, solids, colliders, { x: 0, z: 28.6, w: 78, d: 1.2, h: wallH, color: P.wall });
  box(scene, solids, colliders, { x: -38.6, z: 0, w: 1.2, d: 58, h: wallH, color: P.wall });
  box(scene, solids, colliders, { x: 38.6, z: 0, w: 1.2, d: 58, h: wallH, color: P.wall });
  const trimMat = mat(P.accent, 0.6);
  for (const [x, z, w, d] of [[0, -28.6, 78, 1.3], [0, 28.6, 78, 1.3], [-38.6, 0, 1.3, 58], [38.6, 0, 1.3, 58]]) {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, d), trimMat);
    trim.position.set(x, wallH + 0.07, z);
    scene.add(trim);
  }

  // --- Site A: container yard (east). Stacks form lanes and corners. ---
  const containers = [
    // [x, z, alongX, color, stacked]
    [24, -20, true, P.containerRed, 2], [24, -14, true, P.containerTeal, 1],
    [30, -20, false, P.containerOchre, 1], [30, -13, false, P.containerBlue, 2],
    [24, -9, true, P.containerGreen, 1], [31, -8, true, P.containerRed, 1],
    [18, -18, false, P.containerBlue, 1], [33, -22, true, P.containerTeal, 1],
  ];
  for (const [x, z, alongX, color, levels] of containers) {
    const w = alongX ? 6.1 : 2.6;
    const d = alongX ? 2.6 : 6.1;
    for (let level = 0; level < levels; level += 1) {
      box(scene, solids, colliders, { x, z, w, d, h: 2.6, y: level * 2.6, color });
    }
    // Corrugated top ridge so stacks read as containers, not slabs.
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), mat(P.hairline, 0.7));
    ridge.position.set(x, levels * 2.6 + 0.06, z);
    scene.add(ridge);
  }

  // --- Site B: warehouse hall (west). Walls with two door gaps, interior crates. ---
  const wh = { minX: -34, maxX: -18, minZ: -24, maxZ: -6 };
  const whWallH = 5.5;
  // North + west + south walls; east wall split into two leaves with a door gap.
  box(scene, solids, colliders, { x: -26, z: -24.6, w: 17.2, d: 1.2, h: whWallH, color: P.warehouse });
  box(scene, solids, colliders, { x: -34.6, z: -15, w: 1.2, d: 19.2, h: whWallH, color: P.warehouse });
  box(scene, solids, colliders, { x: -26, z: -5.4, w: 17.2, d: 1.2, h: whWallH, color: P.warehouse });
  box(scene, solids, colliders, { x: -17.4, z: -20.5, w: 1.2, d: 8.2, h: whWallH, color: P.warehouse });
  box(scene, solids, colliders, { x: -17.4, z: -9.5, w: 1.2, d: 8.2, h: whWallH, color: P.warehouse });
  // Roof slab over the hall, held up visually by the walls.
  const roof = new THREE.Mesh(new THREE.BoxGeometry(17.2, 0.4, 19.2), mat(P.warehouseRoof, 1));
  roof.position.set(-26, whWallH + 0.2, -15);
  roof.castShadow = true;
  scene.add(roof);
  solids.push(roof);
  // Interior crates and a rack row.
  box(scene, solids, colliders, { x: -30, z: -19, w: 2.4, d: 2.4, h: 1.2, color: P.crate });
  box(scene, solids, colliders, { x: -30, z: -19, w: 1.8, d: 1.8, h: 1.2, y: 1.2, color: P.crateDark });
  box(scene, solids, colliders, { x: -21, z: -20, w: 2.4, d: 2.4, h: 1.2, color: P.crate });
  box(scene, solids, colliders, { x: -27, z: -10, w: 3.2, d: 1.4, h: 2.2, color: P.crateDark });
  box(scene, solids, colliders, { x: -31, z: -11, w: 2.2, d: 2.2, h: 1.1, color: P.crate });

  // --- Mid: gantry crane over the centre lane, crates as cover. ---
  const craneMat = mat(P.crane, 0.6);
  const craneDark = mat(P.craneDark, 0.6);
  for (const [x, z] of [[-7, -12], [7, -12], [-7, -2], [7, -2]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.9, 9, 0.9), craneMat);
    leg.position.set(x, 4.5, z);
    leg.castShadow = true;
    scene.add(leg);
    solids.push(leg);
    colliders.push({ minX: x - 0.45, maxX: x + 0.45, minZ: z - 0.45, maxZ: z + 0.45, minY: 0, maxY: 9 });
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(15.6, 1.1, 1.4), craneDark);
  beam.position.set(0, 9.4, -12);
  beam.castShadow = true;
  scene.add(beam);
  solids.push(beam);
  const beam2 = beam.clone();
  beam2.position.z = -2;
  scene.add(beam2);
  solids.push(beam2);
  const span = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 11.4), craneMat);
  span.position.set(0, 9.6, -7);
  span.castShadow = true;
  scene.add(span);
  solids.push(span);
  // Hanging hook block swaying slightly (animated in update).
  const hook = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 1.2), craneDark);
  hook.position.set(2, 6.4, -7);
  hook.castShadow = true;
  scene.add(hook);
  solids.push(hook);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), mat(P.hairline, 0.5));
  cable.position.set(2, 8.4, -7);
  scene.add(cable);

  // Mid crates: the lane's cover, staggered so no sightline runs the whole map.
  const midCrates = [
    [-3, 2, 2.2, 2.2, 1.2, P.crate], [4, 4, 2.2, 2.2, 1.2, P.crateDark],
    [-10, 6, 3.4, 1.6, 1.4, P.crate], [10, -2, 1.8, 1.8, 2.4, P.crate],
    [-14, -4, 2.2, 2.2, 1.2, P.crateDark], [14, 8, 2.6, 2.6, 1.1, P.crate],
    [0, 12, 3.0, 1.6, 1.3, P.crate], [-6, 14, 2.2, 2.2, 1.2, P.crateDark],
    [8, 16, 2.2, 2.2, 1.2, P.crate], [-20, 10, 2.4, 2.4, 1.1, P.crate],
    [20, 12, 2.4, 2.4, 1.1, P.crateDark], [-26, 2, 2.0, 2.0, 2.2, P.crate],
    [26, 0, 2.0, 2.0, 2.2, P.crateDark],
  ];
  for (const [x, z, w, d, h, color] of midCrates) {
    box(scene, solids, colliders, { x, z, w, d, h, color });
  }

  // --- South plaza: spawn cover and a fuel drum cluster. ---
  box(scene, solids, colliders, { x: -12, z: 20, w: 2.4, d: 2.4, h: 1.2, color: P.crate });
  box(scene, solids, colliders, { x: 12, z: 20, w: 2.4, d: 2.4, h: 1.2, color: P.crateDark });
  box(scene, solids, colliders, { x: 0, z: 24, w: 4.2, d: 1.6, h: 1.3, color: P.crate });
  const drumMat = mat('#8a2f2f', 0.5);
  for (const [x, z] of [[-18, 22], [-17, 23.2], [18, 22]]) {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.3, 14), drumMat);
    drum.position.set(x, 0.65, z);
    drum.castShadow = true;
    scene.add(drum);
    solids.push(drum);
    colliders.push({ minX: x - 0.55, maxX: x + 0.55, minZ: z - 0.55, maxZ: z + 0.55, minY: 0, maxY: 1.3 });
  }

  // --- Site markers: glowing floor rings + floating letters. ---
  function makeSiteMarker(name, center, color) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.2, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(center.x, 0.03, center.z);
    scene.add(ring);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(2.6, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.1, side: THREE.DoubleSide }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(center.x, 0.025, center.z);
    scene.add(disc);
    // Floating letter made of boxes (no font assets): A and B as block letters.
    const letter = new THREE.Group();
    const lm = new THREE.MeshBasicMaterial({ color });
    const bar = (w, h, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.2), lm);
      m.position.set(x, y, z);
      letter.add(m);
    };
    if (name === 'A') {
      bar(0.25, 2.2, -0.5, 0, 0); bar(0.25, 2.2, 0.5, 0, 0);
      bar(1.25, 0.25, 0, 1, 0); bar(1.0, 0.25, 0, 0, 0);
    } else {
      bar(0.25, 2.2, -0.5, 0, 0); bar(1.0, 0.25, 0, 1, 0);
      bar(1.0, 0.25, 0, 0, 0); bar(1.0, 0.25, 0, -1, 0);
      bar(0.25, 1.0, 0.5, 0.5, 0); bar(0.25, 1.0, 0.5, -0.5, 0);
    }
    letter.position.set(center.x, 4.4, center.z);
    scene.add(letter);
    siteMarkers[name] = { ring, disc, letter, center, color };
  }
  makeSiteMarker('A', { x: 27, z: -16 }, P.siteA);
  makeSiteMarker('B', { x: -26, z: -15 }, P.siteB);

  // --- Dusk sky: a gradient dome, low sun disc, distant skyline, light poles.
  // The gradient is painted on a canvas at runtime — no image asset is fetched.
  {
    const canvasEl = document.createElement('canvas');
    canvasEl.width = 4;
    canvasEl.height = 256;
    const g = canvasEl.getContext('2d');
    const gradient = g.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, '#1c2340');
    gradient.addColorStop(0.45, '#3a3a5e');
    gradient.addColorStop(0.68, '#b45a30');
    gradient.addColorStop(0.78, '#e8823c');
    gradient.addColorStop(0.85, '#2a2f45');
    gradient.addColorStop(1, '#1b1e2e');
    g.fillStyle = gradient;
    g.fillRect(0, 0, 4, 256);
    const skyTex = new THREE.CanvasTexture(canvasEl);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(160, 24, 16),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
    );
    scene.add(dome);
  }
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(6, 32),
    new THREE.MeshBasicMaterial({ color: '#ff9a3c', fog: false }),
  );
  sun.position.set(-60, 14, -90);
  sun.lookAt(0, 6, 0);
  scene.add(sun);
  const skylineMat = mat('#232742', 1);
  const skyline = [[-70, -60, 14, 30], [-30, -70, 20, 24], [10, -72, 16, 34], [50, -64, 22, 26], [80, -50, 12, 30]];
  for (const [x, z, w, h] of skyline) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 4), skylineMat);
    b.position.set(x, h / 2 - 1, z);
    scene.add(b);
  }
  const poleMat = mat(P.hairline, 0.6);
  const lampMat = new THREE.MeshBasicMaterial({ color: '#ffd27a' });
  const lamps = [];
  for (const [x, z] of [[-16, 8], [16, 8], [-16, -14], [16, -14]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 8), poleMat);
    pole.position.set(x, 3, z);
    pole.castShadow = true;
    scene.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), lampMat);
    lamp.position.set(x, 6.1, z);
    scene.add(lamp);
    lamps.push(lamp);
    const light = new THREE.PointLight(0xffc46b, 30, 22, 1.8);
    light.position.set(x, 5.8, z);
    scene.add(light);
  }

  // --- Lighting: warm low sun + cool ambient fill. ---
  const sunLight = new THREE.DirectionalLight(0xff9a50, 3.2);
  sunLight.position.set(-40, 26, -30);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -45;
  sunLight.shadow.camera.right = 45;
  sunLight.shadow.camera.top = 35;
  sunLight.shadow.camera.bottom = -35;
  sunLight.shadow.camera.far = 140;
  scene.add(sunLight);
  scene.add(new THREE.HemisphereLight(0x9aa0c8, 0x4a3a28, 1.5));

  // --- Bot navigation graph: lanes, corners, site holds. ---
  // Nodes: [x, z]; edges connect neighbours the bots may walk between.
  const nodes = [
    [0, 20], [-12, 20], [12, 20],          // 0-2 south plaza / spawns
    [-14, 8], [0, 8], [14, 8],             // 3-5 mid-south
    [-14, -2], [0, -2], [14, -2],          // 6-8 mid
    [-14, -12], [0, -12], [14, -12],       // 9-11 mid-north
    [-26, -15], [-20, -12],                // 12-13 site B approach + hold
    [20, -16], [27, -16], [32, -10],       // 14-16 site A approach + hold
    [0, -20], [-8, -20], [8, -20],         // 17-19 north lane (bot spawns)
    [-26, 2], [26, 2],                     // 20-21 flank lanes
    [-20, -20], [20, -20],                 // 22-23 north corners
  ];
  const edges = [
    [0, 1], [0, 2], [0, 4], [1, 3], [2, 5], [3, 4], [4, 5],
    [3, 6], [4, 7], [5, 8], [6, 7], [7, 8], [6, 9], [7, 10], [8, 11],
    [9, 10], [10, 11], [9, 12], [10, 17], [11, 14], [12, 13], [13, 9],
    [14, 15], [15, 16], [14, 11], [16, 11], [17, 18], [17, 19], [18, 10],
    [19, 10], [17, 22], [19, 23], [22, 9], [23, 11], [3, 20], [5, 21],
    [20, 12], [21, 14], [1, 20], [2, 21],
  ];
  const waypoints = { nodes, edges };

  return {
    colliders,
    solids,
    waypoints,
    sites: {
      A: { name: 'A', center: { x: 27, z: -16 }, radius: 4.2, color: P.siteA },
      B: { name: 'B', center: { x: -26, z: -15 }, radius: 4.2, color: P.siteB },
    },
    playerSpawn: { x: 0, z: 21, yaw: 0 },
    botSpawns: [
      { x: -8, z: -20 }, { x: 0, z: -21 }, { x: 8, z: -20 },
      { x: -20, z: -20 }, { x: 20, z: -20 },
    ],
    bounds: YARD,
    update(t) {
      // Site rings breathe; the crane hook sways; lamps flicker faintly.
      for (const key of Object.keys(siteMarkers)) {
        const m = siteMarkers[key];
        const pulse = 0.45 + 0.2 * Math.sin(t * 2.2);
        m.ring.material.opacity = pulse;
        m.letter.position.y = 4.4 + Math.sin(t * 1.4) * 0.15;
      }
      hook.position.x = 2 + Math.sin(t * 0.5) * 0.6;
      hook.position.z = -7 + Math.cos(t * 0.37) * 0.4;
      cable.position.x = hook.position.x;
      cable.position.z = hook.position.z;
      for (const lamp of lamps) lamp.material.color.setHex(0xffd27a);
      void materials;
    },
  };
}
