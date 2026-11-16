// Dusk Harbor — boot, the one loop, and the round state machine.
// A fixed 60 Hz simulation feeds rendering at the display's rate.
// ?shot=start|combat|buy|end with &seed=N sets up a deterministic frame for
// a capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE as P } from './palette.js';
import { mulberry32, range } from './rng.js';
import { createMap } from './map.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { WEAPONS, GRENADE, createWeaponSet, damageAt } from './weapons.js';
import { createBots } from './bots.js';
import { createBomb, BOMB_TIMER } from './bomb.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const BUY_PHASE = 20;
const ROUND_TIME = 100;
const ROUNDS_TO_WIN = 5;
const MAX_ROUNDS = 9;
const START_MONEY = 800;
const WIN_BONUS = 325;
const LOSS_BONUS = 190;
const KILL_BONUS = 300;
const PLANT_BONUS = 300;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(shot ? seed : (Date.now() % 2147483647));

// --- Renderer, scene, camera. ---
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(P.canvas);
scene.fog = new THREE.Fog(new THREE.Color(P.canvas), 30, 95);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 220);
scene.add(camera);

const map = createMap(scene);
const audio = createAudio();
const hud = createHud();
const player = createPlayer(map.colliders, map.bounds);
const weapons = createWeaponSet();
const bots = createBots(scene, map, random);
const bomb = createBomb(scene, map.sites);
const input = createInput(renderer.domElement, onLockChange);

const raycaster = new THREE.Raycaster();
raycaster.far = 120;
const losRaycaster = new THREE.Raycaster();
losRaycaster.far = 60;
const tmpDir = new THREE.Vector3();
const tmpFrom = new THREE.Vector3();
const tmpTo = new THREE.Vector3();
const tmpHit = new THREE.Vector3();

// --- Viewmodel: a low-poly rifle the player carries, with kick and bob. ---
const viewmodel = new THREE.Group();
{
  const dark = new THREE.MeshStandardMaterial({ color: '#3d424f', roughness: 0.5, metalness: 0.5 });
  const mid = new THREE.MeshStandardMaterial({ color: '#545a68', roughness: 0.6, metalness: 0.3 });
  const amber = new THREE.MeshStandardMaterial({ color: P.accent, roughness: 0.4, metalness: 0.2 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.55), dark);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.42), mid);
  barrel.position.set(0, 0.02, -0.45);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.1), mid);
  mag.position.set(0, -0.14, -0.05);
  mag.rotation.x = 0.25;
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.1), amber);
  sight.position.set(0, 0.09, -0.1);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.22), dark);
  stock.position.set(0, 0.01, 0.34);
  viewmodel.add(body, barrel, mag, sight, stock);
  viewmodel.position.set(0.26, -0.24, -0.5);
  camera.add(viewmodel);
}
const muzzle = new THREE.Object3D();
muzzle.position.set(0.26, -0.2, -1.05);
camera.add(muzzle);
const muzzleFlash = new THREE.Mesh(
  new THREE.PlaneGeometry(0.22, 0.22),
  new THREE.MeshBasicMaterial({ color: P.muzzle, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
);
muzzleFlash.position.copy(muzzle.position);
camera.add(muzzleFlash);
const muzzleLight = new THREE.PointLight(0xffc46b, 0, 9, 1.6);
muzzleLight.position.copy(muzzle.position);
camera.add(muzzleLight);
let muzzleTimer = 0;
let viewKick = 0;
let bobPhase = 0;

// --- Tracers: a small pool of stretched boxes, reused, never allocated per shot. ---
const tracers = [];
{
  const geo = new THREE.BoxGeometry(0.02, 0.02, 1);
  const tracerMat = new THREE.MeshBasicMaterial({ color: P.tracer, transparent: true, opacity: 0 });
  for (let i = 0; i < 10; i += 1) {
    const mesh = new THREE.Mesh(geo, tracerMat.clone());
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
}
let tracerIndex = 0;
function spawnTracer(from, to) {
  const t = tracers[tracerIndex];
  tracerIndex = (tracerIndex + 1) % tracers.length;
  tmpDir.copy(to).sub(from);
  const len = tmpDir.length();
  if (len < 0.1) return;
  t.mesh.position.copy(from).addScaledVector(tmpDir, 0.5);
  t.mesh.lookAt(to);
  t.mesh.scale.set(1, 1, len);
  t.mesh.material.opacity = 0.85;
  t.mesh.visible = true;
  t.life = 0.07;
}

// --- Explosion particles: one reusable burst. ---
const particles = [];
{
  const geo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
  const pMat = new THREE.MeshBasicMaterial({ color: '#ff9a3c', transparent: true });
  for (let i = 0; i < 28; i += 1) {
    const mesh = new THREE.Mesh(geo, pMat.clone());
    mesh.visible = false;
    scene.add(mesh);
    particles.push({ mesh, vel: new THREE.Vector3(), life: 0 });
  }
}
const explosionLight = new THREE.PointLight(0xff8a30, 0, 26, 1.4);
scene.add(explosionLight);
function spawnExplosion(at) {
  for (const p of particles) {
    p.mesh.position.copy(at);
    p.vel.set((random() - 0.5) * 14, random() * 10 + 2, (random() - 0.5) * 14);
    p.mesh.material.opacity = 1;
    p.mesh.visible = true;
    p.life = 0.7 + random() * 0.4;
  }
  explosionLight.position.copy(at).y += 1.5;
  explosionLight.intensity = 220;
  audio.explosion();
}

// --- Grenades in flight. ---
const grenades = [];

// --- Match state: one object, the single source of truth. ---
const match = {
  phase: 'menu', // menu | buy | fight | roundEnd | matchEnd
  round: 1,
  wins: 0,
  losses: 0,
  money: START_MONEY,
  kills: 0,
  health: 100,
  armor: 0,
  grenadeCount: 0,
  phaseTimer: BUY_PHASE,
  roundEndTimer: 0,
  playerAlive: true,
  plantedByPlayer: false,
  roundWon: false,
  roundDetail: '',
  started: false,
  frozen: false,
  stepCount: 0,
  prevFiring: false,
};

function setPhase(phase, timer) {
  match.phase = phase;
  match.phaseTimer = timer;
}

function startRound() {
  bots.reset(random);
  bomb.reset();
  player.reset(map.playerSpawn.x, map.playerSpawn.z, map.playerSpawn.yaw);
  weapons.refill();
  match.health = 100;
  // Armour bought last round carries over; only the round state resets.
  match.grenadeCount = 0;
  match.playerAlive = true;
  match.plantedByPlayer = false;
  match.phaseTimer = BUY_PHASE;
  match.phase = 'buy';
  hud.setRound(match.round);
  hud.setScore(match.wins, match.losses);
  hud.setMoney(match.money);
  hud.setHealth(match.health, match.armor);
  hud.setGrenades(0);
  hud.setBombStatus('', false);
  hud.setAlive(1, 5);
  hud.setAmmo(weapons.state().mag, weapons.state().reserve, false);
  hud.setWeaponName(weapons.def().name);
  hud.showBuy(match.money, weapons.owned, 0, match.armor > 0);
  hud.banner(`Round ${match.round}`, 'Buy phase — press B to open the shop', 2400);
}

function endRound(win, detail) {
  match.roundWon = win;
  match.roundDetail = detail;
  if (win) {
    match.wins += 1;
    match.money += WIN_BONUS;
  } else {
    match.losses += 1;
    match.money += LOSS_BONUS;
  }
  audio[win ? 'roundWin' : 'roundLoss']();
  hud.setScore(match.wins, match.losses);
  hud.setMoney(match.money);
  hud.hideBuy();
  hud.banner(win ? 'Round won' : 'Round lost', detail, 3400);
  setPhase('roundEnd', 4);
}

function endMatch() {
  const win = match.wins >= ROUNDS_TO_WIN;
  const detail = `Final score ${match.wins}–${match.losses} · ${match.kills} eliminations · $${match.money} banked.`;
  hud.hideBuy();
  hud.showOverlay('matchEnd', { win, detail });
  input.releaseLock();
  setPhase('matchEnd', 0);
}

function nextRoundOrMatch() {
  if (match.wins >= ROUNDS_TO_WIN || match.losses >= ROUNDS_TO_WIN || match.round >= MAX_ROUNDS) {
    endMatch();
    return;
  }
  match.round += 1;
  startRound();
}

function resetMatch() {
  match.round = 1;
  match.wins = 0;
  match.losses = 0;
  match.money = START_MONEY;
  match.kills = 0;
  match.armor = 0;
  // Fresh loadout: pistol only.
  for (const id of Object.keys(weapons.owned)) {
    if (id !== 'pistol') delete weapons.owned[id];
  }
  weapons.select('pistol');
  hud.setWeaponName(weapons.def().name);
  startRound();
}

// --- Line of sight: true when no solid stands between two points. ---
function hasLineOfSight(from, to) {
  tmpDir.copy(to).sub(from);
  const dist = tmpDir.length();
  if (dist < 0.01) return true;
  losRaycaster.set(from, tmpDir.normalize());
  losRaycaster.far = dist;
  return losRaycaster.intersectObjects(map.solids, false).length === 0;
}
// --- Shooting: the player fires one round from the camera. ---
function playerShoot() {
  const result = weapons.tryFire();
  if (result === 'busy') return;
  if (result === 'empty') {
    audio.dryFire();
    weapons.reload();
    return;
  }
  const def = weapons.def();
  camera.getWorldDirection(tmpDir);
  const spread = weapons.spread(player.groundSpeed(), player.state.crouched);
  tmpDir.x += (random() * 2 - 1) * spread;
  tmpDir.y += (random() * 2 - 1) * spread;
  tmpDir.z += (random() * 2 - 1) * spread;
  tmpDir.normalize();
  muzzle.getWorldPosition(tmpFrom);
  // Matrices must be current: staged shots fire before the first render,
  // when every mesh still carries the identity matrix.
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, tmpDir);
  const shootables = map.solids.concat(bots.hitMeshes());
  const hit = raycaster.intersectObjects(shootables, false)[0];
  const end = hit ? hit.point : tmpTo.copy(camera.position).addScaledVector(tmpDir, 90);
  spawnTracer(tmpFrom, end);
  muzzleFlash.material.opacity = 1;
  muzzleFlash.rotation.z = random() * Math.PI;
  muzzleLight.intensity = 26;
  muzzleTimer = 0.05;
  viewKick = def.kick;
  player.addRecoil(def.recoil * (0.8 + random() * 0.4), (random() * 2 - 1) * def.recoil * 0.4);
  audio.shot(def.sound);
  bots.hearNoise(player.state.position.x, player.state.position.z);
  if (hit && hit.object.userData.bot) {
    const bot = hit.object.userData.bot;
    const head = hit.object.userData.part === 'head';
    const damage = damageAt(def, hit.distance, head);
    const killed = bots.damage(bot, damage);
    audio[head ? 'kill' : 'hit']();
    hud.hitMarker(killed);
    if (killed) {
      match.kills += 1;
      match.money += KILL_BONUS;
      hud.setMoney(match.money);
      hud.feedLine(`<b>You</b> eliminated <b>${bot.name}</b>${head ? ' — headshot' : ''}`);
      hud.setAlive(1, bots.aliveCount());
    }
  }
  hud.setAmmo(weapons.state().mag, weapons.state().reserve, false);
}

// --- Bot fire: a burst round resolved against the player. ---
function onBotShot(bot) {
  if (!match.playerAlive || match.phase !== 'fight') return;
  bot.mesh.gun.getWorldPosition(tmpFrom);
  const chest = tmpTo.copy(player.state.position);
  chest.y += player.state.eye - 0.25;
  const dist = tmpFrom.distanceTo(chest);
  // Hit chance: close and still is dangerous; far, moving and crouched is safe.
  let chance = 0.46 - dist * 0.007;
  if (player.groundSpeed() > 2) chance -= 0.12;
  if (player.state.crouched) chance -= 0.08;
  if (match.stepCount * FIXED_STEP - bot.seenAt < 0.5) chance -= 0.05;
  const hitRoll = random() < Math.max(0.05, chance);
  if (hitRoll) {
    spawnTracer(tmpFrom, chest);
    damagePlayer(9 + random() * 9, bot.name);
  } else {
    const miss = chest.clone();
    miss.x += (random() * 2 - 1) * 1.6;
    miss.y += (random() * 2 - 1) * 1.2;
    miss.z += (random() * 2 - 1) * 1.6;
    spawnTracer(tmpFrom, miss);
  }
  audio.shot('enemy', true);
}

function damagePlayer(amount, source) {
  if (!match.playerAlive) return;
  let remaining = amount;
  if (match.armor > 0) {
    const absorbed = Math.min(match.armor, amount * 0.4);
    match.armor -= absorbed;
    remaining -= absorbed;
  }
  match.health -= remaining;
  audio.hurt();
  hud.damageFlash();
  hud.setHealth(match.health, match.armor);
  if (match.health <= 0) {
    match.health = 0;
    match.playerAlive = false;
    hud.setHealth(0, match.armor);
    hud.setAlive(0, bots.aliveCount());
    hud.feedLine(`<b>${source}</b> eliminated <b>You</b>`);
    if (bomb.state.status !== 'planted') {
      endRound(false, 'You were eliminated before the charge was planted.');
    } else {
      hud.banner('You are down', 'The charge is still ticking…', 3000);
    }
  }
}

function throwGrenade() {
  if (match.grenadeCount <= 0 || match.phase !== 'fight' || !match.playerAlive) return;
  match.grenadeCount -= 1;
  hud.setGrenades(match.grenadeCount);
  audio.grenadePin();
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: '#3a4a2f', roughness: 0.6 }),
  );
  camera.getWorldDirection(tmpDir);
  mesh.position.copy(camera.position).addScaledVector(tmpDir, 0.6);
  scene.add(mesh);
  grenades.push({
    mesh,
    vel: tmpDir.clone().multiplyScalar(16).add(new THREE.Vector3(0, 5, 0)),
    fuse: GRENADE.fuse,
  });
}

function explodeGrenade(g) {
  scene.remove(g.mesh);
  const at = g.mesh.position.clone();
  spawnExplosion(at);
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const d = Math.hypot(bot.position.x - at.x, bot.position.z - at.z);
    if (d < GRENADE.radius) {
      const damage = GRENADE.damage * (1 - (d / GRENADE.radius) * 0.7);
      const killed = bots.damage(bot, damage);
      if (killed) {
        match.kills += 1;
        match.money += KILL_BONUS;
        hud.setMoney(match.money);
        hud.feedLine(`<b>You</b> eliminated <b>${bot.name}</b> — frag`);
        hud.setAlive(match.playerAlive ? 1 : 0, bots.aliveCount());
      }
    }
  }
  if (match.playerAlive) {
    const d = Math.hypot(player.state.position.x - at.x, player.state.position.z - at.z);
    if (d < GRENADE.radius) damagePlayer(GRENADE.damage * 0.5 * (1 - (d / GRENADE.radius) * 0.6), 'Frag');
  }
  bots.hearNoise(at.x, at.z);
}

function onBombExplode() {
  spawnExplosion(bomb.state.position.clone().setY(1));
  hud.setBombStatus('', false);
  if (match.phase === 'fight') endRound(true, 'The charge detonated at the site.');
}

function onBotDefused() {
  bomb.defuse();
  hud.setBombStatus('', false);
  if (match.phase === 'fight') endRound(false, 'Crimson defused the charge.');
}

function buyItem(id) {
  if (match.phase !== 'buy') { audio.denied(); return; }
  const price = id === 'armor' ? 650 : id === 'grenade' ? GRENADE.price : WEAPONS[id].price;
  if (match.money < price) { audio.denied(); return; }
  if (id === 'armor') {
    if (match.armor > 0) { audio.denied(); return; }
    match.armor = 100;
    match.money -= price;
    hud.setHealth(match.health, match.armor);
  } else if (id === 'grenade') {
    if (match.grenadeCount >= GRENADE.max) { audio.denied(); return; }
    match.grenadeCount += 1;
    match.money -= price;
    hud.setGrenades(match.grenadeCount);
  } else {
    if (weapons.has(id)) { audio.denied(); return; }
    weapons.buy(id);
    match.money -= price;
    hud.setWeaponName(weapons.def().name);
    hud.setAmmo(weapons.state().mag, weapons.state().reserve, false);
  }
  match.money = Math.max(0, match.money);
  hud.setMoney(match.money);
  audio.buy();
  hud.showBuy(match.money, weapons.owned, match.grenadeCount, match.armor > 0);
}

// --- Overlay / lock handling. ---
function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    match.started = true;
    hud.hideOverlay();
    audio.unlock();
  } else if (match.phase === 'fight' || match.phase === 'buy') {
    hud.showOverlay('paused');
  }
}

hud.onPlay(() => {
  if (shot) return;
  if (match.phase === 'matchEnd') resetMatch();
  else if (match.phase === 'menu') startRound();
  hud.hideOverlay();
  // During the buy phase the pointer stays free so the shop can be clicked;
  // the shop's Close button (or B) takes the lock when the player is ready.
  if (match.phase !== 'buy') input.requestLock();
});
hud.onBuyRequest(buyItem);
hud.onBuyClose(() => {
  hud.hideBuy();
  input.requestLock();
});

// --- One fixed simulation step. ---
function step(dt) {
  match.stepCount += 1;
  // Keep world matrices current: bot vision raycasts read them every step.
  scene.updateMatrixWorld(true);
  map.update(match.stepCount * FIXED_STEP);

  if (match.phase === 'buy') {
    match.phaseTimer -= dt;
    if (match.phaseTimer <= 0) {
      hud.hideBuy();
      setPhase('fight', ROUND_TIME);
      hud.banner(`Round ${match.round}`, 'Plant the charge at A or B — or eliminate Crimson', 2600);
      if (!input.state.locked) hud.showOverlay('paused');
    }
  } else if (match.phase === 'fight') {
    match.phaseTimer -= dt;
    if (match.phaseTimer <= 0 && bomb.state.status !== 'planted') {
      endRound(false, 'Time expired with the charge unplanted.');
    }
  } else if (match.phase === 'roundEnd') {
    match.roundEndTimer += dt;
    if (match.roundEndTimer >= 4) {
      match.roundEndTimer = 0;
      nextRoundOrMatch();
    }
  }

  const fighting = match.phase === 'fight' || match.phase === 'buy';
  if (fighting && match.playerAlive && !match.frozen) {
    const keys = input.state.keys;
    // Weapon switching.
    if (keys.has('Digit1')) weapons.select('pistol');
    if (keys.has('Digit2') && weapons.has('rifle')) weapons.select('rifle');
    if (keys.has('Digit3') && weapons.has('smg')) weapons.select('smg');
    if (keys.has('Digit4') && weapons.has('marksman')) weapons.select('marksman');
    if (keys.has('KeyR')) weapons.reload();
    if (keys.has('KeyG')) { throwGrenade(); keys.delete('KeyG'); }
    if (keys.has('KeyB')) {
      if (match.phase === 'buy') {
        if (hud.buyOpen) {
          hud.hideBuy();
          input.requestLock();
        } else hud.showBuy(match.money, weapons.owned, match.grenadeCount, match.armor > 0);
        keys.delete('KeyB');
      }
    }
    if (match.phase === 'fight') {
      player.step(dt, keys);
      // Semi-auto weapons fire once per click; automatics keep firing held.
      const firingEdge = input.state.firing && (weapons.def().auto || !match.prevFiring);
      if (firingEdge) playerShoot();
      match.prevFiring = input.state.firing;
    }
    // Planting: hold E inside a site ring.
    const planting = keys.has('KeyE') && match.phase === 'fight';
    const site = bomb.siteAt(player.state.position.x, player.state.position.z);
    if (planting && site && bomb.state.status === 'carried') {
      hud.hint(`Planting at Site ${site.name}… hold E`, 400);
      if (Math.floor(match.stepCount / 30) !== Math.floor((match.stepCount - 1) / 30)) audio.plantBeep();
    } else if (site && bomb.state.status === 'carried' && match.phase === 'fight') {
      hud.hint(`Hold E to plant at Site ${site.name}`, 400);
    }
    bomb.step(dt, {
      planting,
      x: player.state.position.x,
      z: player.state.position.z,
      onExplode: onBombExplode,
    });
    if (bomb.state.status === 'planted' && !match.plantedByPlayer) {
      match.plantedByPlayer = true;
      match.money += PLANT_BONUS;
      hud.setMoney(match.money);
      hud.feedLine('<b>You</b> planted the charge');
      hud.banner('Charge planted', 'Hold the site — 40 seconds to detonation', 3000);
    }
    if (bomb.state.status === 'planted') {
      hud.setBombStatus(`BOMB ${Math.ceil(bomb.state.timer)}s`, true);
      if (Math.floor(bomb.state.timer * 2) !== Math.floor((bomb.state.timer + dt) * 2)) audio.bombTick();
    }
    // Footsteps.
    const speed = player.groundSpeed();
    if (speed > 1 && match.stepCount % 24 === 0) audio.step();
  }

  if (match.phase === 'fight') {
    bots.step({
      time: match.stepCount * FIXED_STEP,
      dt,
      playerPos: match.playerAlive ? player.state.position : null,
      playerAlive: match.playerAlive,
      playerSpeed: player.groundSpeed(),
      playerCrouched: player.state.crouched,
      hasLineOfSight,
      bombPlanted: bomb.state.status === 'planted',
      bombPos: bomb.state.status === 'planted' ? bomb.state.position : null,
      onBotShot,
      onDefused: onBotDefused,
      random,
    });
    // Elimination win: all bots down while the fight is live.
    if (match.phase === 'fight' && bots.aliveCount() === 0) {
      endRound(true, 'All five Crimson operators eliminated.');
    }
  }

  // Grenades fly and tick down.
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const g = grenades[i];
    g.vel.y -= 18 * dt;
    g.mesh.position.addScaledVector(g.vel, dt);
    if (g.mesh.position.y < 0.09) {
      g.mesh.position.y = 0.09;
      g.vel.y = Math.abs(g.vel.y) * 0.35;
      g.vel.x *= 0.6;
      g.vel.z *= 0.6;
    }
    g.fuse -= dt;
    if (g.fuse <= 0) {
      explodeGrenade(g);
      grenades.splice(i, 1);
    }
  }

  weapons.step(dt);

  // HUD readouts.
  hud.setTimer(match.phase === 'buy' ? match.phaseTimer : match.phase === 'fight' ? match.phaseTimer : 0, match.phase);
  hud.setSpread(weapons.spread(player.groundSpeed(), player.state.crouched));
  hud.setAmmo(weapons.state().mag, weapons.state().reserve, weapons.reloading);
}

// --- Frame: consume look, run fixed steps, render. ---
let lastTime = performance.now();
let accumulator = 0;

function syncCamera() {
  camera.position.set(
    player.state.position.x,
    player.state.position.y + player.state.eye,
    player.state.position.z,
  );
  camera.rotation.set(player.cameraPitch(), player.cameraYaw(), 0, 'YXZ');
  // Viewmodel kick and bob.
  viewKick *= 0.86;
  const speed = player.groundSpeed();
  bobPhase += speed * 0.09;
  const bob = Math.min(1, speed / 5) * 0.012;
  viewmodel.position.set(
    0.26 + Math.sin(bobPhase) * bob,
    -0.24 + Math.abs(Math.cos(bobPhase)) * bob - viewKick * 0.03,
    -0.5 + viewKick * 0.09,
  );
  viewmodel.rotation.x = viewKick * 0.22;
  if (muzzleTimer > 0) {
    muzzleTimer -= 1 / 60;
    if (muzzleTimer <= 0) {
      muzzleFlash.material.opacity = 0;
      muzzleLight.intensity = 0;
    }
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  // A fight with no pointer lock is paused: the simulation holds still.
  const pausedFight = match.phase === 'fight' && match.started && !input.state.locked && !shot;
  if (!match.frozen && !pausedFight) {
    const look = input.takeLook();
    if (match.playerAlive && (match.phase === 'fight' || match.phase === 'buy')) {
      player.look(look.x, look.y);
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    // Fade tracers and particles.
    for (const t of tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.mesh.material.opacity = Math.max(0, t.life / 0.07) * 0.85;
        if (t.life <= 0) t.mesh.visible = false;
      }
    }
    for (const p of particles) {
      if (p.life > 0) {
        p.life -= dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        p.vel.y -= 12 * dt;
        p.mesh.material.opacity = Math.max(0, p.life);
        if (p.life <= 0) p.mesh.visible = false;
      }
    }
    if (explosionLight.intensity > 0) explosionLight.intensity *= Math.pow(0.001, dt);
  }
  renderer.render(scene, camera);
}

// --- Deterministic screenshot setups. ---
function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function aimAt(point) {
  const p = player.state;
  const dx = point.x - p.position.x;
  const dy = point.y - (p.position.y + p.eye);
  const dz = point.z - p.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  p.yaw = Math.atan2(-dx, -dz);
  p.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      match.frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  match.started = true;
  if (name === 'start') {
    resetMatch();
    setPhase('buy', BUY_PHASE);
    hud.showBuy(match.money, weapons.owned, 0, false);
    player.reset(0, 21, 0);
    settle(10);
    aimAt(new THREE.Vector3(0, 3, -12));
    hud.setTimer(BUY_PHASE, 'buy');
  } else if (name === 'combat') {
    resetMatch();
    match.wins = 1;
    match.round = 2;
    match.money = 2400;
    match.health = 76;
    match.armor = 40;
    weapons.buy('rifle');
    match.grenadeCount = 1;
    setPhase('fight', 72);
    player.reset(0, 8, 0);
    settle(10);
    // Two bots in the open mid-lane, facing the player.
    const b0 = bots.bots[0];
    const b1 = bots.bots[1];
    b0.position.set(3, 0, -6);
    b0.yaw = Math.PI;
    b0.state = 'hold';
    b0.holdUntil = 999;
    b1.position.set(-4, 0, -9);
    b1.yaw = Math.PI;
    b1.state = 'hold';
    b1.holdUntil = 999;
    const b2 = bots.bots[2];
    b2.position.set(8, 0, -14);
    b2.yaw = Math.PI;
    b2.state = 'hold';
    b2.holdUntil = 999;
    aimAt(new THREE.Vector3(3, 1.68, -6));
    syncCamera();
    // Two headshots: one rifle headshot leaves a bot standing on 4 HP.
    playerShoot();
    settle(8);
    playerShoot();
    hud.banner('Round 2', 'Crimson holds the mid-lane — take them down', 9000);
    hud.setHealth(76, 40);
    hud.setScore(1, 0);
    hud.setRound(2);
    hud.setGrenades(1);
    hud.setAlive(1, 5);
    hud.setTimer(72, 'fight');
  } else if (name === 'buy') {
    resetMatch();
    match.money = 3200;
    setPhase('buy', 14);
    hud.showBuy(3200, weapons.owned, 0, false);
    player.reset(0, 21, 0);
    settle(10);
    aimAt(new THREE.Vector3(-6, 2, -8));
    hud.setMoney(3200);
    hud.setTimer(14, 'buy');
  } else if (name === 'end') {
    resetMatch();
    match.wins = 2;
    match.losses = 1;
    match.round = 4;
    setPhase('roundEnd', 4);
    player.reset(24, -10, 0.6);
    settle(10);
    aimAt(new THREE.Vector3(27, 1.5, -16));
    hud.setScore(2, 1);
    hud.setRound(4);
    hud.setMoney(2725);
    hud.showOverlay('roundEnd', { win: true, detail: 'The charge detonated at Site A.' });
  }
  hud.setAmmo(weapons.state().mag, weapons.state().reserve, false);
  hud.setWeaponName(weapons.def().name);
  // Only the buy shot keeps the shop open; the others show the game itself.
  if (name !== 'buy') hud.hideBuy();
  syncCamera();
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
if (shot) runShot(shot);
else {
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}

// Read-only handle for local play-testing (never used by the game itself).
window.__dusk = { match, bots, weapons, bomb, player, map, camera, raycaster };
