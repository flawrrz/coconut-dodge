const MUTE_KEY = 'coconut-dodge:muted';
const MUSIC_KEY = 'coconut-dodge:music';
let ac = null;
let muted = localStorage.getItem(MUTE_KEY) === '1';
let musicOn = localStorage.getItem(MUSIC_KEY) !== '0';

export function unlockAudio() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) ac = new AC();
  }
  if (ac?.state === 'suspended') ac.resume();
}

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = value;
  localStorage.setItem(MUTE_KEY, value ? '1' : '0');
}

export function isMusicOn() {
  return musicOn;
}

export function setMusicOn(value) {
  musicOn = value;
  localStorage.setItem(MUSIC_KEY, value ? '1' : '0');
  if (!value) stopMusic();
}

function tone(freq, dur, { type = 'sine', vol = 0.2, slide = 0, delay = 0, music = false } = {}) {
  if (!ac || (music ? false : muted)) return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// ---------- background music ----------
// A four-bar loop: bass on the beat, a quiet offbeat pluck on top. Scheduled with a
// lookahead so the timing comes from the audio clock rather than timers.
const BEAT = 60 / 104;
const EIGHTH = BEAT / 2;
const BARS = [
  { bass: 131, pluck: [523, 659, 784, 659] },
  { bass: 196, pluck: [587, 784, 988, 784] },
  { bass: 165, pluck: [659, 784, 988, 784] },
  { bass: 147, pluck: [587, 698, 880, 698] },
];
let musicTimer = null;
let musicAt = 0;
let musicStep = 0;

function scheduleMusic() {
  if (!ac || !musicOn) return;
  const horizon = ac.currentTime + 0.7;
  while (musicAt < horizon) {
    const delay = Math.max(0, musicAt - ac.currentTime);
    const bar = BARS[Math.floor(musicStep / 8) % 4];
    const i = musicStep % 8;
    if (i % 2 === 0) {
      tone(bar.bass, EIGHTH * 1.7, { type: 'triangle', vol: 0.05, delay, music: true });
    }
    tone(bar.pluck[i >> 1], EIGHTH * 0.55, { type: 'sine', vol: 0.022, delay: delay + EIGHTH * 0.5, music: true });
    musicStep += 1;
    musicAt += EIGHTH;
  }
}

export function startMusic() {
  if (!ac || !musicOn || musicTimer) return;
  musicStep = 0;
  musicAt = ac.currentTime + 0.15;
  scheduleMusic();
  musicTimer = setInterval(scheduleMusic, 250);
}

export function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
}


export const sfx = {
  start() {
    [523, 659, 784].forEach((f, i) => tone(f, 0.1, { type: 'square', vol: 0.06, delay: i * 0.07 }));
  },
  coin(step = 0) {
    tone(988 + step * 160, 0.08, { type: 'square', vol: 0.06 });
    tone(1319 + step * 160, 0.14, { type: 'square', vol: 0.06, delay: 0.07 });
  },
  bonk() {
    tone(200, 0.25, { type: 'triangle', vol: 0.35, slide: 0.4 });
    tone(90, 0.22, { vol: 0.3, slide: 0.5 });
  },
  thud() {
    tone(130, 0.08, { type: 'triangle', vol: 0.05, slide: 0.6 });
  },
  heart() {
    [660, 880, 1100].forEach((f, i) => tone(f, 0.12, { vol: 0.12, delay: i * 0.07 }));
  },
  power() {
    tone(440, 0.3, { type: 'sawtooth', vol: 0.06, slide: 2.5 });
    [880, 1175].forEach((f, i) => tone(f, 0.12, { type: 'square', vol: 0.05, delay: 0.18 + i * 0.08 }));
  },
  block() {
    tone(1500, 0.12, { type: 'triangle', vol: 0.12, slide: 0.5 });
    tone(700, 0.1, { vol: 0.08 });
  },
  powerEnd() {
    tone(660, 0.18, { type: 'triangle', vol: 0.08, slide: 0.6 });
  },
  tick(go = false) {
    tone(go ? 1047 : 698, go ? 0.18 : 0.08, { type: 'square', vol: 0.05 });
  },
  rustle() {
    tone(320, 0.22, { type: 'sawtooth', vol: 0.035, slide: 0.45 });
    tone(240, 0.18, { type: 'triangle', vol: 0.03, slide: 0.6, delay: 0.06 });
  },
  split() {
    tone(500, 0.12, { type: 'square', vol: 0.06, slide: 1.7 });
    tone(300, 0.16, { type: 'triangle', vol: 0.07, slide: 0.5, delay: 0.1 });
  },
  gold() {
    [784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.13, { type: 'triangle', vol: 0.1, delay: i * 0.06 }));
  },
  near() {
    tone(1600, 0.06, { type: 'sine', vol: 0.035, slide: 1.3 });
  },
  best() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, { type: 'square', vol: 0.07, delay: i * 0.08 }));
    tone(1568, 0.4, { type: 'triangle', vol: 0.09, delay: 0.34 });
  },
  over() {
    [392, 330, 262, 196].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.15, delay: i * 0.14 }));
  },
};
