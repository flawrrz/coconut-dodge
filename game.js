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

const view = { W: 0, H: 0, dpr: 1, u: 1, groundY: 0, x0: 0, x1: 0 };
let backdrop = null;
let state = 'menu';
let clock = 0;

const who = { user: null, name: 'Guest', account: '', face: null, style: normalizeStyle(GUEST_STYLE) };
const player = { x: 0, vx: 0, facing: 1, phase: 0, moving: 0, invuln: 0, hurtT: 0, blinkT: 2, fallen: 0 };
const keys = new Set();
const pointer = { active: false, down: false, x: 0 };
let run = newRun();

function newRun() {
  return {
    t: 0, coins: 0, lives: MAX_LIVES,
    items: [], particles: [], popups: [],
    spawnT: 1.1, coinT: 1.8, heartT: rand(16, 24), powerT: rand(7, 10),
    power: { shield: 0, magnet: 0, slow: 0 },
    shake: 0, dyingT: 0,
  };
}

const runScore = () => Math.floor(run.t * 10) + run.coins * COIN_POINTS;

// ---------- layout ----------

function resize() {
  const prev = { x0: view.x0, x1: view.x1 };
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
  if (state === 'over') $('over-signin').hidden = !ON_START_NG || !!who.user;
}

function goSignIn() {
  location.href = signInUrl();
}

function maybeRefreshPlayer() {
  if (!document.hidden && performance.now() - lastAsked > 1500) refreshPlayer();
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
  canvas.focus?.();
}

function pause() {
  if (state !== 'play') return;
  state = 'paused';
  keys.clear();
  showPanel('paused');
  $('resume-btn').focus();
}

function resume() {
  if (state !== 'paused') return;
  state = 'play';
  showPanel(null);
}

function endRun() {
  state = 'over';
  keys.clear();
  pointer.active = false;
  const stats = { score: runScore(), coins: run.coins, survived: Math.floor(run.t) };
  $('res-score').textContent = stats.score.toLocaleString();
  $('res-coins').textContent = String(stats.coins);
  $('res-time').textContent = formatTime(stats.survived);
  const best = Number(localStorage.getItem(BEST_KEY)) || 0;
  $('over').querySelector('.over-title').textContent = stats.score > best ? 'New best!' : 'Bonk!';
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

function spawnCoconut() {
  const { u, x0, x1 } = view;
  const e = run.t;
  const r = rand(14, 19) * u;
  const aimed = Math.random() < 0.32;
  const x = aimed ? player.x + rand(-70, 70) * u : rand(x0 + r, x1 - r);
  run.items.push({
    kind: 'coconut', x: clamp(x, x0 + r, x1 - r), y: -r - rand(0, 30) * u, r,
    vy: rand(0, 60) * u, g: (620 + Math.min(e, 100) * 9) * u,
    rot: rand(0, 6), vr: rand(-4, 4),
  });
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
  player.hurtT = 0.5;
  player.invuln = 1.6;
  sfx.bonk();
  if (run.lives <= 0) {
    state = 'dying';
    run.dyingT = 0;
    sfx.over();
  }
}

// ---------- update ----------

function update(dt) {
  const { u, groundY } = view;
  const maxV = 560 * u;

  if (state === 'play') {
    const left = keys.has('arrowleft') || keys.has('a');
    const right = keys.has('arrowright') || keys.has('d');
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
    for (const p of Object.keys(POWERS)) {
      if (run.power[p] <= 0) continue;
      run.power[p] = Math.max(0, run.power[p] - dt);
      if (run.power[p] === 0) sfx.powerEnd();
    }
    run.spawnT -= dt * slow;
    if (run.spawnT <= 0) {
      spawnCoconut();
      if (Math.random() < Math.min(0.35, run.t * 0.004)) spawnCoconut();
      run.spawnT = Math.max(0.26, 0.9 - run.t * 0.009) * rand(0.75, 1.25);
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
  run.items = run.items.filter((it) => {
    const k = it.kind === 'coconut' ? slow : 1;
    it.vy += it.g * dt * k;
    it.y += it.vy * dt * k;
    it.rot += it.vr * dt * k;
    it.pulled = false;
    if (it.kind === 'coconut') {
      if (shield && Math.hypot(it.x - shield.x, it.y - shield.y) < SHIELD_R * u + it.r) {
        burst(it.x, it.y, ['#a5d8ff', '#ffffff', '#8a5a2e'], 10, 300);
        popup(it.x, it.y, 'Blocked!', '#a5d8ff');
        sfx.block();
        return false;
      }
      if (live && player.invuln <= 0 && overlapsPlayer(it, 13, 84, 0.85)) {
        burst(it.x, it.y, ['#6b4219', '#8a5a2e', '#f4f1e8'], 10, 280);
        getHit();
        return false;
      }
      if (it.y + it.r * 0.6 >= groundY) {
        burst(it.x, groundY, ['#6b4219', '#8a5a2e', '#f4f1e8', '#e8c27a'], 7, 220);
        if (live) sfx.thud();
        return false;
      }
      return true;
    }
    if (magnet && it.kind === 'coin') {
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
        popup(it.x, it.y, `+${COIN_POINTS}`, '#ffd43b');
        burst(it.x, it.y, ['#ffd43b', '#fff3a3'], 6, 160);
        sfx.coin();
      } else if (it.kind === 'power') {
        run.power[it.type] = POWERS[it.type].duration;
        popup(it.x, it.y, POWERS[it.type].label, POWER_COLORS[it.type]);
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

  updateHud();
}

const hud = { score: -1, coins: -1, lives: -1, powers: {} };

function updateHud(force = false) {
  const score = runScore();
  if (force || score !== hud.score) $('hud-score').textContent = (hud.score = score).toLocaleString();
  if (force || run.coins !== hud.coins) $('hud-coins').textContent = String((hud.coins = run.coins));
  if (force || run.lives !== hud.lives) {
    hud.lives = run.lives;
    $('hud-lives').innerHTML = Array.from({ length: MAX_LIVES }, (_, i) =>
      HEART_SVG.replace('<svg', `<svg class="${i < run.lives ? 'full' : 'empty'}"`)).join('');
  }
  for (const [p, { duration }] of Object.entries(POWERS)) {
    const left = run.power[p];
    const key = left > 0 ? `${Math.ceil(left)}:${Math.round((left / duration) * 50)}:${left < 1.5}` : '';
    if (!force && hud.powers[p] === key) continue;
    hud.powers[p] = key;
    const chip = $(`power-${p}`);
    chip.hidden = !key;
    if (!key) continue;
    chip.querySelector('span').textContent = String(Math.ceil(left));
    chip.style.setProperty('--left', String(left / duration));
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

  const powered = state === 'play' || state === 'paused';
  if (powered && run.power.slow > 0) {
    const fade = Math.min(1, run.power.slow / 0.5, (POWERS.slow.duration - run.power.slow) / 0.3);
    ctx.fillStyle = `rgba(110,90,250,${0.13 * fade})`;
    ctx.fillRect(0, 0, W, H);
  }

  for (const it of run.items) {
    if (it.kind !== 'coconut') continue;
    const k = clamp(1 - (groundY - it.y) / groundY, 0, 1);
    const s = 0.45 + 0.7 * k;
    ctx.fillStyle = `rgba(70,35,10,${0.1 + 0.3 * k})`;
    ctx.beginPath();
    ctx.ellipse(it.x, groundY + 3 * u, it.r * s, it.r * 0.3 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

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
    if (it.kind === 'coconut') drawCoconut(ctx, it.x, it.y, it.r, it.rot);
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
  ctx.restore();
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state !== 'paused') {
    clock += dt;
    update(dt);
  }
  render();
  requestAnimationFrame(frame);
}

// ---------- input ----------

const MOVE_KEYS = new Set(['arrowleft', 'arrowright', 'a', 'd']);

addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (MOVE_KEYS.has(key)) {
    if (state === 'play') e.preventDefault();
    keys.add(key);
    pointer.active = false;
    return;
  }
  if (e.repeat) return;
  if (key === 'p' || key === 'escape') {
    if (state === 'play') pause();
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
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

canvas.addEventListener('pointerdown', (e) => {
  pointer.down = true;
  pointer.active = true;
  pointer.x = e.clientX;
});
addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse' || pointer.down) {
    pointer.active = true;
    pointer.x = e.clientX;
  }
});
const release = (e) => {
  pointer.down = false;
  if (e.pointerType !== 'mouse') pointer.active = false;
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
