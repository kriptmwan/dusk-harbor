// Enemy bots: five Crimson operators who play the map. Each bot picks a
// route through the waypoint graph, holds an angle, and reacts to what it
// sees and hears. Vision is a cone plus a real line-of-sight raycast; noise
// (gunfire, the bomb) pulls bots toward it. Bots shoot in bursts with an
// accuracy model that rewards the player for moving and crouching.
import * as THREE from 'three';
import { PALETTE as P } from './palette.js';
import { intRange, pick, range } from './rng.js';

const BOT_NAMES = ['Ash', 'Brick', 'Fang', 'Ghost', 'Heron'];
const BOT_SPEED = 3.4;
const BOT_HOLD_SPEED = 1.2;
const SEE_DISTANCE = 48;
const SEE_HALF_FOV = 1.05; // ~60 degrees each side
const REACTION_MIN = 0.35;
const REACTION_MAX = 0.75;

function buildBotMesh(scene, name) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: P.enemy, roughness: 0.85 });
  const darkMat = new THREE.MeshStandardMaterial({ color: P.enemyDark, roughness: 0.9 });
  const skinMat = new THREE.MeshStandardMaterial({ color: '#c9a184', roughness: 0.9 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.32), bodyMat);
  torso.position.y = 1.15;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skinMat);
  head.position.y = 1.68;
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.34), darkMat);
  helmet.position.y = 1.86;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 0.22), darkMat);
  legL.position.set(-0.15, 0.38, 0);
  const legR = legL.clone();
  legR.position.x = 0.15;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.18), bodyMat);
  armL.position.set(-0.36, 1.2, 0.08);
  const armR = armL.clone();
  armR.position.x = 0.36;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.85), darkMat);
  gun.position.set(0.18, 1.32, 0.42);
  for (const mesh of [torso, head, helmet, legL, legR, armL, armR, gun]) {
    mesh.castShadow = true;
    group.add(mesh);
  }
  // A small floating callsign plate, readable at a glance.
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.08, 0.02),
    new THREE.MeshBasicMaterial({ color: P.enemy }),
  );
  plate.position.y = 2.08;
  group.add(plate);
  scene.add(group);
  return { group, head, torso, gun, plate, name };
}

function nearestNode(waypoints, x, z) {
  let best = 0;
  let bestD = Infinity;
  waypoints.nodes.forEach(([nx, nz], i) => {
    const d = (nx - x) * (nx - x) + (nz - z) * (nz - z);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

// Breadth-first path over the waypoint graph, returned as node indices.
function findPath(waypoints, from, to) {
  if (from === to) return [to];
  const prev = new Map([[from, -1]]);
  const queue = [from];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const [a, b] of waypoints.edges) {
      const next = a === current ? b : b === current ? a : -1;
      if (next === -1 || prev.has(next)) continue;
      prev.set(next, current);
      if (next === to) {
        const path = [to];
        let node = to;
        while (prev.get(node) !== -1) { node = prev.get(node); path.unshift(node); }
        return path;
      }
      queue.push(next);
    }
  }
  return [to];
}

export function createBots(scene, map, random) {
  const bots = [];
  const tmp = new THREE.Vector3();
  const toTarget = new THREE.Vector3();

  function spawnBot(index, spawn) {
    const mesh = buildBotMesh(scene, BOT_NAMES[index]);
    mesh.group.position.set(spawn.x, 0, spawn.z);
    const bot = {
      index,
      name: BOT_NAMES[index],
      mesh,
      position: mesh.group.position,
      yaw: 0,
      health: 100,
      alive: true,
      state: 'advance', // advance | hold | engage | investigate | defuse
      path: [],
      pathIndex: 0,
      holdUntil: 0,
      holdNode: -1,
      targetNode: -1,
      seenAt: -10,
      reactionAt: 0,
      burstLeft: 0,
      burstTimer: 0,
      shotTimer: 0,
      defuseProgress: 0,
      investigateAt: null,
      strafeDir: 1,
      strafeTimer: 0,
      walkPhase: random() * Math.PI * 2,
    };
    // First objective: a site to attack, or a mid hold.
    bot.targetNode = pick(random, [15, 13, 10, 11, 7]);
    bot.path = findPath(map.waypoints, nearestNode(map.waypoints, spawn.x, spawn.z), bot.targetNode);
    bot.pathIndex = 0;
    bots.push(bot);
    return bot;
  }

  function reset(seedRandom) {
    for (const bot of bots) scene.remove(bot.mesh.group);
    bots.length = 0;
    map.botSpawns.forEach((spawn, i) => spawnBot(i, spawn));
    void seedRandom;
  }

  function setPath(bot, targetNode) {
    const from = nearestNode(map.waypoints, bot.position.x, bot.position.z);
    bot.path = findPath(map.waypoints, from, targetNode);
    bot.pathIndex = 0;
    bot.targetNode = targetNode;
  }

  function moveToward(bot, x, z, dt, speed) {
    toTarget.set(x - bot.position.x, 0, z - bot.position.z);
    const dist = toTarget.length();
    if (dist < 0.05) return true;
    toTarget.normalize();
    const stepLen = Math.min(dist, speed * dt);
    bot.position.x += toTarget.x * stepLen;
    bot.position.z += toTarget.z * stepLen;
    const targetYaw = Math.atan2(toTarget.x, toTarget.z);
    let dy = targetYaw - bot.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    bot.yaw += dy * Math.min(1, dt * 8);
    bot.walkPhase += dt * speed * 2.4;
    const bob = Math.sin(bot.walkPhase) * 0.03;
    bot.mesh.group.position.y = bob;
    return dist <= 0.35;
  }

  function face(bot, x, z, dt) {
    const targetYaw = Math.atan2(x - bot.position.x, z - bot.position.z);
    let dy = targetYaw - bot.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    bot.yaw += dy * Math.min(1, dt * 10);
  }

  function canSee(bot, playerPos, hasLineOfSight) {
    if (!playerPos) return false;
    tmp.copy(playerPos).sub(bot.position);
    tmp.y = 0;
    const dist = tmp.length();
    if (dist > SEE_DISTANCE || dist < 0.1) return false;
    const facing = new THREE.Vector3(Math.sin(bot.yaw), 0, Math.cos(bot.yaw));
    if (tmp.normalize().dot(facing) < Math.cos(SEE_HALF_FOV) && dist > 4) return false;
    const eye = new THREE.Vector3(bot.position.x, 1.6, bot.position.z);
    const target = new THREE.Vector3(playerPos.x, playerPos.y + 1.2, playerPos.z);
    return hasLineOfSight(eye, target);
  }

  return {
    bots,
    reset,
    aliveCount() { return bots.filter((b) => b.alive).length; },
    hitMeshes() {
      const meshes = [];
      for (const bot of bots) {
        if (!bot.alive) continue;
        bot.mesh.head.userData = { bot, part: 'head' };
        bot.mesh.torso.userData = { bot, part: 'body' };
        meshes.push(bot.mesh.head, bot.mesh.torso);
      }
      return meshes;
    },
    damage(bot, amount) {
      if (!bot.alive) return false;
      bot.health -= amount;
      bot.defuseProgress = 0;
      if (bot.health <= 0) {
        bot.alive = false;
        bot.mesh.group.visible = false;
        return true;
      }
      // Being shot at makes a bot turn toward the shooter and fight back:
      // the caller reports the noise, which pulls nearby bots in.
      return false;
    },
    hearNoise(x, z) {
      for (const bot of bots) {
        if (!bot.alive || bot.state === 'defuse') continue;
        const d = Math.hypot(bot.position.x - x, bot.position.z - z);
        if (d < 30) {
          bot.investigateAt = { x, z };
          if (bot.state !== 'engage') bot.state = 'investigate';
        }
      }
    },
    // One fixed step. ctx: { time, dt, playerPos, playerAlive, playerSpeed,
    // playerCrouched, hasLineOfSight, bombPlanted, bombPos, onBotShot(bot) }
    step(ctx) {
      const { time, dt } = ctx;
      for (const bot of bots) {
        if (!bot.alive) continue;
        const sees = ctx.playerAlive && canSee(bot, ctx.playerPos, ctx.hasLineOfSight);
        if (bot.state === 'engage' && !ctx.playerAlive) {
          bot.state = 'hold';
          bot.holdUntil = time + 2;
        }
        if (sees) {
          bot.seenAt = time;
          if (bot.state !== 'engage') {
            bot.state = 'engage';
            bot.reactionAt = time + range(ctx.random, REACTION_MIN, REACTION_MAX);
            bot.burstLeft = intRange(ctx.random, 3, 5);
          }
        } else if (bot.state === 'engage' && time - bot.seenAt > 1.6) {
          bot.state = 'investigate';
          bot.investigateAt = ctx.playerPos ? { x: ctx.playerPos.x, z: ctx.playerPos.z } : null;
        }

        if (bot.state === 'engage' && ctx.playerAlive) {
          face(bot, ctx.playerPos.x, ctx.playerPos.z, dt);
          bot.strafeTimer -= dt;
          if (bot.strafeTimer <= 0) {
            bot.strafeDir = ctx.random() < 0.5 ? -1 : 1;
            bot.strafeTimer = range(ctx.random, 0.7, 1.6);
          }
          // Strafe sideways while fighting, so the player must track a mover.
          const sx = Math.cos(bot.yaw) * bot.strafeDir;
          const sz = -Math.sin(bot.yaw) * bot.strafeDir;
          moveToward(bot, bot.position.x + sx, bot.position.z + sz, dt, BOT_HOLD_SPEED);
          if (time >= bot.reactionAt) {
            bot.shotTimer -= dt;
            if (bot.burstLeft > 0 && bot.shotTimer <= 0) {
              bot.shotTimer = 0.13;
              bot.burstLeft -= 1;
              ctx.onBotShot(bot);
              if (bot.burstLeft === 0) {
                bot.burstTimer = range(ctx.random, 0.7, 1.4);
                bot.burstLeft = -1; // cooling down
              }
            } else if (bot.burstLeft === -1) {
              bot.burstTimer -= dt;
              if (bot.burstTimer <= 0) bot.burstLeft = intRange(ctx.random, 3, 5);
            }
          }
          continue;
        }

        // Bomb planted: converge on it and defuse.
        if (ctx.bombPlanted && ctx.bombPos) {
          const d = Math.hypot(bot.position.x - ctx.bombPos.x, bot.position.z - ctx.bombPos.z);
          if (d < 2.5) {
            bot.state = 'defuse';
            face(bot, ctx.bombPos.x, ctx.bombPos.z, dt);
            bot.defuseProgress += dt;
            if (bot.defuseProgress >= 4) ctx.onDefused(bot);
            continue;
          }
          if (bot.state !== 'defuse') {
            setPath(bot, nearestNode(map.waypoints, ctx.bombPos.x, ctx.bombPos.z));
            bot.state = 'advance';
          }
        }

        if (bot.state === 'investigate' && bot.investigateAt) {
          const arrived = moveToward(bot, bot.investigateAt.x, bot.investigateAt.z, dt, BOT_SPEED);
          if (arrived) {
            bot.investigateAt = null;
            bot.holdUntil = time + range(ctx.random, 1.5, 3.5);
            bot.state = 'hold';
          }
          continue;
        }

        if (bot.state === 'hold') {
          if (time >= bot.holdUntil) {
            bot.state = 'advance';
            bot.targetNode = pick(ctx.random, [15, 13, 10, 11, 7, 4]);
            setPath(bot, bot.targetNode);
          } else {
            // Hold the angle: slow scan across the lane.
            bot.yaw += Math.sin(time * 0.7 + bot.index) * dt * 0.25;
          }
          continue;
        }

        // Advance along the path; on arrival, hold the angle for a while.
        if (bot.path.length > 0 && bot.pathIndex < bot.path.length) {
          const [nx, nz] = map.waypoints.nodes[bot.path[bot.pathIndex]];
          const arrived = moveToward(bot, nx, nz, dt, BOT_SPEED);
          if (arrived) bot.pathIndex += 1;
          if (bot.pathIndex >= bot.path.length) {
            bot.holdUntil = time + range(ctx.random, 2, 5);
            bot.state = 'hold';
          }
        } else {
          bot.holdUntil = time + 2;
          bot.state = 'hold';
        }
      }

      // Apply facing to meshes (position is the group position already).
      for (const bot of bots) {
        if (!bot.alive) continue;
        bot.mesh.group.rotation.y = bot.yaw;
      }
    },
  };
}
