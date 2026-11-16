// HUD: every DOM read and write lives here, so the simulation never touches
// the document. Overlays: start / pause / round end / match end, plus the
// buy menu, which is the only panel that takes pointer input.
import { GRENADE, WEAPONS } from './weapons.js';

function $(id) { return document.getElementById(id); }

export function createHud() {
  const els = {
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    timer: $('timer'),
    bombStatus: $('bomb-status'),
    scoreUs: $('score-us'),
    scoreThem: $('score-them'),
    aliveUs: $('alive-us'),
    aliveThem: $('alive-them'),
    roundNum: $('round-num'),
    feed: $('feed'),
    health: $('health'),
    healthFill: $('health-fill'),
    armorLabel: $('armor-label'),
    money: $('money'),
    weaponName: $('weapon-name'),
    ammo: $('ammo'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    grenades: $('grenades'),
    banner: $('banner'),
    bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'),
    hint: $('hint'),
    damage: $('damage'),
    overlay: $('overlay'),
    overlayTitle: $('overlay-title'),
    overlayCopy: $('overlay-copy'),
    play: $('play'),
    buy: $('buy'),
    buyBalance: $('buy-balance'),
    shop: $('shop'),
    buyClose: $('buy-close'),
  };
  let bannerTimer = 0;
  let hintTimer = 0;
  let hitTimer = 0;
  let onBuy = null;

  const ARMOR_PRICE = 650;

  function buildShop() {
    els.shop.innerHTML = '';
    const entries = [
      ...Object.values(WEAPONS).filter((w) => w.price > 0).map((w) => ({
        key: String(w.slot), id: w.id, name: w.name, price: w.price,
        desc: `${w.magSize} rounds · ${w.damage} dmg · ${w.auto ? 'auto' : 'semi'}`,
      })),
      { key: '5', id: 'armor', name: 'Kevlar Vest', price: ARMOR_PRICE, desc: 'Blocks 40% of incoming damage' },
      { key: '6', id: 'grenade', name: 'Frag Grenade', price: GRENADE.price, desc: `Blast radius ${GRENADE.radius} m · max ${GRENADE.max}` },
    ];
    for (const entry of entries) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.id = entry.id;
      button.innerHTML = `<span class="key">${entry.key}</span><span class="name"></span><span class="desc"></span><span class="price"></span>`;
      button.querySelector('.name').textContent = entry.name;
      button.querySelector('.desc').textContent = entry.desc;
      button.querySelector('.price').textContent = `$${entry.price}`;
      button.addEventListener('click', () => { if (onBuy) onBuy(entry.id); });
      els.shop.appendChild(button);
    }
  }
  buildShop();

  return {
    onPlay(callback) { els.play.addEventListener('click', callback); },
    onBuyRequest(callback) { onBuy = callback; },
    onBuyClose(callback) { els.buyClose.addEventListener('click', callback); },

    setHealth(hp, armor) {
      els.health.textContent = String(Math.max(0, Math.ceil(hp)));
      els.health.classList.toggle('low', hp <= 30);
      els.healthFill.style.width = `${Math.max(0, Math.min(100, hp))}%`;
      els.healthFill.classList.toggle('low', hp <= 30);
      els.armorLabel.textContent = armor > 0 ? `ARMOR ${Math.ceil(armor)}` : '';
    },
    setAmmo(mag, reserve, reloading) {
      els.ammoMag.textContent = String(mag);
      els.ammoReserve.textContent = `/ ${reserve}`;
      els.ammo.classList.toggle('empty', mag === 0);
      els.ammo.classList.toggle('reloading', reloading);
    },
    setWeaponName(name) { els.weaponName.textContent = name; },
    setGrenades(count) { els.grenades.textContent = `Frag × ${count}  ·  [G] throw`; },
    setMoney(amount) {
      els.money.textContent = String(amount);
      els.buyBalance.textContent = `$${amount}`;
    },
    setTimer(seconds, phase) {
      const s = Math.max(0, Math.ceil(seconds));
      els.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      els.timer.classList.toggle('low', s <= 10 && phase === 'fight');
    },
    setScore(us, them) {
      els.scoreUs.textContent = String(us);
      els.scoreThem.textContent = String(them);
    },
    setRound(n) { els.roundNum.textContent = String(n); },
    setAlive(usAlive, themAlive) {
      els.aliveUs.textContent = usAlive ? '●' : '○';
      els.aliveThem.textContent = '●'.repeat(themAlive) + '○'.repeat(Math.max(0, 5 - themAlive));
    },
    setBombStatus(text, planted) {
      els.bombStatus.textContent = text;
      els.bombStatus.classList.toggle('planted', planted);
    },
    // Crosshair gap in pixels: grows with spread so the player sees inaccuracy.
    setSpread(spreadRadians) {
      const gap = 3 + Math.min(26, spreadRadians * 900);
      const lines = els.crosshair.querySelectorAll('i');
      lines[0].style.top = `${-7 - gap}px`;
      lines[1].style.bottom = `${-7 - gap}px`;
      lines[2].style.left = `${-7 - gap}px`;
      lines[3].style.right = `${-7 - gap}px`;
    },
    hitMarker(kill) {
      els.hitmarker.classList.add('on');
      els.hitmarker.classList.toggle('kill', kill);
      window.clearTimeout(hitTimer);
      hitTimer = window.setTimeout(() => els.hitmarker.classList.remove('on'), kill ? 220 : 110);
    },
    damageFlash() {
      els.damage.style.opacity = '1';
      window.setTimeout(() => { els.damage.style.opacity = '0'; }, 120);
    },
    feedLine(html) {
      const div = document.createElement('div');
      div.innerHTML = html;
      els.feed.prepend(div);
      while (els.feed.children.length > 5) els.feed.lastChild.remove();
      window.setTimeout(() => { if (div.parentNode) div.remove(); }, 9000);
    },
    banner(title, sub = '', holdMs = 2200) {
      els.bannerTitle.textContent = title;
      els.bannerSub.textContent = sub;
      els.banner.classList.add('show');
      window.clearTimeout(bannerTimer);
      bannerTimer = window.setTimeout(() => els.banner.classList.remove('show'), holdMs);
    },
    hint(text, holdMs = 2600) {
      els.hint.textContent = text;
      els.hint.classList.add('show');
      window.clearTimeout(hintTimer);
      hintTimer = window.setTimeout(() => els.hint.classList.remove('show'), holdMs);
    },
    hideHint() { els.hint.classList.remove('show'); },
    showOverlay(mode, data = {}) {
      const titles = {
        start: 'Dusk Harbor',
        paused: 'Paused',
        roundEnd: data.win ? 'Round won' : 'Round lost',
        matchEnd: data.win ? 'Harbor secured' : 'Harbor lost',
      };
      const copies = {
        start: 'A round-based tactical FPS in a container terminal at last light. Plant the charge at <b>Site A</b> or <b>Site B</b>, or drop all five Crimson operators — and do it before the round clock runs out.',
        paused: 'Click to resume. The round clock is stopped.',
        roundEnd: data.detail ?? '',
        matchEnd: data.detail ?? '',
      };
      els.overlayTitle.textContent = titles[mode] ?? mode;
      els.overlayCopy.innerHTML = copies[mode] ?? '';
      els.play.textContent = mode === 'start' ? 'Click to play' : mode === 'paused' ? 'Resume' : 'Play again';
      els.overlay.hidden = false;
    },
    hideOverlay() { els.overlay.hidden = true; },
    showBuy(money, owned, grenadeCount, hasArmor) {
      els.buyBalance.textContent = `$${money}`;
      for (const button of els.shop.children) {
        const id = button.dataset.id;
        const price = id === 'armor' ? ARMOR_PRICE : id === 'grenade' ? GRENADE.price : WEAPONS[id].price;
        let disabled = money < price;
        let label = '';
        if (id in owned) { disabled = true; label = 'OWNED'; }
        if (id === 'armor' && hasArmor) { disabled = true; label = 'OWNED'; }
        if (id === 'grenade' && grenadeCount >= GRENADE.max) { disabled = true; label = 'FULL'; }
        button.disabled = disabled;
        button.querySelector('.price').textContent = label || `$${price}`;
      }
      els.buy.hidden = false;
    },
    hideBuy() { els.buy.hidden = true; },
    get buyOpen() { return !els.buy.hidden; },
  };
}
