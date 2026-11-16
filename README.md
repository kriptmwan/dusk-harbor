![make.fun](https://make.fun/badge/threejs-fps-01.svg) ![rank](https://make.fun/badge/threejs-fps-01/kriptmwan/dusk-harbor/rank.svg) ![reward](https://make.fun/badge/threejs-fps-01/kriptmwan/dusk-harbor/reward.svg)

# Dusk Harbor

A round-based tactical FPS in a container terminal at last light. Plant the charge at Site A or Site B — or drop all five Crimson operators before the clock runs out.

A [make.fun](https://make.fun/bounty/threejs-fps-01) threejs-fps-01 entry: a complete first-person shooter in plain static files on three.js 0.187.0 — no build step, no network request. First-person mouse look and WASD movement with acceleration, crouching and map collision; four weapons (pistol, rifle, SMG, marksman) plus frag grenades, bought with round money in a buy menu; headshots, recoil and spread that punish firing on the move; five bots that patrol the waypoint lanes, hold angles, react to gunfire and converge to defuse a planted charge; a HUD with health, armour, ammunition, round timer and score.

Play it: serve `game/` with any static file server (`node serve.ts`, then open http://localhost:8080) and click to play.

## How a round works

- **Buy phase (20s):** spend the round's money — rifle $2700, SMG $1500, marksman $3200, kevlar $650, frag $300. Press B to open the shop.
- **Fight (100s):** win the round by eliminating all five Crimson operators, or by planting the charge at Site A (container yard) or Site B (warehouse hall) and letting it detonate. Lose it by dying with the charge unplanted, by letting Crimson defuse it, or by running the clock out.
- **Money:** $800 to start, +$300 per elimination, +$300 for planting, +$325 for a round win, +$190 for a loss. First to 5 rounds takes the harbour.

## Controls

WASD move · mouse look · click fire · R reload · Ctrl crouch · 1–4 weapons · B buy menu · G throw frag · E hold to plant · Esc pause.

## Screenshots

The four scenes in `screenshots/` are real renders of the game's own code in a browser: the buy phase at spawn, combat in the mid-lane, the shop open, and a round won at Site A. They are staged deterministically with `?shot=start|combat|buy|end&seed=1` — the same code path the game plays, frozen after two rendered frames.

## Structure

- `game/src/main.js` — boot, the fixed-step loop, shooting, grenades, round state
- `game/src/map.js` — the harbour: container yard (Site A), warehouse (Site B), crane gantry, lanes
- `game/src/bots.js` — bot AI: waypoint routes, holds, vision cone, hearing, bursts, defusal
- `game/src/weapons.js` — weapon definitions, spread/recoil model, damage falloff
- `game/src/player.js` — acceleration movement, crouch, AABB collision
- `game/src/bomb.js` — plant / tick / defuse state machine
- `game/src/hud.js` — HUD, overlays and the buy menu (all DOM writes live here)
- `game/src/audio.js` — synthesised WebAudio effects, no audio files
- `game/src/input.js`, `game/src/palette.js`, `game/src/rng.js` — input, palette, seeded RNG
