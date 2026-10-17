import { askStartNg, signInUrl, ON_START_NG, CHOSE_GUEST, tidyAddress } from './startng.js';
import { drawCharacter, normalizeStyle, characterTop, avatarDataUrl, GUEST_STYLE } from './character.js';
import { Backdrop, drawCoconut, drawCoin, drawHeart, drawPowerUp, POWER_COLORS } from './scene.js';
import { sfx, unlockAudio, isMuted, setMuted } from './audio.js';

tidyAddress();

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
const BEST_KEY = 'coconut-dodge:best';
const MAX_LIVES = 3;
const COIN_POINTS = 50;
const NEAR_MISS_POINTS = 25;
const GOLD_POINTS = 200;
const CHAIN_WINDOW = 2.5;
const POWERS = {
  shield: { label: 'Shield!', duration: 7 },
  magnet: { label: 'Magnet!', duration: 9 },
  slow: { label: 'Slow-mo!', duration: 6 },
};
const SLOW_FACTOR = 0.5;
const SHIELD_R = 58;
const MAGNET_RANGE = 280;
const HEART_SVG = '<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.4C.9 8 3 4 6.9 4c2.2 0 3.7 1.2 5.1 3 1.4-1.8 2.9-3 5.1-3C21 4 23.1 8 21.6 11.6 19.5 16.4 12 21 12 21z"/></svg>';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const approach = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));
const rand = (a, b) => a + Math.random() * (b - a);
const formatTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
// Difficulty keeps climbing past the first 100s, just more slowly, and settles at 200.
const ramp = (t) => Math.min(200, t <= 100 ? t : 100 + (t - 100) * 0.4);
const chainMult = (chain) => (chain >= 6 ? 3 : chain >= 3 ? 2 : 1);

const view = { W: 0, H: 0, dpr: 1, u: 1, groundY: 0, x0: 0, x1: 0 };
let backdrop = null;
let state = 'menu';
let clock = 0;
let countT = 0;
const COUNTDOWN = 3;

const who = { user: null, name: 'Guest', account: '', face: null, style: normalizeStyle(GUEST_STYLE) };
const player = { x: 0, vx: 0, facing: 1, phase: 0, moving: 0, invuln: 0, hurtT: 0, blinkT: 2, fallen: 0 };
const held = new Map();
const pointer = { active: false, down: false, x: 0 };
let run = newRun();

function newRun() {
  return {
    t: 0, scoreT: 0, coinScore: 0, bonus: 0, coins: 0, lives: MAX_LIVES,
    chain: 0, chainT: 0,
    items: [], particles: [], popups: [], markers: [],
    spawnT: 1.1, coinT: 1.8, heartT: rand(16, 24), powerT: rand(7, 10), burstT: rand(12, 18),
    warn: null,
    power: { shield: 0, magnet: 0, slow: 0 },
    shake: 0, dyingT: 0,
  };
}

const runScore = () => Math.floor(run.scoreT * 10) + run.coinScore + run.bonus;

// ---------- layout ----------

function resize() {
  const prev = { ...view };
  const W = innerWidth;
  const H = innerHeight;
  view.W = W;
  view.H = H;
  view.dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = Math.round(W * view.dpr);
  canvas.height = Math.round(H * view.dpr);
  const fieldW = Math.min(W, H * 1.05);
  view.x0 = (W - fieldW) / 2;
  view.x1 = view.x0 + fieldW;
  view.u = Math.min(H / 720, fieldW / 480);
  view.groundY = H * 0.88;
  backdrop = new Backdrop(view);
  const frac = prev.x1 > prev.x0 ? (player.x - prev.x0) / (prev.x1 - prev.x0) : 0.5;
  player.x = view.x0 + clamp(frac, 0, 1) * fieldW;
  clampPlayer();
  if (!prev.W) return;
  rescaleRun(prev);
  // A width change is a rotation or window resize, so pause; height-only changes are usually the phone's address bar.
  if (W !== prev.W) pause();
}

function rescaleRun(prev) {
  const k = view.u / prev.u;
  const fx = (view.x1 - view.x0) / (prev.x1 - prev.x0);
  const fy = view.groundY / prev.groundY;
  const mapX = (x) => view.x0 + (x - prev.x0) * fx;
  for (const it of run.items) {
    it.x = mapX(it.x);
    it.y *= fy;
    it.r *= k;
    it.vy *= k;
    it.g *= k;
  }
  for (const p of run.popups) {
    p.x = mapX(p.x);
    p.y *= fy;
  }
  run.particles = [];
  run.markers = [];
  if (run.warn) run.warn.x = mapX(run.warn.x);
  player.vx *= k;
}

function clampPlayer() {
  const pad = 20 * view.u;
  const x = clamp(player.x, view.x0 + pad, view.x1 - pad);
  if (x !== player.x) player.vx = 0;
  player.x = x;
}

// ---------- start.ng player ----------

let lastAsked = 0;

async function refreshPlayer() {
  lastAsked = performance.now();
  const reply = await askStartNg({ type: 'startng:whoami' }, 'startng:user');
  const p = reply?.user ?? reply?.guest ?? null;
  who.user = reply?.user ?? null;
  who.name = p?.name || 'Guest';
  who.account = who.user?.account || '';
  who.style = normalizeStyle(p?.style ?? GUEST_STYLE);
  who.face = typeof p?.face === 'string' && p.face.startsWith('data:image/') ? p.face : avatarDataUrl(who.style);
  updateCard();
}

function updateCard() {
  $('player-face').src = who.face;
  $('player-name').textContent = who.name;
  $('player-account').textContent = who.user
    ? (who.account ? `@${who.account}` : 'Signed in')
    : (ON_START_NG ? 'Not signed in' : 'Playing offline');
  $('player-sign-in').hidden = !ON_START_NG || !!who.user;
  $('player-card').hidden = false;
  $('menu-signin').hidden = !ON_START_NG || !!who.user || CHOSE_GUEST;
  if (state === 'over') $('over-signin').hidden = !ON_START_NG || !!who.user || CHOSE_GUEST;
}

function goSignIn() {
  location.href = signInUrl();
}

async function maybeRefreshPlayer() {
  if (document.hidden || performance.now() - lastAsked <= 1500) return;
  const before = who.user?.id;
  await refreshPlayer();
  if (state === 'menu' && who.user?.id !== before) loadBoard($('menu-board'));
}

// ---------- leaderboard ----------

function boardNote(list, text) {
  const li = document.createElement('li');
  li.className = 'note';
  li.textContent = text;
  list.replaceChildren(li);
}

async function loadBoard(list) {
  if (!ON_START_NG) {
    boardNote(list, 'The leaderboard lives on coconut-dodge.start.ng.');
    return;
  }
  boardNote(list, 'Loading…');
  const reply = await askStartNg({ type: 'startng:leaderboard', limit: 10 }, 'startng:leaderboardData');
  if (!reply?.ok || !Array.isArray(reply.entries)) {
    boardNote(list, "Couldn't load the leaderboard right now.");
    return;
  }
  if (!reply.entries.length) {
    boardNote(list, 'No runs yet. Be the first on the board!');
    return;
  }
  list.replaceChildren(...reply.entries.map((e) => {
    const stats = e.stats || {};
    const li = document.createElement('li');
    if (who.user && e.player_id === who.user.id) li.className = 'me';
    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = `#${e.rank}`;
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = /^#[0-9a-f]{6}$/i.test(e.color) ? e.color : '#d8fd71';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = e.name || 'Player';
    const num = document.createElement('span');
    num.className = 'num';
    const score = document.createElement('b');
    score.textContent = Number(stats.score ?? e.score ?? 0).toLocaleString();
    const sub = document.createElement('small');
    sub.textContent = `${Number(stats.coins ?? 0)} coins · ${formatTime(Number(stats.survived ?? 0))}`;
    num.append(score, sub);
    li.append(rank, dot, name, num);
    return li;
  }));
}

async function saveRun(stats) {
  const msg = $('save-msg');
  $('over-signin').hidden = true;
  if (!ON_START_NG) {
    msg.textContent = 'Play on coconut-dodge.start.ng to save your runs.';
  } else if (!who.user && CHOSE_GUEST) {
    msg.textContent = "You're playing as a guest, so this run isn't saved.";
  } else if (!who.user) {
    msg.textContent = 'Sign in to put runs like this on the leaderboard.';
    $('over-signin').hidden = false;
  } else {
    msg.textContent = 'Saving your run…';
    const reply = await askStartNg({ type: 'startng:score', stats }, 'startng:scoreSaved', 8000);
    if (state !== 'over') return;
    if (!reply) {
      msg.textContent = "Couldn't reach start.ng, so this run wasn't saved.";
    } else if (!reply.ok) {
      msg.textContent = reply.error || "This run wasn't saved.";
      if (/sign in/i.test(reply.error || '')) $('over-signin').hidden = false;
    } else {
      const r = reply.result || {};
      msg.textContent = r.improved
        ? `New best! You're #${r.rank} on the board.`
        : `Your best is still ${Number(r.best ?? 0).toLocaleString()} (#${r.rank}).`;
    }
  }
  loadBoard($('over-board'));
}

// ---------- game flow ----------

function showPanel(id) {
  for (const p of ['menu', 'over', 'paused']) $(p).hidden = p !== id;
  $('pause-btn').hidden = id !== null;
  document.body.classList.toggle('in-menu', id === 'menu');
}

function startRun() {
  unlockAudio();
  sfx.start();
  run = newRun();
  Object.assign(player, { vx: 0, invuln: 0, hurtT: 0, fallen: 0 });
  player.x = (view.x0 + view.x1) / 2;
  state = 'play';
  showPanel(null);
  updateHud(true);
}

function pause() {
  if (state !== 'play' && state !== 'countdown') return;
  state = 'paused';
  held.clear();
  run.shake = 0;
  showPanel('paused');
  $('resume-btn').focus();
}

function resume() {
  if (state !== 'paused') return;
  state = 'countdown';
  countT = COUNTDOWN;
  sfx.tick();
  showPanel(null);
}

function tickCountdown(dt) {
  const shown = Math.ceil(countT);
  countT -= dt;
  if (countT <= 0) {
    state = 'play';
    sfx.tick(true);
  } else if (Math.ceil(countT) !== shown) {
    sfx.tick();
  }
}

function endRun() {
  state = 'over';
  held.clear();
  pointer.active = false;
  run.warn = null;
  run.markers = [];
  const stats = { score: runScore(), coins: run.coins, survived: Math.floor(run.t) };
  $('res-score').textContent = stats.score.toLocaleString();
  $('res-coins').textContent = String(stats.coins);
  $('res-time').textContent = formatTime(stats.survived);
  const best = Number(localStorage.getItem(BEST_KEY)) || 0;
  $('over').querySelector('.over-title').textContent = best > 0 && stats.score > best ? 'New best!' : 'Bonk!';
  if (stats.score > best) localStorage.setItem(BEST_KEY, String(stats.score));
  showPanel('over');
  $('again-btn').focus();
  saveRun(stats);
}

function showMenuBest() {
  const best = Number(localStorage.getItem(BEST_KEY)) || 0;
  $('menu-best').hidden = !best;
  $('menu-best').textContent = `Your best on this device: ${best.toLocaleString()}`;
}

// ---------- spawning ----------

function pickVariant() {
  if (run.t < 25) return 'plain';
  const roll = Math.random();
  if (roll < 0.07) return 'split';
  if (roll < 0.12) return 'golden';
  return 'plain';
}

// True when a coconut landing at x would leave the player no room to stand.
function wouldSealField(x, r) {
  const { u, x0, x1, groundY } = view;
  const need = 30 * u;
  const spans = run.items
    .filter((it) => it.kind === 'coconut' && it.y > groundY * 0.45)
    .map((it) => [it.x - it.r, it.x + it.r])
    .concat([[x - r, x + r]])
    .sort((a, b) => a[0] - b[0]);
  let reach = x0;
  for (const [a, b] of spans) {
    if (a - reach > need) return false;
    reach = Math.max(reach, b);
    if (reach >= x1 - need) return true;
  }
  return false;
}

function spawnCoconut(opts = {}) {
  const { u, x0, x1 } = view;
  const variant = opts.variant ?? pickVariant();
  const r = rand(14, 19) * u * (variant === 'split' ? 1.18 : 1);
  const aimed = opts.x === undefined && Math.random() < 0.32;
  const want = opts.x ?? (aimed ? player.x + rand(-70, 70) * u : rand(x0 + r, x1 - r));
  const x = clamp(want, x0 + r, x1 - r);
  if (wouldSealField(x, r)) return;
  run.items.push({
    kind: 'coconut', variant, x, y: -r - rand(0, 30) * u, r,
    vx: 0, vy: rand(0, 60) * u, g: (620 + ramp(run.t) * 9) * u,
    rot: rand(0, 6), vr: rand(-4, 4), born: clock,
  });
  if (aimed) run.markers.push({ x, life: 0.9 });
}

function startBurst() {
  const { u, x0, x1 } = view;
  const x = clamp(player.x + rand(-180, 180) * u, x0 + 70 * u, x1 - 70 * u);
  run.warn = { x, t: 0.95, count: ramp(run.t) > 140 ? 4 : 3 };
  leaves(x, 30 * u, 10);
  sfx.rustle();
}

function dropBurst(warn) {
  for (let i = 0; i < warn.count; i++) {
    spawnCoconut({ x: warn.x + rand(-75, 75) * view.u, variant: 'plain' });
  }
}

function splitCoconut(it, sink) {
  const { u } = view;
  burst(it.x, it.y, ['#6b4219', '#8a5a2e', '#ffd43b'], 10, 260);
  sfx.split();
  for (const dir of [-1, 1]) {
    sink.push({
      kind: 'coconut', variant: 'plain', x: it.x + dir * it.r * 0.6, y: it.y, r: it.r * 0.72,
      vx: dir * rand(150, 230) * u, vy: it.vy * 0.55, g: it.g,
      rot: rand(0, 6), vr: dir * 6, born: clock,
    });
  }
}

function spawnPickup(kind, type) {
  const { u, x0, x1 } = view;
  const r = (kind === 'coin' ? 13 : kind === 'power' ? 16 : 14) * u;
  run.items.push({
    kind, type, x: rand(x0 + r + 10 * u, x1 - r - 10 * u), y: -r, r,
    vy: (kind === 'coin' ? 200 + Math.min(run.t, 120) * 1.5 : 170) * u, g: 0,
    rot: 0, vr: 0, born: clock,
  });
}

function spawnPower() {
  if (run.items.some((it) => it.kind === 'power')) return;
  const idle = Object.keys(POWERS).filter((p) => run.power[p] <= 0);
  const choices = idle.length ? idle : Object.keys(POWERS);
  spawnPickup('power', choices[Math.floor(Math.random() * choices.length)]);
}

function shieldCenter() {
  return { x: player.x, y: view.groundY - 46 * view.u };
}

function burst(x, y, colors, count, power) {
  const { u } = view;
  for (let i = 0; i < count; i++) {
    const a = rand(Math.PI * 1.05, Math.PI * 1.95);
    const sp = rand(0.4, 1) * power * u;
    run.particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: rand(0.5, 0.9), max: 0.9, size: rand(3, 6) * u,
      color: colors[i % colors.length], rot: rand(0, 6), vr: rand(-8, 8),
    });
  }
}

function popup(x, y, text, color) {
  run.popups.push({ x, y, text, color, life: 0.9 });
}

let lastBlock = -1;

function blocked(x, y) {
  sfx.block();
  if (clock - lastBlock < 0.4) return;
  lastBlock = clock;
  popup(x, y, 'Blocked!', '#a5d8ff');
}

function leaves(x, y, count) {
  const { u } = view;
  const greens = ['#3f9142', '#57c84d', '#2b7a3b'];
  for (let i = 0; i < count; i++) {
    run.particles.push({
      x: x + rand(-32, 32) * u, y: y + rand(-8, 8) * u,
      vx: rand(-70, 70) * u, vy: rand(10, 70) * u,
      life: rand(0.7, 1.3), max: 1.3, size: rand(5, 9) * u,
      color: greens[i % 3], rot: rand(0, 6), vr: rand(-5, 5),
    });
  }
}

function overlapsPlayer(it, halfW, height, forgive) {
  const { u, groundY } = view;
  const cx = clamp(it.x, player.x - halfW * u, player.x + halfW * u);
  const cy = clamp(it.y, groundY - height * u, groundY);
  const dx = it.x - cx;
  const dy = it.y - cy;
  return dx * dx + dy * dy < (it.r * forgive) ** 2;
}

function getHit() {
  run.lives -= 1;
  run.shake = 0.35;
  run.chain = 0;
  run.chainT = 0;
  player.hurtT = 0.5;
  player.invuln = 1.6;
  sfx.bonk();
  if (run.lives <= 0) {
    state = 'dying';
    run.dyingT = 0;
    $('pause-btn').hidden = true;
    sfx.over();
  }
}

// ---------- update ----------

function update(dt) {
  const { u, groundY } = view;
  const maxV = 560 * u;

  if (state === 'play') {
    const dirs = [...held.values()];
    const left = dirs.includes(-1);
    const right = dirs.includes(1);
    if (left !== right) {
      player.vx = approach(player.vx, (right ? 1 : -1) * maxV, 4200 * u * dt);
    } else if (pointer.active) {
      const desired = clamp((pointer.x - player.x) * 12, -maxV * 1.25, maxV * 1.25);
      player.vx = approach(player.vx, desired, 7000 * u * dt);
    } else {
      player.vx = approach(player.vx, 0, 4200 * u * dt);
    }
  } else {
    player.vx = approach(player.vx, 0, 4200 * u * dt);
  }
  player.x += player.vx * dt;
  clampPlayer();

  const speedFrac = Math.min(1, Math.abs(player.vx) / maxV);
  player.moving = approach(player.moving, speedFrac, dt * 6);
  if (Math.abs(player.vx) > 20 * u) player.facing = Math.sign(player.vx);
  player.phase += dt * (5 + 12 * speedFrac);
  player.blinkT -= dt;
  if (player.blinkT < -0.12) player.blinkT = rand(2, 5);
  player.invuln = Math.max(0, player.invuln - dt);
  player.hurtT = Math.max(0, player.hurtT - dt);
  run.shake = Math.max(0, run.shake - dt);

  const slow = run.power.slow > 0 ? SLOW_FACTOR : 1;

  if (state === 'play') {
    run.t += dt;
    run.scoreT += dt * slow;
    if (run.chainT > 0) {
      run.chainT -= dt;
      if (run.chainT <= 0) run.chain = 0;
    }
    for (const p of Object.keys(POWERS)) {
      if (run.power[p] <= 0) continue;
      run.power[p] = Math.max(0, run.power[p] - dt);
      if (run.power[p] === 0) sfx.powerEnd();
    }
    run.spawnT -= dt * slow;
    if (run.spawnT <= 0) {
      spawnCoconut();
      if (Math.random() < Math.min(0.55, ramp(run.t) * 0.004)) spawnCoconut();
      run.spawnT = Math.max(0.16, 0.9 - ramp(run.t) * 0.009) * rand(0.75, 1.25);
    }
    if (run.warn) {
      run.warn.t -= dt;
      if (run.warn.t <= 0) {
        dropBurst(run.warn);
        run.warn = null;
      }
    } else if (run.t > 20) {
      run.burstT -= dt * slow;
      if (run.burstT <= 0) {
        startBurst();
        run.burstT = rand(9, 14);
      }
    }
    run.coinT -= dt;
    if (run.coinT <= 0) {
      spawnPickup('coin');
      run.coinT = rand(0.9, 1.7);
    }
    run.heartT -= dt;
    if (run.heartT <= 0) {
      if (run.lives < MAX_LIVES) spawnPickup('heart');
      run.heartT = rand(16, 24);
    }
    run.powerT -= dt;
    if (run.powerT <= 0) {
      spawnPower();
      run.powerT = rand(11, 17);
    }
  }

  if (state === 'dying') {
    run.dyingT += dt;
    player.fallen = Math.min(1, run.dyingT * 4);
    if (run.dyingT > 1.1) endRun();
  }

  const live = state === 'play';
  const shield = live && run.power.shield > 0 ? shieldCenter() : null;
  const magnet = live && run.power.magnet > 0;
  const pull = { x: player.x, y: groundY - 50 * u };
  const spawned = [];
  run.items = run.items.filter((it) => {
    const k = it.kind === 'coconut' ? slow : 1;
    it.vy += it.g * dt * k;
    it.y += it.vy * dt * k;
    it.rot += it.vr * dt * k;
    it.pulled = false;
    if (it.kind === 'coconut') {
      if (it.vx) {
        it.x += it.vx * dt * k;
        if (it.x < view.x0 + it.r) {
          it.x = view.x0 + it.r;
          it.vx = Math.abs(it.vx);
        } else if (it.x > view.x1 - it.r) {
          it.x = view.x1 - it.r;
          it.vx = -Math.abs(it.vx);
        }
      }
      if (shield && Math.hypot(it.x - shield.x, it.y - shield.y) < SHIELD_R * u + it.r) {
        burst(it.x, it.y, ['#a5d8ff', '#ffffff', '#8a5a2e'], 10, 300);
        blocked(it.x, it.y);
        return false;
      }
      if (it.variant === 'split' && it.y > groundY * 0.52) {
        splitCoconut(it, spawned);
        return false;
      }
      if (live && player.invuln <= 0 && overlapsPlayer(it, 13, 84, 0.85)) {
        burst(it.x, it.y, ['#6b4219', '#8a5a2e', '#f4f1e8'], 10, 280);
        getHit();
        return false;
      }
      if (live && !it.near && it.y > groundY - 100 * u) {
        const d = Math.abs(it.x - player.x);
        if (d > it.r + 13 * u && d < it.r + 34 * u) {
          it.near = true;
          run.bonus += NEAR_MISS_POINTS;
          popup(it.x, it.y, 'Close!', '#fffefa');
          sfx.near();
        }
      }
      if (it.y + it.r * 0.6 >= groundY) {
        if (it.variant === 'golden' && live) {
          run.bonus += GOLD_POINTS;
          popup(it.x, groundY - 26 * u, `+${GOLD_POINTS} Dodged!`, '#ffd43b');
          burst(it.x, groundY, ['#ffd43b', '#fff3a3', '#ffffff'], 12, 260);
          sfx.gold();
        } else {
          burst(it.x, groundY, ['#6b4219', '#8a5a2e', '#f4f1e8', '#e8c27a'], 7, 220);
          if (live) sfx.thud();
        }
        return false;
      }
      return true;
    }
    if (magnet) {
      const dx = pull.x - it.x;
      const dy = pull.y - it.y;
      if (Math.hypot(dx, dy) < MAGNET_RANGE * u) {
        it.x += dx * Math.min(1, dt * 7);
        it.y += dy * Math.min(1, dt * 7);
        it.pulled = true;
      }
    }
    if (live && overlapsPlayer(it, 20, 96, 1)) {
      if (it.kind === 'coin') {
        run.coins += 1;
        run.chain += 1;
        run.chainT = CHAIN_WINDOW;
        const mult = chainMult(run.chain);
        const value = COIN_POINTS * mult;
        run.coinScore += value;
        popup(it.x, it.y, mult > 1 ? `+${value}  x${mult}` : `+${value}`, '#ffd43b');
        burst(it.x, it.y, ['#ffd43b', '#fff3a3'], 6, 160);
        sfx.coin(mult - 1);
      } else if (it.kind === 'power') {
        const { duration, label } = POWERS[it.type];
        run.power[it.type] = Math.min(duration * 1.8, run.power[it.type] + duration * 0.6);
        popup(it.x, it.y, label, POWER_COLORS[it.type]);
        burst(it.x, it.y, [POWER_COLORS[it.type], '#ffffff'], 12, 220);
        sfx.power();
      } else {
        run.lives = Math.min(MAX_LIVES, run.lives + 1);
        popup(it.x, it.y, '+1 life', '#ff4d6d');
        burst(it.x, it.y, ['#ff4d6d', '#ffffff'], 8, 180);
        sfx.heart();
      }
      return false;
    }
    if (it.y - it.r > groundY) return false;
    return true;
  });
  if (spawned.length) run.items.push(...spawned);

  run.particles = run.particles.filter((p) => {
    p.life -= dt;
    p.vy += 900 * u * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    return p.life > 0;
  });
  run.popups = run.popups.filter((p) => {
    p.life -= dt;
    p.y -= 50 * u * dt;
    return p.life > 0;
  });
  run.markers = run.markers.filter((m) => (m.life -= dt) > 0);

  updateHud();
}

const hud = { score: -1, coins: -1, lives: -1, chain: '', powers: {} };

function updateHud(force = false) {
  const score = runScore();
  if (force || score !== hud.score) $('hud-score').textContent = (hud.score = score).toLocaleString();
  if (force || run.coins !== hud.coins) $('hud-coins').textContent = String((hud.coins = run.coins));
  const chain = chainMult(run.chainT > 0 ? run.chain : 0);
  const chainKey = chain > 1 ? `x${chain}` : '';
  if (force || chainKey !== hud.chain) {
    hud.chain = chainKey;
    const el = $('hud-chain');
    el.hidden = !chainKey;
    el.textContent = chainKey;
  }
  if (force || run.lives !== hud.lives) {
    hud.lives = run.lives;
    $('hud-lives').innerHTML = Array.from({ length: MAX_LIVES }, (_, i) =>
      HEART_SVG.replace('<svg', `<svg class="${i < run.lives ? 'full' : 'empty'}"`)).join('');
  }
  for (const [p, { duration }] of Object.entries(POWERS)) {
    const left = run.power[p];
    const frac = Math.min(1, left / duration);
    const key = left > 0 ? `${Math.ceil(left)}:${Math.round(frac * 50)}:${left < 1.5}` : '';
    if (!force && hud.powers[p] === key) continue;
    hud.powers[p] = key;
    const chip = $(`power-${p}`);
    chip.hidden = !key;
    if (!key) continue;
    chip.querySelector('span').textContent = String(Math.ceil(left));
    chip.style.setProperty('--left', String(frac));
    chip.classList.toggle('ending', left < 1.5);
  }
}

// ---------- render ----------

function drawNameTag(x, y, text) {
  const { u } = view;
  const size = Math.max(11, Math.round(14 * u));
  ctx.font = `700 ${size}px "Trebuchet MS", sans-serif`;
  const w = ctx.measureText(text).width + size * 1.2;
  const h = size * 1.7;
  ctx.fillStyle = 'rgba(41,42,35,0.85)';
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = '#fffefa';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y - h / 2);
}

function drawTopWarnings(u) {
  // Fixed CSS px so the telegraphs clear the HUD chips, which don't scale with u.
  const y = 62;
  ctx.save();
  ctx.lineCap = 'round';
  for (const m of run.markers) {
    ctx.globalAlpha = clamp(m.life / 0.9, 0, 1) * 0.95;
    ctx.strokeStyle = '#ffd43b';
    ctx.lineWidth = 3.5 * u;
    ctx.beginPath();
    ctx.moveTo(m.x - 9 * u, y - 8 * u);
    ctx.lineTo(m.x, y + 3 * u);
    ctx.lineTo(m.x + 9 * u, y - 8 * u);
    ctx.stroke();
  }
  if (run.warn) {
    const pulse = 0.5 + 0.5 * Math.sin(clock * 13);
    const cy = y + 12 * u;
    ctx.globalAlpha = 1;
    ctx.strokeStyle = `rgba(255,107,107,${0.35 + 0.35 * pulse})`;
    ctx.lineWidth = 2.5 * u;
    ctx.setLineDash([7 * u, 9 * u]);
    ctx.beginPath();
    ctx.moveTo(run.warn.x, cy + 16 * u);
    ctx.lineTo(run.warn.x, view.groundY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(run.warn.x, cy, (15 + 4 * pulse) * u, 0, Math.PI * 2);
    ctx.stroke();
    drawCoconut(ctx, run.warn.x, cy, 8.5 * u, clock * 2);
  }
  ctx.restore();
}

function render() {
  const { dpr, u, groundY, W, H } = view;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#e8bf74';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  if (run.shake > 0) {
    const m = (run.shake / 0.35) * 7 * u;
    ctx.translate(rand(-m, m), rand(-m, m));
  }
  backdrop.draw(ctx, clock);

  const powered = state === 'play' || state === 'paused' || state === 'countdown';
  if (powered && run.power.slow > 0) {
    const fade = Math.min(1, run.power.slow / 0.5, (POWERS.slow.duration - run.power.slow) / 0.3);
    ctx.fillStyle = `rgba(110,90,250,${0.13 * fade})`;
    ctx.fillRect(0, 0, W, H);
  }

  for (const it of run.items) {
    if (it.kind !== 'coconut') continue;
    const k = clamp(1 - (groundY - it.y) / groundY, 0, 1);
    const s = 0.45 + 0.7 * k;
    ctx.fillStyle = it.variant === 'golden'
      ? `rgba(180,130,10,${0.12 + 0.34 * k})`
      : `rgba(70,35,10,${0.1 + 0.3 * k})`;
    ctx.beginPath();
    ctx.ellipse(it.x, groundY + 3 * u, it.r * s, it.r * 0.3 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawTopWarnings(u);

  const flicker = player.invuln > 0 && state === 'play' && Math.floor(player.invuln * 12) % 2 === 0;
  drawCharacter(ctx, who.style, {
    x: player.x, y: groundY, scale: u,
    phase: player.phase, moving: player.moving, facing: player.facing,
    lean: player.vx / (560 * u),
    hurt: player.hurtT > 0 || state === 'dying' || (state === 'over' && run.lives <= 0),
    blink: player.blinkT < 0,
    fallen: player.fallen,
    alpha: flicker ? 0.4 : 1,
  });
  if (state === 'menu') drawNameTag(player.x, groundY - (characterTop(who.style) + 8) * u, who.name);

  if (powered && run.power.magnet > 0) {
    const ending = run.power.magnet < 1.5 && Math.floor(run.power.magnet * 8) % 2 === 0;
    ctx.strokeStyle = `rgba(255,107,107,${ending ? 0.15 : 0.45})`;
    ctx.lineWidth = 2.5 * u;
    for (let i = 0; i < 2; i++) {
      const k = (clock * 0.9 + i * 0.5) % 1;
      ctx.globalAlpha = 1 - k;
      ctx.beginPath();
      ctx.arc(player.x, groundY - 50 * u, (40 + k * 60) * u, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,212,59,0.5)';
    ctx.setLineDash([4 * u, 6 * u]);
    ctx.beginPath();
    for (const it of run.items) {
      if (!it.pulled) continue;
      ctx.moveTo(it.x, it.y);
      ctx.lineTo(player.x, groundY - 50 * u);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (powered && run.power.shield > 0) {
    const { x, y } = shieldCenter();
    const r = SHIELD_R * u * (1 + Math.sin(clock * 5) * 0.02);
    const ending = run.power.shield < 1.5 && Math.floor(run.power.shield * 8) % 2 === 0;
    ctx.globalAlpha = ending ? 0.35 : 1;
    const g = ctx.createRadialGradient(x, y, r * 0.55, x, y, r);
    g.addColorStop(0, 'rgba(77,171,247,0)');
    g.addColorStop(1, 'rgba(77,171,247,0.38)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(208,235,255,0.95)';
    ctx.lineWidth = 3 * u;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 4 * u;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.8, Math.PI * 1.15 + clock, Math.PI * 1.4 + clock);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  for (const it of run.items) {
    if (it.kind === 'coconut') drawCoconut(ctx, it.x, it.y, it.r, it.rot, it.variant, clock - it.born);
    else if (it.kind === 'coin') drawCoin(ctx, it.x, it.y, it.r, clock - it.born);
    else if (it.kind === 'power') drawPowerUp(ctx, it.x, it.y, it.r, it.type, clock - it.born);
    else drawHeart(ctx, it.x, it.y, it.r);
  }

  for (const p of run.particles) {
    ctx.save();
    ctx.globalAlpha = clamp(p.life / 0.4, 0, 1);
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
    ctx.restore();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.round(20 * u)}px "Trebuchet MS", sans-serif`;
  ctx.lineWidth = 4 * u;
  ctx.lineJoin = 'round';
  for (const p of run.popups) {
    ctx.globalAlpha = clamp(p.life / 0.4, 0, 1);
    ctx.strokeStyle = '#292a23';
    ctx.strokeText(p.text, p.x, p.y);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.globalAlpha = 1;

  if (state === 'countdown') {
    const n = Math.ceil(countT);
    const k = countT - Math.floor(countT);
    ctx.save();
    ctx.translate(W / 2, H * 0.42);
    ctx.scale(1 + k * 0.35, 1 + k * 0.35);
    ctx.globalAlpha = clamp(0.3 + k, 0, 1);
    ctx.font = `900 ${Math.round(110 * u)}px "Trebuchet MS", sans-serif`;
    ctx.lineWidth = 10 * u;
    ctx.strokeStyle = '#292a23';
    ctx.strokeText(String(n), 0, 0);
    ctx.fillStyle = '#ffd43b';
    ctx.fillText(String(n), 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state === 'countdown') {
    clock += dt;
    tickCountdown(dt);
  } else if (state !== 'paused') {
    clock += dt;
    update(dt);
  }
  render();
  requestAnimationFrame(frame);
}

// ---------- input ----------

function moveDir(e) {
  const key = e.key.toLowerCase();
  if (e.code === 'ArrowLeft' || e.code === 'KeyA' || key === 'a') return -1;
  if (e.code === 'ArrowRight' || e.code === 'KeyD' || key === 'd') return 1;
  return 0;
}

addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  const dir = moveDir(e);
  if (dir) {
    if (state === 'play' || state === 'countdown') e.preventDefault();
    held.set(e.code, dir);
    pointer.active = false;
    return;
  }
  if (e.repeat) return;
  if (key === 'p' || key === 'escape') {
    if (state === 'play' || state === 'countdown') pause();
    else if (state === 'paused') resume();
    return;
  }
  const onButton = document.activeElement?.tagName === 'BUTTON';
  if ((key === ' ' || key === 'enter') && !onButton) {
    e.preventDefault();
    if (state === 'menu' || state === 'over') startRun();
    else if (state === 'paused') resume();
  }
});
addEventListener('keyup', (e) => held.delete(e.code));
addEventListener('blur', () => held.clear());

canvas.addEventListener('pointerdown', (e) => {
  pointer.down = true;
  pointer.active = true;
  pointer.x = e.clientX;
});
addEventListener('pointermove', (e) => {
  if (!pointer.down) return;
  pointer.active = true;
  pointer.x = e.clientX;
});
const release = () => {
  pointer.down = false;
  pointer.active = false;
};
addEventListener('pointerup', release);
addEventListener('pointercancel', release);

$('play-btn').addEventListener('click', startRun);
$('again-btn').addEventListener('click', startRun);
$('resume-btn').addEventListener('click', resume);
$('pause-btn').addEventListener('click', pause);
$('player-sign-in').addEventListener('click', goSignIn);
$('menu-signin-btn').addEventListener('click', goSignIn);
$('over-signin').addEventListener('click', goSignIn);

const muteBtn = $('mute-btn');
const syncMute = () => {
  muteBtn.classList.toggle('muted', isMuted());
  muteBtn.setAttribute('aria-label', isMuted() ? 'Unmute sound' : 'Mute sound');
};
muteBtn.addEventListener('click', () => {
  unlockAudio();
  setMuted(!isMuted());
  syncMute();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
  else maybeRefreshPlayer();
});
addEventListener('focus', maybeRefreshPlayer);
addEventListener('resize', resize);

// ---------- boot ----------

resize();
syncMute();
updateHud(true);
showMenuBest();
showPanel('menu');
$('play-btn').focus();
requestAnimationFrame(frame);
refreshPlayer().then(() => loadBoard($('menu-board')));
