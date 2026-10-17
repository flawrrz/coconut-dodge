const MUTE_KEY = 'coconut-dodge:muted';
let ac = null;
let muted = localStorage.getItem(MUTE_KEY) === '1';

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

function tone(freq, dur, { type = 'sine', vol = 0.2, slide = 0, delay = 0 } = {}) {
  if (!ac || muted) return;
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
  over() {
    [392, 330, 262, 196].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.15, delay: i * 0.14 }));
  },
};
