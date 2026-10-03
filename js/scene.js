'use strict';
/* =====================================================================
   Отрисовка: фон водоёма с переходами времени суток, анимированная вода,
   погода, удилище, леска, поплавок, кивок фидера, приманка, рыба.
   ===================================================================== */

const cv = $('cv');
const cx = cv.getContext('2d');
let DPR = 1, CW = 700, CH = 372;
function resizeCanvas() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  CW = APPW; CH = APPH;
  cv.style.width = APPW + 'px'; cv.style.height = APPH + 'px';
  cv.width = Math.round(APPW * DPR); cv.height = Math.round(APPH * DPR);
  const mc = $('menuCv');
  if (mc) {
    mc.style.width = APPW + 'px'; mc.style.height = APPH + 'px';
    mc.width = Math.round(APPW * DPR); mc.height = Math.round(APPH * DPR);
  }
  VIEW.dirty = true;
}

const VIEW = { hzY: 200, ox: 0, oy: 0, sc: 1, dirty: true, t: 0 };
const KP = 6.5;
const FONT = 'Rubik, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';

function bgPath(loc, tod) { return 'assets/bg/' + loc + '_' + tod + '.jpg'; }
function fishPath(id) { return SPECIES[id] ? 'assets/fish/' + id + '.png' : 'assets/items/' + id + '.png'; }
function itemPath(id) { return 'assets/items/' + id + '.png'; }

function computeView(W, H, hz) {
  const sc = Math.max(W / 1920, H / 1080);
  const iw = 1920 * sc, ih = 1080 * sc;
  const ox = (W - iw) / 2;
  let oy = H * 0.47 - hz * ih;
  oy = clamp(oy, H - ih, 0);
  return { sc, ox, oy, iw, ih, hzY: oy + hz * ih };
}
function proj(x, dist, W, H, hzY) {
  const k = KP / (Math.max(dist, 0.5) - 2 + KP);
  return { x: W / 2 + x * W * 0.052 * k, y: hzY + (H - hzY) * k * 1.02, k };
}

/* ---------- облака и звёзды: подготовленные слои ---------- */
const cloudLayer = (() => {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 160;
  const g = c.getContext('2d');
  for (let i = 0; i < 46; i++) {
    const x = Math.random() * 1024, y = 40 + Math.random() * 80, r = 20 + Math.random() * 55;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.35)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(x, y, r * 1.8, r * 0.6, 0, 0, Math.PI * 2); g.fill();
    // бесшовность
    if (x < 200) { g.beginPath(); g.ellipse(x + 1024, y, r * 1.8, r * 0.6, 0, 0, Math.PI * 2); g.fillStyle = gr; g.fill(); }
  }
  return c;
})();
const STARS = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random() * 0.4, p: Math.random() * 6.28, s: 0.6 + Math.random() * 1.2 }));
const FIREFLIES = Array.from({ length: 26 }, () => ({ x: Math.random(), y: 0.55 + Math.random() * 0.4, p: Math.random() * 6.28, sp: 0.2 + Math.random() * 0.5 }));
const RAIN = Array.from({ length: 160 }, () => ({ x: Math.random(), y: Math.random(), l: 0.6 + Math.random() * 0.8, s: 0.8 + Math.random() * 0.6 }));
const BIRDS = [];

/* ---------------------------------------------------------------- фон */
function drawBackground(g, W, H, loc, minutes, t, opts) {
  const L = LOCATIONS[loc];
  const v = computeView(W, H, L.hz);
  const w = opts && opts.fixedTod ? { day: 0, evening: 0, night: 0, [opts.fixedTod]: 1 } : bgWeights(minutes);
  let first = true;
  for (const tod of ['day', 'evening', 'night']) {
    if (w[tod] <= 0.001) continue;
    const im = ASSETS.img(bgPath(loc, tod));
    if (!im.complete || !im.naturalWidth) continue;
    g.globalAlpha = first ? 1 : w[tod];
    g.drawImage(im, v.ox, v.oy, v.iw, v.ih);
    first = false;
  }
  g.globalAlpha = 1;
  if (first) {
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#2c4a6a'); gr.addColorStop(0.5, '#6a8aa0'); gr.addColorStop(0.5, '#2a4a5a'); gr.addColorStop(1, '#14303a');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  const night = w.night, eve = w.evening;
  // мерцание звёзд
  if (night > 0.2) {
    for (const s of STARS) {
      const a = (0.4 + 0.6 * Math.sin(t * 2 * s.s + s.p)) * night;
      if (a <= 0.05) continue;
      g.fillStyle = 'rgba(255,255,240,' + a.toFixed(2) + ')';
      const x = s.x * W, y = s.y * v.hzY;
      g.fillRect(x, y, 1.6, 1.6);
    }
  }
  // плывущие облака
  const cy = v.hzY * 0.18;
  const off = (t * 6) % 1024;
  g.globalAlpha = 0.5 * (1 - night * 0.7) * (SAVE.weather === 'cloudy' || SAVE.weather === 'rain' ? 1.6 : 0.8);
  const ch = v.hzY * 0.32;
  const cw = ch * 6.4;
  for (let x = -off / 1024 * cw; x < W; x += cw) g.drawImage(cloudLayer, x, cy, cw, ch);
  g.globalAlpha = 1;
  // пасмурность / дождь — затемнение
  if (SAVE.weather === 'rain' || SAVE.weather === 'cloudy') {
    g.fillStyle = SAVE.weather === 'rain' ? 'rgba(40,50,64,0.28)' : 'rgba(80,90,100,0.14)';
    g.fillRect(0, 0, W, H);
  }
  return { v, night, eve, day: w.day };
}

function drawWater(g, W, H, hzY, t, L, light) {
  // анимированные блики
  const n = 38;
  const waves = (L.waves || 0.4) * (SAVE.weather === 'wind' ? 1.8 : 1);
  g.save();
  for (let i = 0; i < n; i++) {
    const r = (i * 0.618034) % 1;
    const dist = 3 + Math.pow(r, 2) * 90;
    const k = KP / (dist - 2 + KP);
    const y = hzY + (H - hzY) * k * 1.02 + Math.sin(t * 0.8 + i) * 2 * k;
    const x = W * (((i * 0.37 + t * (0.01 + L.current * 0.03) * (i % 2 ? 1 : -0.6)) % 1.2) - 0.1);
    const len = (30 + 80 * k) * (0.6 + waves * 0.6);
    const a = (0.06 + 0.12 * k) * (0.5 + 0.5 * Math.sin(t * 1.5 + i * 2.1)) * (light.night > 0.5 ? 0.6 : 1);
    g.strokeStyle = light.night > 0.5 ? 'rgba(190,210,255,' + a.toFixed(3) + ')' : 'rgba(255,255,255,' + a.toFixed(3) + ')';
    g.lineWidth = Math.max(0.7, 2.2 * k);
    g.beginPath(); g.moveTo(x - len / 2, y); g.quadraticCurveTo(x, y - 1.5 * k, x + len / 2, y); g.stroke();
  }
  // течение: полоски
  if (L.current > 0) {
    for (let i = 0; i < 16; i++) {
      const dist = 4 + ((i * 0.41) % 1) * 50;
      const k = KP / (dist - 2 + KP);
      const y = hzY + (H - hzY) * k * 1.02;
      const x = ((t * 40 * L.current * k + i * 173) % (W + 200)) - 100;
      g.strokeStyle = 'rgba(230,245,245,' + (0.08 + 0.1 * k).toFixed(3) + ')';
      g.lineWidth = 1.5 * k + 0.5;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 60 * k, y + 1); g.stroke();
    }
  }
  g.restore();
}

function drawRippleAt(g, p, size, t, color) {
  const r = (6 + t * 38 * size) * p.k * 1.4;
  const a = Math.max(0, 0.55 * (1 - t / 2.2));
  g.strokeStyle = (color || 'rgba(255,255,255,') + a.toFixed(3) + ')';
  g.lineWidth = Math.max(0.6, 1.6 * p.k);
  g.beginPath(); g.ellipse(p.x, p.y, r, r * 0.28, 0, 0, Math.PI * 2); g.stroke();
  if (t > 0.3) {
    g.strokeStyle = (color || 'rgba(255,255,255,') + (a * 0.5).toFixed(3) + ')';
    g.beginPath(); g.ellipse(p.x, p.y, r * 0.6, r * 0.6 * 0.28, 0, 0, Math.PI * 2); g.stroke();
  }
}

function drawEffects(g, W, H, hzY, t) {
  for (const r of G.ripples) drawRippleAt(g, proj(r.x, r.dist, W, H, hzY), r.size, r.t);
  for (const p of G.particles) {
    if (p.kind === 'bubble') {
      const q = proj(p.x, p.dist, W, H, hzY);
      const a = 1 - p.t / p.life;
      g.fillStyle = 'rgba(240,255,255,' + (0.7 * a).toFixed(2) + ')';
      g.strokeStyle = 'rgba(255,255,255,' + (0.9 * a).toFixed(2) + ')';
      g.lineWidth = 1;
      const rr = (2 + p.r * 4) * q.k * 1.4;
      g.beginPath(); g.arc(q.x, q.y - p.t * 2, rr, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(q.x - rr * 0.3, q.y - p.t * 2 - rr * 0.3, rr * 0.3, 0, Math.PI * 2); g.fill();
    }
  }
  for (const s of G.splashes) {
    const q = proj(s.x, s.dist, W, H, hzY);
    const a = 1 - s.t / s.life;
    g.fillStyle = 'rgba(235,248,255,' + (0.85 * a).toFixed(2) + ')';
    const r = Math.max(1, 3.2 * q.k);
    g.beginPath(); g.arc(q.x, q.y - s.h * 26 * q.k, r, 0, Math.PI * 2); g.fill();
  }
  // птицы над активными точками
  for (const h of G.hot) {
    if (h.kind !== 'birds') continue;
    const q = proj(h.x, h.dist, W, H, hzY);
    for (let i = 0; i < 3; i++) {
      const a = t * (0.8 + i * 0.2) + i * 2.1;
      const bx = q.x + Math.cos(a) * 40 * (0.6 + q.k);
      const by = q.y - 50 * (0.5 + q.k) + Math.sin(a * 1.3) * 12;
      drawGull(g, bx, by, 6 + 8 * q.k, t * 8 + i);
    }
  }
}
function drawGull(g, x, y, s, ph) {
  const f = Math.sin(ph) * 0.5;
  g.strokeStyle = 'rgba(245,245,240,0.95)';
  g.lineWidth = Math.max(1.2, s * 0.18);
  g.beginPath();
  g.moveTo(x - s, y - s * f);
  g.quadraticCurveTo(x - s * 0.4, y - s * 0.5 - s * f * 0.5, x, y);
  g.quadraticCurveTo(x + s * 0.4, y - s * 0.5 - s * f * 0.5, x + s, y - s * f);
  g.stroke();
}

function drawAtmosphere(g, W, H, hzY, t, light, dt) {
  // светлячки ночью
  if (light.night > 0.4 && SAVE.weather !== 'rain') {
    for (const f of FIREFLIES) {
      const x = (f.x + Math.sin(t * f.sp + f.p) * 0.03) * W;
      const y = (f.y + Math.cos(t * f.sp * 1.3 + f.p) * 0.02) * H;
      if (x > W * 0.25 && x < W * 0.75) continue;
      const a = (0.5 + 0.5 * Math.sin(t * 3 + f.p)) * light.night;
      const gr = g.createRadialGradient(x, y, 0, x, y, 7);
      gr.addColorStop(0, 'rgba(230,255,140,' + (0.9 * a).toFixed(2) + ')');
      gr.addColorStop(1, 'rgba(230,255,140,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, 7, 0, 6.29); g.fill();
    }
  }
  // летающие птицы днём
  if (light.day > 0.5) {
    if (BIRDS.length === 0 && Math.random() < dt * 0.05) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      for (let i = 0; i < randi(2, 5); i++) BIRDS.push({ x: dir > 0 ? -40 - i * 25 : W + 40 + i * 25, y: hzY * rand(0.2, 0.6) + i * 8, v: dir * rand(40, 60), p: Math.random() * 6 });
    }
  }
  for (const b of BIRDS) { b.x += b.v * dt; drawGull(g, b.x, b.y, 7, t * 9 + b.p); }
  for (let i = BIRDS.length - 1; i >= 0; i--) if (BIRDS[i].x < -100 || BIRDS[i].x > W + 100) BIRDS.splice(i, 1);
  // дождь
  if (SAVE.weather === 'rain') {
    g.strokeStyle = 'rgba(200,215,230,0.45)';
    g.lineWidth = 1;
    g.beginPath();
    for (const r of RAIN) {
      const y = ((r.y + t * r.s * 1.4) % 1) * H;
      const x = ((r.x + t * 0.05) % 1) * W;
      g.moveTo(x, y); g.lineTo(x - 3, y + 14 * r.l);
    }
    g.stroke();
    if (Math.random() < 0.6) {
      const d = rand(3, 50);
      addRipple(rand(-14, 14), d, 0.25);
    }
  }
  // туман
  if (SAVE.weather === 'fog' || G.loc === 'swamp') {
    const k = SAVE.weather === 'fog' ? 0.5 : 0.22;
    const gr = g.createLinearGradient(0, hzY - H * 0.2, 0, hzY + H * 0.25);
    const c = light.night > 0.5 ? '120,140,160' : '225,232,228';
    gr.addColorStop(0, 'rgba(' + c + ',0)');
    gr.addColorStop(0.5, 'rgba(' + c + ',' + k + ')');
    gr.addColorStop(1, 'rgba(' + c + ',0)');
    g.fillStyle = gr; g.fillRect(0, hzY - H * 0.2, W, H * 0.45);
  }
}

/* ---------------------------------------------------------------- удилище */
const ROD_COLORS = { rod_float_1: '#6a8a3a', rod_float_2: '#2a5a8a', rod_float_3: '#7a2a2a', rod_float_4: '#1a1a1a', rod_feeder_1: '#3a4a5a', rod_feeder_2: '#2a3a2a', rod_feeder_3: '#4a2a5a', rod_feeder_4: '#101010', rod_spin_1: '#5a5a5a', rod_spin_2: '#1a3a6a', rod_spin_3: '#6a1a1a', rod_spin_4: '#0a0a0a' };
function rodGeometry(W, H, target) {
  const type = G.rigType;
  const butt = { x: W * 0.9 + G.tilt * W * 0.03, y: H * 1.08 };
  let tip = type === 'feeder' ? { x: W * 0.66, y: H * 0.2 } : type === 'spin' ? { x: W * 0.62, y: H * 0.42 } : { x: W * 0.58, y: H * 0.26 };
  tip.x += G.tilt * W * 0.12;
  if (G.phase === 'charge') { tip.x += W * 0.12 * G.power; tip.y -= H * 0.12 * G.power; }
  if (G.phase === 'flight' && G.cast) { const k = Math.max(0, 1 - G.cast.t / 0.25); tip.x += W * 0.12 * k; tip.y -= H * 0.1 * k; }
  // изгиб под нагрузкой
  let bend = 0;
  const st = rigStats();
  if (st.rod) bend = clamp(G.tensionShow / st.rod.power, 0, 1.3);
  let tipKick = 0;
  if (G.rigType === 'feeder' && G.bite) {
    if (G.phase === 'bite') tipKick = 0.55 + 0.25 * Math.sin(VIEW.t * 9);
    else if (G.bite.twitch > 0) tipKick = 0.2 * G.bite.twitch * (0.6 + 0.4 * Math.sin(VIEW.t * 40));
  }
  if (G.rigType === 'feeder' && G.phase === 'wait' && G.bobberNoise > 0) tipKick = 0.06 * G.bobberNoise * Math.sin(VIEW.t * 30);
  if (G.phase === 'snag') bend = 0.7 + Math.sin(VIEW.t * 20) * 0.05;
  if (target && bend > 0) {
    const dx = target.x - tip.x, dy = target.y - tip.y;
    const L = Math.hypot(dx, dy) || 1;
    tip = { x: tip.x + dx / L * bend * H * 0.16, y: tip.y + dy / L * bend * H * 0.22 + bend * H * 0.06 };
  }
  if (tipKick) { tip = { x: tip.x - tipKick * W * 0.025, y: tip.y + tipKick * H * 0.16 }; bend = Math.max(bend, tipKick * 0.5); }
  const mid = { x: lerp(butt.x, tip.x, 0.55) + bend * W * 0.01, y: lerp(butt.y, tip.y, 0.55) - bend * H * 0.06 - H * 0.02 };
  return { butt, tip, mid, bend };
}
function bez(a, m, b, t) {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * m.x + t * t * b.x, y: u * u * a.y + 2 * u * t * m.y + t * t * b.y };
}
function drawRod(g, W, H, geo) {
  const r = rigOf();
  const color = ROD_COLORS[r.rod] || '#333';
  const { butt, tip, mid } = geo;
  const segs = 24;
  const base = Math.max(6, H * 0.028);
  // тень
  g.save();
  g.lineCap = 'round';
  for (let i = 0; i < segs; i++) {
    const a = bez(butt, mid, tip, i / segs), b = bez(butt, mid, tip, (i + 1) / segs);
    const w = base * (1 - i / segs * 0.85);
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = w + 2;
    g.beginPath(); g.moveTo(a.x + 3, a.y + 4); g.lineTo(b.x + 3, b.y + 4); g.stroke();
  }
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const a = bez(butt, mid, tip, t0), b = bez(butt, mid, tip, (i + 1) / segs);
    const w = base * (1 - t0 * 0.85);
    let c = color;
    if (t0 < 0.22) c = G.rigType === 'float' && r.rod === 'rod_float_1' ? '#8a5a2a' : '#2a2a2a';
    if (t0 > 0.86 && G.rigType === 'feeder') c = ['#ff4040', '#ffe040', '#40ff80', '#ff60c0'][Math.max(0, (RODS[r.rod] || { tier: 1 }).tier - 1)];
    g.strokeStyle = c;
    g.lineWidth = w;
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.22)';
    g.lineWidth = Math.max(1, w * 0.25);
    g.beginPath(); g.moveTo(a.x - w * 0.2, a.y - w * 0.2); g.lineTo(b.x - w * 0.2, b.y - w * 0.2); g.stroke();
  }
  // пробковая рукоять
  if (true) {
    const a = bez(butt, mid, tip, 0.02), b = bez(butt, mid, tip, 0.18);
    g.strokeStyle = r.rod && r.rod.indexOf('spin') >= 0 ? '#c89a5a' : '#2a2a2a';
    g.lineWidth = base * 1.25;
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.15)';
    g.lineWidth = base * 0.3;
    g.beginPath(); g.moveTo(a.x - 3, a.y - 3); g.lineTo(b.x - 3, b.y - 3); g.stroke();
  }
  // кольца
  for (const tt of [0.32, 0.45, 0.57, 0.68, 0.78, 0.87, 0.95]) {
    const p = bez(butt, mid, tip, tt);
    const rr = Math.max(1.6, base * (0.55 - tt * 0.35));
    g.strokeStyle = '#d8dce2'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(p.x, p.y - rr, rr, 0, Math.PI * 2); g.stroke();
  }
  // катушка
  const rp = bez(butt, mid, tip, 0.24);
  const rs = base * 2.3;
  g.fillStyle = '#1b1b1b';
  g.beginPath(); g.ellipse(rp.x + rs * 0.2, rp.y + rs * 0.8, rs * 0.75, rs * 0.95, -0.4, 0, Math.PI * 2); g.fill();
  const reelC = { reel_1: '#7a8a7a', reel_2: '#3a6aaa', reel_3: '#aa3a3a', reel_4: '#3a3a3a', reel_5: '#d8b04a' }[r.reel] || '#555';
  const gr = g.createRadialGradient(rp.x - rs * 0.2, rp.y + rs * 0.5, 2, rp.x, rp.y + rs * 0.8, rs);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.3, reelC); gr.addColorStop(1, '#101010');
  g.fillStyle = gr;
  g.beginPath(); g.ellipse(rp.x + rs * 0.2, rp.y + rs * 0.8, rs * 0.6, rs * 0.78, -0.4, 0, Math.PI * 2); g.fill();
  // ручка катушки вращается при подмотке
  const ang = VIEW.t * (G.reel ? 14 : 0);
  const hx = rp.x + rs * 0.2 + Math.cos(ang) * rs * 0.9, hy = rp.y + rs * 0.8 + Math.sin(ang) * rs * 0.9;
  g.strokeStyle = '#2a2a2a'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(rp.x + rs * 0.2, rp.y + rs * 0.8); g.lineTo(hx, hy); g.stroke();
  g.fillStyle = reelC; g.beginPath(); g.arc(hx, hy, rs * 0.22, 0, 6.29); g.fill();
  g.restore();
  // светляк на кончике ночью
  if (G.rigType === 'feeder' && G._night > 0.5) {
    const gr2 = g.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, 14);
    gr2.addColorStop(0, 'rgba(120,255,140,0.9)'); gr2.addColorStop(1, 'rgba(120,255,140,0)');
    g.fillStyle = gr2; g.beginPath(); g.arc(tip.x, tip.y, 14, 0, 6.29); g.fill();
  }
}

/* ---------------------------------------------------------------- леска, поплавок, приманка */
function drawLine(g, from, to, sag) {
  g.strokeStyle = G._night > 0.5 ? 'rgba(200,230,255,0.55)' : 'rgba(250,250,250,0.6)';
  g.lineWidth = 1;
  const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2 + sag;
  g.beginPath(); g.moveTo(from.x, from.y); g.quadraticCurveTo(mx, my, to.x, to.y); g.stroke();
}
function drawFloat(g, p, t, state) {
  const s = Math.max(0.42, p.k) * Math.min(1.4, CH / 372);
  const H = 46 * s;
  let dy = Math.sin(t * 2.2) * 1.2 * s;
  let rot = 0, sub = 0;
  const b = G.bite;
  if (G.bobberNoise > 0) dy += Math.sin(t * 30) * G.bobberNoise * 1.5 * s;
  if (b) {
    if (b.twitch > 0) dy += Math.sin(t * 40) * b.twitch * 3 * s;
    if (b.stage === 'take') {
      const k = clamp(b.t / 0.25, 0, 1);
      if (b.style === 'dip' || b.style === 'run') sub = k * 0.95;
      else if (b.style === 'drag') { sub = k * 0.5; p = { x: p.x + k * 18 * s * Math.sin(b.t * 2), y: p.y, k: p.k }; }
      else if (b.style === 'lift') { rot = k * Math.PI / 2 * 0.95; dy -= k * 6 * s; }
    }
  }
  if (state === 'flight') sub = 0;
  g.save();
  g.translate(p.x, p.y + dy);
  g.rotate(rot);
  // круги на воде вокруг поплавка
  g.strokeStyle = 'rgba(255,255,255,0.25)';
  g.lineWidth = 1;
  g.beginPath(); g.ellipse(0, 0, 10 * s, 3 * s, 0, 0, Math.PI * 2); g.stroke();
  const vis = 1 - sub;
  g.beginPath(); g.rect(-20 * s, -H * 1.2, 40 * s, H * 1.2 * (rot ? 2 : 1)); g.clip();
  const top = -H * vis;
  // антенна
  const glow = G._night > 0.5;
  g.fillStyle = glow ? '#b6ff6a' : '#ff3a1a';
  g.fillRect(-1.6 * s, top - H * 0.05, 3.2 * s, H * 0.55);
  if (glow) {
    const gr = g.createRadialGradient(0, top + H * 0.1, 0, 0, top + H * 0.1, 18 * s);
    gr.addColorStop(0, 'rgba(180,255,110,0.7)'); gr.addColorStop(1, 'rgba(180,255,110,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, top + H * 0.1, 18 * s, 0, 6.29); g.fill();
  }
  // тело
  const gb = g.createLinearGradient(-6 * s, 0, 6 * s, 0);
  gb.addColorStop(0, '#d8d8d8'); gb.addColorStop(0.4, '#ffffff'); gb.addColorStop(1, '#9a9a9a');
  g.fillStyle = gb;
  g.beginPath(); g.ellipse(0, top + H * 0.62, 5.5 * s, H * 0.22, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2a2a2a';
  g.fillRect(-1.6 * s, top + H * 0.47, 3.2 * s, 2 * s);
  g.restore();
}
function drawLure(g, p, t) {
  const s = Math.max(0.35, p.k);
  if (G.lureMoving) {
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(p.x - 16 * s, p.y + 10 * s); g.lineTo(p.x, p.y); g.lineTo(p.x + 16 * s, p.y + 10 * s);
    g.stroke();
  }
  const lure = rigStats().lure;
  if (lure && lure.layer === 'surface') {
    g.fillStyle = '#e8e8e8';
    g.beginPath(); g.ellipse(p.x, p.y, 5 * s, 2.5 * s, 0, 0, 6.29); g.fill();
  } else {
    g.fillStyle = 'rgba(255,255,255,' + (0.3 + 0.3 * Math.sin(t * 12)).toFixed(2) + ')';
    g.beginPath(); g.arc(p.x, p.y + 2 * s, 2.5 * s, 0, 6.29); g.fill();
  }
}
function drawFishInWater(g, p, f, t) {
  if (!f || f.junk) {
    // бурун
    g.strokeStyle = 'rgba(255,255,255,0.4)';
    g.lineWidth = 1.2;
    g.beginPath(); g.ellipse(p.x, p.y, 14 * p.k, 4 * p.k, 0, 0, 6.29); g.stroke();
    return;
  }
  const im = ASSETS.img(fishPath(f.id));
  const size = (60 + Math.pow(f.w, 0.45) * 50) * p.k * Math.min(1.5, CH / 372);
  // всплеск при рывках
  if (f.beh === 'run' && Math.random() < 0.3) G.splashes.length < 160 && G.splashes.push({ x: fishWorldX() + rand(-0.4, 0.4), dist: f.dist, vx: rand(-0.5, 0.5), vy: rand(1, 2), h: 0, t: 0, life: 0.5 });
  if (f.jumping > 0 && im.complete) {
    const h = Math.sin(f.jumping * Math.PI) * 70 * p.k;
    g.save();
    g.translate(p.x, p.y - h);
    g.rotate((f.dir || 1) * (0.5 - f.jumping) * 1.2);
    if (f.dir > 0) g.scale(-1, 1);
    g.drawImage(im, -size / 2, -size / 4, size, size / 2);
    g.restore();
    return;
  }
  if (f.dist < 14 && im.complete) {
    g.save();
    g.globalAlpha = clamp((14 - f.dist) / 10, 0, 0.55);
    g.translate(p.x, p.y + 10 * p.k);
    if (f.dir > 0) g.scale(-1, 1);
    g.filter = 'brightness(0.35) blur(1px)';
    g.drawImage(im, -size / 2, -size / 4, size, size / 2);
    g.filter = 'none';
    g.restore();
  }
  g.strokeStyle = 'rgba(255,255,255,0.45)';
  g.lineWidth = 1.2;
  const w2 = (10 + Math.sin(t * 12) * 3) * p.k * 2;
  g.beginPath(); g.ellipse(p.x, p.y, w2, w2 * 0.25, 0, 0, 6.29); g.stroke();
}

/* ---------------------------------------------------------------- прицел */
function drawAim(g, W, H, hzY, t) {
  if (!(G.phase === 'idle' || G.phase === 'charge')) return;
  const mc = maxCast();
  const d = G.phase === 'charge' ? Math.max(3.5, G.power * mc) : mc * 0.55;
  const p = proj(G.aimX, d, W, H, hzY);
  const pulse = 1 + Math.sin(t * 5) * 0.08;
  g.save();
  g.strokeStyle = G.phase === 'charge' ? 'rgba(255,214,90,0.95)' : 'rgba(255,255,255,0.7)';
  g.lineWidth = 2;
  g.setLineDash([6, 5]);
  const r = 18 * Math.max(0.4, p.k) * pulse * 1.6;
  g.beginPath(); g.ellipse(p.x, p.y, r, r * 0.32, 0, 0, 6.29); g.stroke();
  g.setLineDash([]);
  g.beginPath(); g.moveTo(p.x, p.y - r * 0.9); g.lineTo(p.x, p.y - r * 0.3); g.stroke();
  // прикормленная точка
  if (G.rigType === 'feeder' && G.chum.level > 0.05) {
    const q = proj(G.chum.x, G.chum.dist, W, H, hzY);
    g.strokeStyle = 'rgba(255,170,60,' + (0.4 + 0.4 * Math.min(1, G.chum.level)).toFixed(2) + ')';
    g.lineWidth = 2;
    g.beginPath(); g.ellipse(q.x, q.y, 22 * Math.max(0.4, q.k) * 1.6, 7 * Math.max(0.4, q.k) * 1.6, 0, 0, 6.29); g.stroke();
  }
  g.restore();
}

/* ---------------------------------------------------------------- кадр рыбалки */
function drawFishing(dt) {
  VIEW.t += dt;
  const t = VIEW.t;
  const W = CW, H = CH, g = cx;
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  let shx = 0, shy = 0;
  if (G.shake > 0) { shx = rand(-1, 1) * G.shake * 10; shy = rand(-1, 1) * G.shake * 6; }
  g.save();
  g.translate(shx, shy);
  const light = drawBackground(g, W, H, G.loc, SAVE.clock, t);
  const hzY = light.v.hzY;
  G._night = light.night;
  drawWater(g, W, H, hzY, t, G.L, light);
  drawEffects(g, W, H, hzY, t);
  drawAim(g, W, H, hzY, t);

  // цель лески
  let target = null, sag = 30;
  const c = G.cast;
  if (G.phase === 'fight' || G.phase === 'land') {
    const f = G.fish;
    if (f) {
      target = proj(fishWorldX(), Math.max(1.5, f.dist), W, H, hzY);
      sag = clamp(40 - G.tensionShow * 20, 2, 40) * (G.slackT > 0.5 ? 2 : 1);
    }
  } else if (c) {
    if (G.phase === 'flight') {
      const k = clamp(c.t / c.tFlight, 0, 1);
      const end = proj(c.x, c.dist, W, H, hzY);
      const geo0 = rodGeometry(W, H, null);
      target = { x: lerp(geo0.tip.x, end.x, k), y: lerp(geo0.tip.y, end.y, k) - Math.sin(k * Math.PI) * H * 0.35, k: lerp(1, end.k, k) };
      sag = 8;
    } else {
      target = proj(c.x, c.dist, W, H, hzY);
      sag = G.rigType === 'feeder' ? 4 : G.rigType === 'spin' ? (G.reel ? 6 : 20) : 26;
      if (G.phase === 'snag') sag = 1;
    }
  }
  const geo = rodGeometry(W, H, target);
  if (target) {
    drawLine(g, geo.tip, target, sag);
    if (G.phase === 'fight' || G.phase === 'land') drawFishInWater(g, target, G.fish, t);
    else if (G.phase === 'flight') {
      if (G.rigType === 'float') drawFloat(g, target, t, 'flight');
      else { g.fillStyle = G.rigType === 'feeder' ? '#444' : '#ddd'; g.beginPath(); g.arc(target.x, target.y, 3 + 3 * target.k, 0, 6.29); g.fill(); }
    } else if (G.rigType === 'float') drawFloat(g, target, t, G.phase);
    else if (G.rigType === 'spin') drawLure(g, target, t);
    else {
      // фидер: точка входа лески в воду
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.beginPath(); g.ellipse(target.x, target.y, 6 * target.k + 2, 2 * target.k + 1, 0, 0, 6.29); g.stroke();
    }
  }
  drawRod(g, W, H, geo);
  drawAtmosphere(g, W, H, hzY, t, light, dt);
  // виньетка
  const vg = g.createRadialGradient(W / 2, H * 0.55, H * 0.3, W / 2, H * 0.55, W * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,' + (0.28 + light.night * 0.2).toFixed(2) + ')');
  g.fillStyle = vg; g.fillRect(-20, -20, W + 40, H + 40);
  // вспышка поклёвки
  if (G.phase === 'bite') {
    g.fillStyle = 'rgba(255,220,120,' + (0.08 + 0.06 * Math.sin(t * 20)).toFixed(3) + ')';
    g.fillRect(0, 0, W, H);
  }
  // красная виньетка при опасном натяжении
  if (G.phase === 'fight') {
    const st = rigStats();
    const danger = clamp((G.tensionShow / st.line.str - 0.75) / 0.25, 0, 1);
    if (danger > 0) {
      const rg = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.7);
      rg.addColorStop(0, 'rgba(200,20,10,0)'); rg.addColorStop(1, 'rgba(200,20,10,' + (danger * 0.45 * (0.7 + 0.3 * Math.sin(t * 18))).toFixed(3) + ')');
      g.fillStyle = rg; g.fillRect(0, 0, W, H);
    }
  }
  g.restore();
  if (SAVE.owned.sonar) drawSonar();
}

/* ---------------------------------------------------------------- эхолот */
const sonarCv = $('sonar');
const sonarCx = sonarCv ? sonarCv.getContext('2d') : null;
let sonarT = 0;
function drawSonar() {
  if (!sonarCx) return;
  sonarT += 1;
  if (sonarT % 3) return;
  const w = sonarCv.width, h = sonarCv.height, g = sonarCx;
  g.fillStyle = '#04121e'; g.fillRect(0, 0, w, h);
  const mc = Math.max(10, maxCast());
  const maxD = Math.max(3, ...G.L.depth.map(p => p[1])) * 1.1;
  const x0 = G.cast ? G.cast.x : G.aimX;
  g.beginPath(); g.moveTo(0, h);
  for (let i = 0; i <= 40; i++) {
    const d = 2 + (mc - 2) * i / 40;
    const y = 8 + depthAt(d, x0) / maxD * (h - 10);
    g.lineTo(i / 40 * w, y);
  }
  g.lineTo(w, h); g.closePath();
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#d89a3a'); gr.addColorStop(1, '#6a3a10');
  g.fillStyle = gr; g.fill();
  // рыбы по виду в зависимости от вероятности
  const { rates } = biteRates(Math.min(mc * 0.5, 30), x0, layerOfBait());
  let i = 0;
  for (const id in G.L.fish) {
    const s = SPECIES[id];
    const n = Math.min(3, Math.round((rates[id] || 0) * 60 * 2));
    for (let k = 0; k < n; k++) {
      const fx = ((i * 0.37 + k * 0.23 + VIEW.t * 0.02) % 1) * w;
      const dd = 2 + (mc - 2) * fx / w;
      const bottom = depthAt(dd, x0);
      const fd = Math.min(bottom * 0.95, (s.layer === 'bottom' ? 0.85 : s.layer === 'mid' ? 0.5 : 0.15) * bottom);
      const fy = 8 + fd / maxD * (h - 10);
      g.fillStyle = PREDATORS[id] ? '#ff6a4a' : '#f0e040';
      g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx + 6, fy - 3); g.lineTo(fx + 10, fy); g.lineTo(fx + 6, fy + 3); g.closePath(); g.fill();
    }
    i++;
  }
  if (G.cast) {
    const fx = (G.cast.dist - 2) / (mc - 2) * w;
    g.strokeStyle = '#7af0ff'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(fx, 0); g.lineTo(fx, h); g.stroke();
  }
  g.fillStyle = '#9fd8ff'; g.font = '600 11px ' + FONT;
  const dshow = G.cast ? depthAt(G.cast.dist, G.cast.x) : depthAt(mc * 0.55, G.aimX);
  g.fillText(dshow.toFixed(1).replace('.', ',') + ' м', 5, 13);
}

/* ---------------------------------------------------------------- сцена меню */
const menuCv = $('menuCv');
const menuCx = menuCv ? menuCv.getContext('2d') : null;
const MENU = { t: 0, loc: 'lake', splashT: 2 };
function drawMenu(dt) {
  if (!menuCx) return;
  MENU.t += dt;
  const W = CW, H = CH, g = menuCx;
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  const saveWeather = SAVE.weather; SAVE.weather = 'clear';
  const light = drawBackground(g, W, H, MENU.loc, 0, MENU.t, { fixedTod: 'evening' });
  const hzY = light.v.hzY;
  drawWater(g, W, H, hzY, MENU.t, LOCATIONS[MENU.loc], light);
  MENU.splashT -= dt;
  if (MENU.splashT <= 0) { MENU.splashT = rand(2, 5); addSplash(rand(-10, 10), rand(8, 40), rand(0.5, 1.1)); }
  for (const r of G.ripples) r.t += dt;
  G.ripples = G.ripples.filter(r => r.t < 2.2);
  for (const s of G.splashes) { s.t += dt; s.vy -= 9 * dt; s.h += s.vy * dt; s.x += s.vx * dt; }
  G.splashes = G.splashes.filter(s => s.t < s.life && s.h > -0.1);
  drawEffects(g, W, H, hzY, MENU.t);
  // рыбак на мостках — силуэт
  drawAngler(g, W, H, hzY, MENU.t);
  drawAtmosphere(g, W, H, hzY, MENU.t, { night: 0, day: 0, eve: 1 }, dt);
  SAVE.weather = saveWeather;
  const vg = g.createRadialGradient(W / 2, H * 0.5, H * 0.3, W / 2, H * 0.5, W * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(10,6,4,0.45)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
}
function drawAngler(g, W, H, hzY, t) {
  // мостки
  const s = H / 372;
  const px = W * 0.47, py = H * 0.86;
  g.save();
  g.fillStyle = '#2a1a10';
  g.beginPath(); g.moveTo(px - 160 * s, H + 4); g.lineTo(px - 40 * s, py); g.lineTo(px + 120 * s, py); g.lineTo(px + 240 * s, H + 4); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(255,190,120,0.25)'; g.lineWidth = 1.2;
  for (let i = 1; i < 7; i++) {
    const yy = py + (H - py) * i / 7;
    const k = (yy - py) / (H - py);
    g.beginPath(); g.moveTo(px - 40 * s - 120 * s * k, yy); g.lineTo(px + 120 * s + 120 * s * k, yy); g.stroke();
  }
  g.fillStyle = '#1c120a';
  for (const ox of [-20, 100]) { g.fillRect(px + ox * s, py, 8 * s, 30 * s); }
  // рыбак: сидит на ящике, ноги свешены с мостков
  const ax = px + 40 * s, ay = py;
  const sway = Math.sin(t * 0.8) * 4 * s;
  const breath = Math.sin(t * 1.6) * 0.8 * s;
  g.fillStyle = '#17100a';
  // ящик
  g.fillRect(ax - 4 * s, ay - 16 * s, 30 * s, 16 * s);
  g.fillStyle = '#2a1c10'; g.fillRect(ax - 4 * s, ay - 16 * s, 30 * s, 3 * s);
  g.fillStyle = '#17100a';
  // ноги
  g.beginPath();
  g.moveTo(ax + 2 * s, ay - 18 * s);
  g.quadraticCurveTo(ax - 14 * s, ay - 22 * s, ax - 26 * s, ay - 16 * s);
  g.lineTo(ax - 30 * s, ay + 10 * s);
  g.lineTo(ax - 22 * s, ay + 12 * s);
  g.lineTo(ax - 18 * s, ay - 8 * s);
  g.quadraticCurveTo(ax - 8 * s, ay - 10 * s, ax + 6 * s, ay - 10 * s);
  g.closePath(); g.fill();
  g.beginPath(); g.ellipse(ax - 28 * s, ay + 12 * s, 7 * s, 3 * s, 0, 0, 6.29); g.fill();
  // туловище в куртке
  g.beginPath();
  g.moveTo(ax + 8 * s, ay - 16 * s);
  g.quadraticCurveTo(ax + 12 * s, ay - 44 * s, ax - 2 * s, ay - 62 * s + breath);
  g.quadraticCurveTo(ax - 14 * s, ay - 64 * s + breath, ax - 20 * s, ay - 52 * s + breath);
  g.quadraticCurveTo(ax - 18 * s, ay - 34 * s, ax - 10 * s, ay - 18 * s);
  g.closePath(); g.fill();
  // руки к удилищу
  g.strokeStyle = '#17100a'; g.lineCap = 'round'; g.lineWidth = 7 * s;
  g.beginPath(); g.moveTo(ax - 8 * s, ay - 54 * s + breath); g.quadraticCurveTo(ax - 22 * s, ay - 46 * s, ax - 30 * s, ay - 40 * s + sway * 0.2); g.stroke();
  g.lineWidth = 6 * s;
  g.beginPath(); g.moveTo(ax - 2 * s, ay - 50 * s + breath); g.quadraticCurveTo(ax - 12 * s, ay - 36 * s, ax - 22 * s, ay - 32 * s); g.stroke();
  // голова, шея, шляпа
  g.beginPath(); g.ellipse(ax - 8 * s, ay - 70 * s + breath, 8.5 * s, 9.5 * s, -0.2, 0, 6.29); g.fill();
  g.beginPath(); g.ellipse(ax - 8 * s, ay - 77 * s + breath, 17 * s, 4 * s, -0.12, 0, 6.29); g.fill();
  g.beginPath(); g.moveTo(ax - 17 * s, ay - 78 * s + breath); g.quadraticCurveTo(ax - 9 * s, ay - 93 * s + breath, ax + 1 * s, ay - 79 * s + breath); g.fill();
  g.fillStyle = 'rgba(255,180,110,0.25)';
  g.beginPath(); g.ellipse(ax - 9 * s, ay - 80 * s + breath, 9 * s, 1.6 * s, -0.12, 0, 6.29); g.fill();
  // ведро
  g.fillStyle = '#1c140c';
  g.beginPath(); g.moveTo(ax + 34 * s, ay - 22 * s); g.lineTo(ax + 54 * s, ay - 22 * s); g.lineTo(ax + 51 * s, ay); g.lineTo(ax + 37 * s, ay); g.closePath(); g.fill();
  g.strokeStyle = '#1c140c'; g.lineWidth = 1.5 * s;
  g.beginPath(); g.arc(ax + 44 * s, ay - 22 * s, 10 * s, Math.PI, 0); g.stroke();
  // удочка
  const tipx = ax - 190 * s, tipy = ay - 150 * s + sway;
  g.strokeStyle = '#17100a'; g.lineWidth = 3 * s;
  g.beginPath(); g.moveTo(ax - 14 * s, ay - 28 * s); g.quadraticCurveTo(ax - 90 * s, ay - 120 * s, tipx, tipy); g.stroke();
  // леска и поплавок
  const fx = W * 0.36, fy = hzY + (H - hzY) * 0.32;
  g.strokeStyle = 'rgba(255,230,200,0.45)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(tipx, tipy); g.quadraticCurveTo((tipx + fx) / 2, (tipy + fy) / 2 + 40 * s, fx, fy); g.stroke();
  const bob = Math.sin(t * 2) * 1.5;
  g.fillStyle = '#ff3a1a'; g.fillRect(fx - 1.5, fy - 12 + bob, 3, 7);
  g.fillStyle = '#f4f0e8'; g.beginPath(); g.ellipse(fx, fy - 3 + bob, 3, 4, 0, 0, 6.29); g.fill();
  g.strokeStyle = 'rgba(255,220,180,0.3)';
  g.beginPath(); g.ellipse(fx, fy, 12 + Math.sin(t * 2) * 2, 3, 0, 0, 6.29); g.stroke();
  g.restore();
}
