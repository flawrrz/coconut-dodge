const HAIRS = new Set(['short', 'afro', 'braids', 'bun', 'ponytail', 'dreads', 'bald']);
const HATS = new Set(['none', 'cap', 'beanie', 'tophat', 'crown']);
const ACCESSORIES = new Set(['none', 'glasses', 'earrings', 'beard', 'scarf', 'backpack']);
const HEX = /^#[0-9a-f]{6}$/i;
const TAU = Math.PI * 2;

export const GUEST_STYLE = {
  body: 'male',
  primaryColor: '#d8fd71',
  secondaryColor: '#3b3d33',
  skinColor: '#c68642',
  hairColor: '#17120f',
  hair: 'short',
  hat: 'none',
  accessory: 'none',
};

export function normalizeStyle(style) {
  const s = style && typeof style === 'object' ? style : {};
  const color = (v, fallback) => (typeof v === 'string' && HEX.test(v) ? v : fallback);
  return {
    body: s.body === 'female' ? 'female' : 'male',
    primaryColor: color(s.primaryColor, GUEST_STYLE.primaryColor),
    secondaryColor: color(s.secondaryColor, GUEST_STYLE.secondaryColor),
    skinColor: color(s.skinColor, GUEST_STYLE.skinColor),
    hairColor: color(s.hairColor, GUEST_STYLE.hairColor),
    hair: HAIRS.has(s.hair) ? s.hair : 'short',
    hat: HATS.has(s.hat) ? s.hat : 'none',
    accessory: ACCESSORIES.has(s.accessory) ? s.accessory : 'none',
  };
}

export function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.round(amount < 0 ? v * (1 + amount) : v + (255 - v) * amount);
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

// How far above the feet the top of the character reaches, in character units.
export function characterTop(style) {
  const lift = hatLift(style);
  if (style.hat === 'tophat') return 112 + lift;
  if (style.hat === 'crown') return 102 + lift;
  if (style.hat === 'beanie') return 99 + lift;
  if (style.hair === 'afro') return 101;
  if (style.hair === 'bun') return 99;
  return 90;
}

function hatLift(style) {
  if (style.hair === 'afro') return 7;
  if (style.hair === 'bun') return 4;
  return 0;
}

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function ellipse(ctx, x, y, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
}

function strand(ctx, x1, y1, cx, cy, x2, y2, width, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(cx, cy, x2, y2);
  ctx.stroke();
}

// Front-facing character drawn around its feet at (x, y). One unit is one pixel at scale 1; it stands ~90 units tall.
export function drawCharacter(ctx, s, o) {
  const phase = o.phase ?? 0;
  const moving = o.moving ?? 0;
  const facing = o.facing ?? 1;
  const female = s.body === 'female';
  const skin = s.skinColor;
  const top = s.primaryColor;
  const bottom = s.secondaryColor;
  const hair = s.hairColor;
  const sway = Math.sin(phase) * moving;
  const bob = Math.abs(Math.sin(phase)) * 2.2 * moving;
  const lift = hatLift(s);
  const fx = facing * 1.6 * Math.min(1, moving * 1.5);

  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.scale(o.scale, o.scale);
  if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;

  ctx.fillStyle = 'rgba(40,25,10,0.22)';
  ellipse(ctx, 0, 1, 21, 4.8);
  ctx.fill();

  if (o.fallen) {
    ctx.translate(0, -11 * o.fallen);
    ctx.rotate(o.fallen * facing * 1.45);
  } else {
    ctx.rotate((o.lean ?? 0) * 0.1);
  }

  for (const side of [-1, 1]) {
    const raise = Math.max(0, Math.sin(phase + (side > 0 ? 0 : Math.PI))) * 7 * moving;
    ctx.save();
    ctx.translate(side * 6, -28);
    ctx.rotate(facing * 0.12 * moving);
    ctx.fillStyle = female ? skin : bottom;
    rrect(ctx, -4.5, 0, 9, 25 - raise, 3);
    ctx.fill();
    ctx.fillStyle = '#2b2622';
    rrect(ctx, -5.5 + facing * 1.2, 22 - raise, 11, 6, 3);
    ctx.fill();
    ctx.restore();
  }

  ctx.translate(0, -bob);

  if (s.accessory === 'backpack') {
    ctx.fillStyle = shade(top, -0.38);
    rrect(ctx, -18.5, -57, 37, 27, 7);
    ctx.fill();
  }

  if (s.hair === 'afro') {
    ctx.fillStyle = hair;
    circle(ctx, 0, -79, 22.5);
    ctx.fill();
    for (const [bx, by] of [[-17, -88], [17, -88], [-20, -76], [20, -76], [-9, -98], [9, -98], [0, -100]]) {
      circle(ctx, bx, by, 7.5);
      ctx.fill();
    }
  }
  if (s.hair === 'bun') {
    ctx.fillStyle = hair;
    circle(ctx, 0, -91, 8.5);
    ctx.fill();
  }
  if (s.hair === 'ponytail') {
    const side = facing === 0 ? 1 : -facing;
    const swing = sway * 4;
    strand(ctx, side * 9, -84, side * (25 + swing), -84, side * (20 + swing * 1.6), -58, 8, hair);
    ctx.fillStyle = top;
    circle(ctx, side * 12, -83.5, 3.4);
    ctx.fill();
  }

  if (female) {
    ctx.fillStyle = bottom;
    ctx.beginPath();
    ctx.moveTo(-12, -34);
    ctx.lineTo(12, -34);
    ctx.lineTo(17.5, -16.5);
    ctx.quadraticCurveTo(0, -13.5, -17.5, -16.5);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = bottom;
    rrect(ctx, -12.5, -35, 25, 11, 3);
    ctx.fill();
  }

  for (const side of [-1, 1]) {
    const lift2 = Math.max(0, Math.sin(phase + (side > 0 ? Math.PI : 0))) * moving;
    ctx.save();
    ctx.translate(side * 13, -54.5);
    ctx.rotate(-side * (0.2 + 0.35 * lift2));
    ctx.fillStyle = top;
    rrect(ctx, -3.8, -2, 7.6, 12, 3.5);
    ctx.fill();
    ctx.fillStyle = skin;
    rrect(ctx, -3, 8, 6, 11, 3);
    ctx.fill();
    circle(ctx, 0, 20, 3.7);
    ctx.fill();
    ctx.restore();
  }

  ctx.fillStyle = skin;
  rrect(ctx, -4, -62, 8, 7, 2);
  ctx.fill();

  const body = ctx.createLinearGradient(0, -58, 0, -30);
  body.addColorStop(0, shade(top, 0.12));
  body.addColorStop(1, shade(top, -0.14));
  ctx.fillStyle = body;
  if (female) {
    ctx.beginPath();
    ctx.moveTo(-13, -51);
    ctx.quadraticCurveTo(-13, -58.5, -6, -58.5);
    ctx.lineTo(6, -58.5);
    ctx.quadraticCurveTo(13, -58.5, 13, -51);
    ctx.quadraticCurveTo(10, -42, 12, -31);
    ctx.lineTo(-12, -31);
    ctx.quadraticCurveTo(-10, -42, -13, -51);
    ctx.closePath();
    ctx.fill();
  } else {
    rrect(ctx, -13.5, -58.5, 27, 27, 7);
    ctx.fill();
  }
  ctx.fillStyle = shade(top, -0.25);
  ctx.beginPath();
  ctx.moveTo(-5, -58.5);
  ctx.quadraticCurveTo(0, -53, 5, -58.5);
  ctx.closePath();
  ctx.fill();

  if (s.accessory === 'backpack') {
    ctx.fillStyle = shade(top, -0.5);
    rrect(ctx, -10.5, -58, 3.6, 23, 1.5);
    ctx.fill();
    rrect(ctx, 6.9, -58, 3.6, 23, 1.5);
    ctx.fill();
  }

  if (s.accessory === 'scarf') {
    const scarf = '#e8505b';
    ctx.fillStyle = scarf;
    ctx.save();
    ctx.translate(7, -56);
    ctx.rotate(-facing * 0.25 * moving + sway * 0.12);
    rrect(ctx, -3, 0, 7, 17, 2);
    ctx.fill();
    ctx.fillStyle = '#ffd6d6';
    ctx.fillRect(-3, 14, 7, 2);
    ctx.restore();
    ctx.fillStyle = scarf;
    rrect(ctx, -12, -61, 24, 7, 3.5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(-8, -59.5, 2, 4);
    ctx.fillRect(-2, -59.5, 2, 4);
    ctx.fillRect(4, -59.5, 2, 4);
  }

  if (s.hair === 'braids') {
    for (const bx of [-16.5, -12.5, 12.5, 16.5]) {
      const end = bx + Math.sign(bx) * 1.5 + sway * 1.5;
      strand(ctx, bx, -78, bx + Math.sign(bx) * 2, -62, end, -46, 3.8, hair);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const yy = -72 + i * 6;
        ctx.beginPath();
        ctx.moveTo(bx - 1.6 + Math.sign(bx) * i * 0.4, yy);
        ctx.lineTo(bx + 1.6 + Math.sign(bx) * i * 0.4, yy + 2);
        ctx.stroke();
      }
      ctx.fillStyle = '#f6c445';
      circle(ctx, end, -45, 2.3);
      ctx.fill();
    }
  }
  if (s.hair === 'dreads') {
    const locs = [[-18.5, -50], [-14.5, -47], [-10.5, -52], [10.5, -52], [14.5, -47], [18.5, -50]];
    for (const [bx, by] of locs) {
      const end = bx + Math.sign(bx) * 1 + sway * 2;
      strand(ctx, bx * 0.9, -82, bx * 1.08, -66, end, by, 4.8, hair);
    }
  }

  ctx.fillStyle = skin;
  circle(ctx, -14.6, -71, 3.6);
  ctx.fill();
  circle(ctx, 14.6, -71, 3.6);
  ctx.fill();
  circle(ctx, 0, -72, 15);
  ctx.fill();

  ctx.fillStyle = hair;
  if (s.hair === 'short' || s.hair === 'afro' || s.hair === 'dreads') {
    const r = s.hair === 'short' ? 16 : 16.8;
    ctx.beginPath();
    ctx.arc(0, -72, r, Math.PI * 0.93, Math.PI * 2.07);
    ctx.quadraticCurveTo(13, -80, 6, -79);
    ctx.quadraticCurveTo(2, -76, -3, -79);
    ctx.quadraticCurveTo(-11, -80, -15.8, -69);
    ctx.closePath();
    ctx.fill();
  } else if (s.hair !== 'bald') {
    ctx.beginPath();
    ctx.arc(0, -72, 16.2, Math.PI * 0.93, Math.PI * 2.07);
    if (s.hair === 'braids') {
      ctx.quadraticCurveTo(10, -86, 1, -80);
      ctx.quadraticCurveTo(-10, -86, -15.8, -69);
    } else {
      ctx.quadraticCurveTo(-2, -88, -15.8, -69);
    }
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ellipse(ctx, -5, -81, 5, 2.6, -0.4);
    ctx.fill();
  }

  if (s.accessory === 'beard') {
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.moveTo(-14.6, -74);
    ctx.quadraticCurveTo(-14.5, -55, 0, -54.5);
    ctx.quadraticCurveTo(14.5, -55, 14.6, -74);
    ctx.quadraticCurveTo(12, -64, 7, -63.5);
    ctx.quadraticCurveTo(0, -61, -7, -63.5);
    ctx.quadraticCurveTo(-12, -64, -14.6, -74);
    ctx.fill();
  }

  const eyeY = -71.5;
  ctx.fillStyle = '#1d1b19';
  ctx.strokeStyle = '#1d1b19';
  ctx.lineCap = 'round';
  if (o.hurt) {
    ctx.lineWidth = 1.6;
    for (const ex of [-5.2, 5.2]) {
      ctx.beginPath();
      ctx.moveTo(fx + ex - 2.2, eyeY - 2.2);
      ctx.lineTo(fx + ex + 2.2, eyeY + 2.2);
      ctx.moveTo(fx + ex + 2.2, eyeY - 2.2);
      ctx.lineTo(fx + ex - 2.2, eyeY + 2.2);
      ctx.stroke();
    }
  } else if (o.blink) {
    ctx.lineWidth = 1.5;
    for (const ex of [-5.2, 5.2]) {
      ctx.beginPath();
      ctx.moveTo(fx + ex - 2, eyeY);
      ctx.lineTo(fx + ex + 2, eyeY);
      ctx.stroke();
    }
  } else {
    for (const ex of [-5.2, 5.2]) {
      ellipse(ctx, fx + ex, eyeY, 2, 2.6);
      ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    for (const ex of [-5.2, 5.2]) {
      circle(ctx, fx + ex + 0.7, eyeY - 1, 0.8);
      ctx.fill();
    }
    if (female) {
      ctx.lineWidth = 1.1;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(fx + side * 7, eyeY - 1.5);
        ctx.lineTo(fx + side * 8.6, eyeY - 3);
        ctx.stroke();
      }
    }
  }

  ctx.fillStyle = 'rgba(255,110,110,0.28)';
  if (s.accessory !== 'beard') {
    circle(ctx, fx - 9, -66, 2.6);
    ctx.fill();
    circle(ctx, fx + 9, -66, 2.6);
    ctx.fill();
  }

  const mouthY = s.accessory === 'beard' ? -67.5 : -66.5;
  ctx.strokeStyle = s.accessory === 'beard' ? shade(skin, 0.45) : '#3a2418';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  if (o.hurt) {
    ctx.arc(fx, mouthY + 3, 2.2, 0, TAU);
  } else {
    ctx.arc(fx, mouthY, 4.4, Math.PI * 0.15, Math.PI * 0.85);
  }
  ctx.stroke();

  if (s.accessory === 'glasses') {
    ctx.strokeStyle = '#1f1f24';
    ctx.lineWidth = 1.6;
    for (const ex of [-5.4, 5.4]) {
      circle(ctx, fx + ex, eyeY, 4.6);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(fx - 0.9, eyeY - 0.5);
    ctx.lineTo(fx + 0.9, eyeY - 0.5);
    ctx.moveTo(fx - 10, eyeY - 0.5);
    ctx.lineTo(-14.5, eyeY - 1.5);
    ctx.moveTo(fx + 10, eyeY - 0.5);
    ctx.lineTo(14.5, eyeY - 1.5);
    ctx.stroke();
  }
  if (s.accessory === 'earrings') {
    ctx.fillStyle = '#f6c445';
    circle(ctx, -14.8, -66, 2.4);
    ctx.fill();
    circle(ctx, 14.8, -66, 2.4);
    ctx.fill();
  }

  if (s.hat === 'cap') {
    const cap = shade(top, -0.1);
    ctx.fillStyle = cap;
    ctx.beginPath();
    ctx.arc(0, -76 - lift, 16.6, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade(top, -0.35);
    ellipse(ctx, (facing || 1) * 9, -76 - lift, 14, 3.6);
    ctx.fill();
    circle(ctx, 0, -92.4 - lift, 1.9);
    ctx.fill();
  } else if (s.hat === 'beanie') {
    ctx.fillStyle = top;
    ctx.beginPath();
    ctx.arc(0, -75 - lift, 17, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade(top, -0.28);
    rrect(ctx, -17.6, -79 - lift, 35.2, 7.5, 3.5);
    ctx.fill();
    ctx.fillStyle = shade(top, 0.55);
    circle(ctx, 0, -93.5 - lift, 4.8);
    ctx.fill();
  } else if (s.hat === 'tophat') {
    ctx.fillStyle = '#1f1d22';
    rrect(ctx, -12, -111 - lift, 24, 28, 2);
    ctx.fill();
    ellipse(ctx, 0, -84 - lift, 20.5, 4.2);
    ctx.fill();
    ctx.fillStyle = top;
    ctx.fillRect(-12, -91 - lift, 24, 5);
  } else if (s.hat === 'crown') {
    ctx.fillStyle = '#f6c445';
    ctx.strokeStyle = '#c9901a';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-13, -82 - lift);
    ctx.lineTo(-14, -98 - lift);
    ctx.lineTo(-6.5, -89.5 - lift);
    ctx.lineTo(0, -101 - lift);
    ctx.lineTo(6.5, -89.5 - lift);
    ctx.lineTo(14, -98 - lift);
    ctx.lineTo(13, -82 - lift);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e8505b';
    circle(ctx, 0, -86.5 - lift, 2.2);
    ctx.fill();
    ctx.fillStyle = '#4dabf7';
    circle(ctx, -7.5, -85.5 - lift, 1.6);
    ctx.fill();
    circle(ctx, 7.5, -85.5 - lift, 1.6);
    ctx.fill();
  }

  ctx.restore();
}

// A head-and-shoulders picture of the character, for when start.ng gives no face picture.
export function avatarDataUrl(style) {
  const c = document.createElement('canvas');
  c.width = 120;
  c.height = 120;
  const g = c.getContext('2d');
  g.fillStyle = '#d8fd71';
  g.fillRect(0, 0, 120, 120);
  const scale = 2.1;
  drawCharacter(g, style, { x: 60, y: 70 + 72 * scale, scale });
  return c.toDataURL('image/png');
}
