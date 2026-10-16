const TAU = Math.PI * 2;

function layer(view) {
  const c = document.createElement('canvas');
  c.width = Math.round(view.W * view.dpr);
  c.height = Math.round(view.H * view.dpr);
  const g = c.getContext('2d');
  g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  return [c, g];
}

// Deterministic so the sand looks the same after every resize.
function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function drawPalm(g, x, baseY, h, lean, u) {
  const tx = x + lean * h * 0.32;
  const ty = baseY - h;
  const cx = x + lean * h * 0.02;
  const cy = baseY - h * 0.55;
  const at = (t) => [
    (1 - t) * (1 - t) * x + 2 * (1 - t) * t * cx + t * t * tx,
    (1 - t) * (1 - t) * baseY + 2 * (1 - t) * t * cy + t * t * ty,
  ];
  const n = 18;
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const [x1, y1] = at(i / n);
    const [x2, y2] = at((i + 1) / n);
    g.strokeStyle = i % 2 ? '#8a5a2e' : '#a06d3c';
    g.lineWidth = (17 - (i / n) * 8) * u;
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  }

  const L = h * 0.42;
  const angles = [Math.PI - 0.15, -Math.PI + 0.45, -2.15, -1.6, -1.05, -0.5, 0.15];
  angles.forEach((a, i) => {
    const tipX = tx + Math.cos(a) * L;
    const tipY = ty + Math.sin(a) * L * 0.55 + L * 0.38;
    const mx = tx + Math.cos(a) * L * 0.55;
    const my = ty + Math.sin(a) * L * 0.6 - L * 0.12;
    const dx = tipX - tx;
    const dy = tipY - ty;
    const len = Math.hypot(dx, dy) || 1;
    const px = (-dy / len) * L * 0.13;
    const py = (dx / len) * L * 0.13;
    g.fillStyle = i % 2 ? '#2b9348' : '#55a630';
    g.beginPath();
    g.moveTo(tx, ty);
    g.quadraticCurveTo(mx + px, my + py, tipX, tipY);
    g.quadraticCurveTo(mx - px, my - py, tx, ty);
    g.fill();
    g.strokeStyle = 'rgba(20,70,30,0.55)';
    g.lineWidth = 1.6 * u;
    g.beginPath();
    g.moveTo(tx, ty);
    g.quadraticCurveTo(mx, my, tipX, tipY);
    g.stroke();
  });

  for (const [ox, oy] of [[-7, 7], [6, 8], [0, 14]]) {
    g.fillStyle = '#6b4219';
    g.beginPath();
    g.arc(tx + ox * u, ty + oy * u, 7.5 * u, 0, TAU);
    g.fill();
  }
}

function drawCloud(g, x, y, s) {
  g.beginPath();
  g.arc(x, y, 26 * s, 0, TAU);
  g.arc(x + 30 * s, y - 12 * s, 30 * s, 0, TAU);
  g.arc(x + 62 * s, y, 24 * s, 0, TAU);
  g.arc(x + 30 * s, y + 8 * s, 26 * s, 0, TAU);
  g.fill();
}

export class Backdrop {
  constructor(view) {
    this.view = view;
    this.seaTop = view.H * 0.6;
    this.seaBottom = view.H * 0.75;
    const rnd = seeded(7);
    this.clouds = Array.from({ length: 4 }, () => ({
      x: rnd() * (view.W + 300),
      y: view.H * (0.06 + rnd() * 0.24),
      s: 0.6 + rnd() * 0.7,
      v: 8 + rnd() * 12,
    }));
    [this.back] = layer(view);
    this.paintBack(this.back.getContext('2d'));
    [this.front] = layer(view);
    this.paintFront(this.front.getContext('2d'));
  }

  paintBack(g) {
    const { W, H, u } = this.view;
    const { seaTop, seaBottom } = this;

    const sky = g.createLinearGradient(0, 0, 0, seaTop);
    sky.addColorStop(0, '#2fa8e0');
    sky.addColorStop(0.65, '#8fdcf3');
    sky.addColorStop(1, '#ffe3ad');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, seaTop + 1);

    const sx = W * 0.8;
    const sy = H * 0.17;
    const sr = 46 * u;
    const glow = g.createRadialGradient(sx, sy, sr * 0.6, sx, sy, sr * 3);
    glow.addColorStop(0, 'rgba(255,240,170,0.75)');
    glow.addColorStop(1, 'rgba(255,240,170,0)');
    g.fillStyle = glow;
    g.fillRect(sx - sr * 3, sy - sr * 3, sr * 6, sr * 6);
    g.fillStyle = '#fff4b8';
    g.beginPath();
    g.arc(sx, sy, sr, 0, TAU);
    g.fill();

    g.fillStyle = '#4f9d69';
    g.beginPath();
    g.ellipse(W * 0.2, seaTop + 2, 130 * u, 20 * u, 0, Math.PI, TAU);
    g.fill();
    g.fillStyle = '#3f8a5a';
    g.beginPath();
    g.ellipse(W * 0.28, seaTop + 2, 70 * u, 13 * u, 0, Math.PI, TAU);
    g.fill();

    const sea = g.createLinearGradient(0, seaTop, 0, seaBottom);
    sea.addColorStop(0, '#178fb8');
    sea.addColorStop(1, '#3cc4d6');
    g.fillStyle = sea;
    g.fillRect(0, seaTop, W, seaBottom - seaTop + 1);
    g.fillStyle = 'rgba(255,244,184,0.35)';
    for (let i = 0; i < 6; i++) {
      const w = (60 - i * 8) * u;
      g.fillRect(sx - w / 2, seaTop + (6 + i * 9) * u, w, 2.5 * u);
    }

    const sand = g.createLinearGradient(0, seaBottom, 0, H);
    sand.addColorStop(0, '#f6dba3');
    sand.addColorStop(1, '#e8bf74');
    g.fillStyle = sand;
    g.fillRect(0, seaBottom, W, H - seaBottom);
    g.fillStyle = 'rgba(170,125,60,0.22)';
    g.fillRect(0, seaBottom, W, 9 * u);

    const rnd = seeded(42);
    g.fillStyle = 'rgba(150,105,45,0.25)';
    const dots = Math.round((W * (H - seaBottom)) / 900);
    for (let i = 0; i < dots; i++) {
      g.fillRect(rnd() * W, seaBottom + 12 * u + rnd() * (H - seaBottom), 2 * u, 2 * u);
    }
    for (let i = 0; i < 4; i++) {
      const x = rnd() * W;
      const y = H * (0.92 + rnd() * 0.06);
      g.fillStyle = i % 2 ? '#f7a072' : '#fff1e0';
      g.beginPath();
      g.ellipse(x, y, 6 * u, 4 * u, rnd(), 0, TAU);
      g.fill();
    }
  }

  paintFront(g) {
    const { W, H, u, x0, x1 } = this.view;
    const baseY = H * 0.9;
    const h = H * 0.7;
    if (x0 > 140 * u) {
      drawPalm(g, x0 - 110 * u, baseY + 10 * u, h * 0.8, 0.3, u);
      drawPalm(g, x1 + 110 * u, baseY + 10 * u, h * 0.8, -0.3, u);
    }
    drawPalm(g, x0 + 4 * u, baseY, h, 0.38, u);
    drawPalm(g, x1 - 4 * u, baseY, h * 0.94, -0.38, u);
  }

  draw(ctx, t) {
    const { W, H, u } = this.view;
    const { seaTop, seaBottom } = this;
    ctx.drawImage(this.back, 0, 0, W, H);

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    const span = W + 300 * u;
    for (const c of this.clouds) {
      const x = ((c.x + t * c.v * u) % span) - 150 * u;
      drawCloud(ctx, x, c.y, c.s * u);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2 * u;
    ctx.lineCap = 'round';
    for (let row = 0; row < 4; row++) {
      const y = seaTop + (seaBottom - seaTop) * (0.18 + row * 0.2);
      const step = 110 * u;
      const offset = ((t * (14 + row * 6) * (row % 2 ? 1 : -1) * u) % step + step) % step;
      ctx.beginPath();
      for (let x = -step + offset + row * 37 * u; x < W + step; x += step) {
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 12 * u, y - 4 * u, x + 24 * u, y);
      }
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.moveTo(0, seaBottom - 2 * u);
    for (let x = 0; x <= W + 20; x += 20) {
      ctx.lineTo(x, seaBottom + Math.sin(x * 0.03 + t * 1.6) * 3 * u + 2 * u);
    }
    ctx.lineTo(W, seaBottom - 4 * u);
    ctx.closePath();
    ctx.fill();

    ctx.drawImage(this.front, 0, 0, W, H);
  }
}

export function drawCoconut(ctx, x, y, r, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
  g.addColorStop(0, '#b07a42');
  g.addColorStop(1, '#5b3716');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,20,5,0.35)';
  ctx.lineWidth = r * 0.08;
  for (const a of [0.4, 1.6, 2.7, 4.1, 5.3]) {
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.75, a, a + 0.5);
    ctx.stroke();
  }
  ctx.fillStyle = '#2e1a09';
  for (const [ex, ey] of [[-0.25, -0.2], [0.25, -0.2], [0, 0.17]]) {
    ctx.beginPath();
    ctx.arc(ex * r, ey * r, r * 0.13, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

export function drawCoin(ctx, x, y, r, t) {
  const sx = Math.max(0.18, Math.abs(Math.cos(t * 4.5)));
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sx, 1);
  ctx.fillStyle = '#c47f00';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffd43b';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.8, 0, TAU);
  ctx.fill();
  if (sx > 0.55) {
    ctx.fillStyle = '#c47f00';
    ctx.font = `900 ${Math.round(r * 1.15)}px "Trebuchet MS", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('\u20A6', 0, r * 0.05);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.35, -r * 0.4, r * 0.18, r * 0.3, 0.5, 0, TAU);
  ctx.fill();
  ctx.restore();
}

export function drawHeart(ctx, x, y, r) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#ff4d6d';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = r * 0.18;
  ctx.beginPath();
  ctx.moveTo(0, r * 0.9);
  ctx.bezierCurveTo(-r * 1.4, -r * 0.1, -r * 0.7, -r * 1.25, 0, -r * 0.45);
  ctx.bezierCurveTo(r * 0.7, -r * 1.25, r * 1.4, -r * 0.1, 0, r * 0.9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.45, -r * 0.35, r * 0.16, r * 0.26, 0.6, 0, TAU);
  ctx.fill();
  ctx.restore();
}
