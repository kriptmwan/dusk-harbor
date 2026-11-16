// Weapons: definitions plus the firing state machine. Damage falls off with
// range, headshots multiply it, and spread grows while moving or firing —
// stopping to aim pays, spraying on the move does not.
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', price: 0, slot: 1,
    damage: 26, headMult: 3.0, range: 42, falloff: 0.45,
    fireRate: 0.16, auto: false, magSize: 12, reserveMax: 48,
    reloadTime: 1.15, baseSpread: 0.006, moveSpread: 0.028, bloom: 0.004,
    recoil: 0.011, kick: 0.35, sound: 'pistol', tracer: '#ffe9b0',
  },
  rifle: {
    id: 'rifle', name: 'VK-7 Rifle', price: 2700, slot: 2,
    damage: 34, headMult: 3.2, range: 60, falloff: 0.5,
    fireRate: 0.105, auto: true, magSize: 30, reserveMax: 90,
    reloadTime: 2.1, baseSpread: 0.004, moveSpread: 0.032, bloom: 0.005,
    recoil: 0.014, kick: 0.55, sound: 'rifle', tracer: '#ffe9b0',
  },
  smg: {
    id: 'smg', name: 'SMG-9', price: 1500, slot: 3,
    damage: 22, headMult: 2.8, range: 34, falloff: 0.35,
    fireRate: 0.075, auto: true, magSize: 32, reserveMax: 96,
    reloadTime: 1.7, baseSpread: 0.009, moveSpread: 0.02, bloom: 0.004,
    recoil: 0.009, kick: 0.4, sound: 'smg', tracer: '#ffe9b0',
  },
  marksman: {
    id: 'marksman', name: 'LR-77 Marksman', price: 3200, slot: 4,
    damage: 85, headMult: 4.0, range: 90, falloff: 0.7,
    fireRate: 0.95, auto: false, magSize: 5, reserveMax: 20,
    reloadTime: 2.6, baseSpread: 0.001, moveSpread: 0.05, bloom: 0.012,
    recoil: 0.05, kick: 1.6, sound: 'marksman', tracer: '#ffd27a',
  },
};

export const GRENADE = { price: 300, max: 2, fuse: 1.5, radius: 7, damage: 110 };

export function createWeaponSet() {
  const owned = { pistol: { mag: 12, reserve: 48 } };
  let current = 'pistol';
  let cooldown = 0;
  let reloading = 0;
  let bloom = 0;

  function def() { return WEAPONS[current]; }
  function state() { return owned[current]; }

  return {
    owned,
    get current() { return current; },
    get reloading() { return reloading > 0; },
    get cooldown() { return cooldown; },
    def,
    state,
    has(id) { return id in owned; },
    buy(id) {
      if (id in owned) return false;
      owned[id] = { mag: WEAPONS[id].magSize, reserve: WEAPONS[id].reserveMax };
      current = id;
      cooldown = 0;
      reloading = 0;
      bloom = 0;
      return true;
    },
    select(id) {
      if (!(id in owned) || id === current) return false;
      current = id;
      reloading = 0;
      cooldown = 0.1;
      bloom = 0;
      return true;
    },
    refill() {
      for (const id of Object.keys(owned)) {
        owned[id].mag = WEAPONS[id].magSize;
        owned[id].reserve = WEAPONS[id].reserveMax;
      }
      reloading = 0;
      cooldown = 0;
      bloom = 0;
    },
    // Spread now, in radians: base + movement + bloom from recent shots.
    spread(moveSpeed, crouched) {
      const d = def();
      const move = Math.min(1, moveSpeed / 5.5);
      let s = d.baseSpread + d.moveSpread * move + bloom;
      if (crouched) s *= 0.7;
      return s;
    },
    // Returns 'fire' | 'empty' | 'busy'. Caller performs the raycast.
    tryFire() {
      if (cooldown > 0 || reloading > 0) return 'busy';
      const s = state();
      if (s.mag <= 0) return 'empty';
      s.mag -= 1;
      cooldown = def().fireRate;
      bloom = Math.min(0.05, bloom + def().bloom);
      return 'fire';
    },
    reload() {
      const d = def();
      const s = state();
      if (reloading > 0 || s.mag >= d.magSize || s.reserve <= 0) return false;
      reloading = d.reloadTime;
      return true;
    },
    step(dt) {
      if (cooldown > 0) cooldown -= dt;
      bloom = Math.max(0, bloom - dt * 0.055);
      if (reloading > 0) {
        reloading -= dt;
        if (reloading <= 0) {
          reloading = 0;
          const d = def();
          const s = state();
          const need = d.magSize - s.mag;
          const take = Math.min(need, s.reserve);
          s.mag += take;
          s.reserve -= take;
        }
      }
    },
  };
}

// Damage of one hit at a distance, before the head multiplier.
export function damageAt(def, distance, head) {
  const t = Math.min(1, distance / def.range);
  const falloff = 1 - (1 - def.falloff) * t;
  const base = def.damage * falloff;
  return head ? base * def.headMult : base;
}
