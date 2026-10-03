'use strict';
/* =====================================================================
   Механика рыбалки: заброс, ожидание, поклёвка, подсечка, вываживание,
   фрикцион, натяжение, перегрузы, сходы, садок, время суток и погода.
   ===================================================================== */

const GLOBAL_BITE = 1.6;
const PREDATORS = {};
for (const k in SPECIES) {
  const s = SPECIES[k];
  PREDATORS[k] = Object.keys(s.lures).length >= 3 || (s.baits.livebait || 0) >= 1 || (s.baits.frog || 0) >= 1;
}

const G = {
  state: 'menu', paused: false, loc: 'pond', L: LOCATIONS.pond,
  phase: 'idle', rigType: 'float',
  aimX: 0, power: 0, powerDir: 1, charging: false,
  cast: null,               // { dist, x, t, tFlight }
  bait: null,               // текущее состояние насадки в воде
  waitT: 0, biteT: 0, bite: null,
  chum: { dist: 0, x: 0, level: 0 },
  hot: [], hotTimer: 20,
  fish: null,
  reel: false, tilt: 0, drag: 2,
  tension: 0, tensionEff: 0, tensionShow: 0, rodStress: 0, slackT: 0, lastPull: 0,
  keepnet: [], sess: null,
  lureMoving: false, lureStopT: 0,
  snag: null,
  msgT: 0, timeAcc: 0, shake: 0,
  ended: false,
  splashes: [], ripples: [], particles: [],
  jumpT: 0, ambientJumpT: 6,
};

/* ---------------------------------------------------------------- время суток */
function todOf(min) {
  const h = min / 60;
  if (h >= 4 && h < 7) return 'dawn';
  if (h >= 7 && h < 18) return 'day';
  if (h >= 18 && h < 21.5) return 'dusk';
  return 'night';
}
function bgWeights(min) {
  // веса картинок day / evening / night с плавными переходами
  const h = min / 60;
  const w = { day: 0, evening: 0, night: 0 };
  const ramp = (a, b) => clamp((h - a) / (b - a), 0, 1);
  if (h < 3.5 || h >= 22) w.night = 1;
  else if (h < 4.5) { const t = ramp(3.5, 4.5); w.night = 1 - t; w.evening = t; }
  else if (h < 6.5) w.evening = 1;
  else if (h < 7.5) { const t = ramp(6.5, 7.5); w.evening = 1 - t; w.day = t; }
  else if (h < 17.5) w.day = 1;
  else if (h < 18.5) { const t = ramp(17.5, 18.5); w.day = 1 - t; w.evening = t; }
  else if (h < 21) w.evening = 1;
  else { const t = ramp(21, 22); w.evening = 1 - t; w.night = t; }
  return w;
}
function clockStr(min) {
  const m = Math.floor(min) % 1440;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}
function rollWeather() {
  const r = Math.random();
  const loc = G.L || LOCATIONS.pond;
  let w = r < 0.38 ? 'clear' : r < 0.62 ? 'cloudy' : r < 0.78 ? 'rain' : r < 0.9 ? 'wind' : 'fog';
  if (loc === LOCATIONS.swamp && Math.random() < 0.4) w = 'fog';
  SAVE.weather = w;
  const p = Math.random();
  SAVE.pressure = w === 'rain' ? (p < 0.6 ? 'falling' : 'stable') : p < 0.3 ? 'rising' : p < 0.75 ? 'stable' : 'falling';
}

/* ---------------------------------------------------------------- снасть */
function rigOf(type) { return SAVE.rigs[type || G.rigType]; }
function rigReady(type) {
  const r = rigOf(type);
  if (!r.rod || !r.reel || !r.line) return 'Не собрана снасть: нужны удилище, катушка и леска';
  if (SAVE.broken[r.rod]) return 'Удилище сломано — почини его в магазине';
  if (type === 'spin') {
    if (!r.lure || !(SAVE.inv[r.lure] > 0)) return 'Нет приманки — выбери приманку';
  } else {
    if (!r.hook || !(SAVE.inv[r.hook] > 0)) return 'Закончились крючки';
    if (!r.bait || !(SAVE.inv[r.bait] > 0)) return 'Нет наживки — выбери насадку';
  }
  return null;
}
function rigStats(type) {
  const r = rigOf(type);
  const rod = RODS[r.rod], reel = REELS[r.reel], line = LINES[r.line];
  return { rod, reel, line, hook: r.hook ? HOOKS[r.hook] : null, bait: r.bait ? BAITS[r.bait] : null, lure: r.lure ? LURES[r.lure] : null, gb: r.gb ? GROUNDBAITS[r.gb] : null };
}
function maxCast() {
  const st = rigStats();
  if (!st.rod) return 10;
  let c = st.rod.cast;
  if (G.rigType === 'feeder' && st.gb) c *= 0.95;
  return Math.min(c, G.L.depth[G.L.depth.length - 1][0] * 0.95);
}

/* ---------------------------------------------------------------- дно */
function depthAt(dist, x) {
  const P = G.L.depth;
  let d = P[P.length - 1][1];
  for (let i = 0; i < P.length - 1; i++) {
    if (dist >= P[i][0] && dist <= P[i + 1][0]) {
      const t = (dist - P[i][0]) / (P[i + 1][0] - P[i][0]);
      d = lerp(P[i][1], P[i + 1][1], smooth(t));
      break;
    }
  }
  if (dist < P[0][0]) d = P[0][1] * dist / P[0][0];
  d *= 1 + 0.12 * Math.sin(x * 0.35 + dist * 0.21) + 0.06 * Math.sin(x * 1.1 - dist * 0.5);
  return Math.max(0.15, d);
}

/* ---------------------------------------------------------------- клёв */
function layerOfBait() {
  if (G.rigType === 'feeder') return 'bottom';
  if (G.rigType === 'spin') { const l = rigStats().lure; return l ? l.layer : 'mid'; }
  const bottom = G.cast ? depthAt(G.cast.dist, G.cast.x) : 2;
  const d = rigOf('float').depth;
  const r = d / bottom;
  if (r >= 0.85) return 'bottom';
  if (r >= 0.35) return 'mid';
  return 'surface';
}
function layerFactor(fishLayer, baitLayer) {
  const a = LAYERS.indexOf(fishLayer), b = LAYERS.indexOf(baitLayer);
  const d = Math.abs(a - b);
  return d === 0 ? 1 : d === 1 ? 0.5 : 0.15;
}
function speciesFactors(id, dist, x, opts) {
  const s = SPECIES[id];
  const st = rigStats();
  let f = 1;
  // насадка / приманка
  if (G.rigType === 'spin') {
    const lid = rigOf('spin').lure;
    f *= (s.lures[lid] || 0);
  } else {
    const bid = rigOf().bait;
    f *= (s.baits[bid] || 0);
  }
  if (f <= 0) return 0;
  // горизонт
  f *= layerFactor(s.layer, opts.layer);
  // глубина
  const dep = depthAt(dist, x);
  if (dep < s.depth[0]) f *= Math.exp(-(s.depth[0] - dep) / 1.2);
  else if (dep > s.depth[1]) f *= Math.exp(-(dep - s.depth[1]) / 2.5);
  // время суток
  f *= s.tod[opts.tod] || 1;
  // заметность лески
  f *= 1 - s.wary * st.line.vis * 1.1;
  // крючок
  if (G.rigType !== 'spin' && st.hook) {
    const diff = st.hook.size - s.mouth;
    if (diff >= 2) f *= 0.25; else if (diff === 1) f *= 0.7;
  }
  // прикормка
  if (G.rigType === 'feeder' && G.chum.level > 0.02 && Math.abs(G.chum.dist - dist) < 4 && Math.abs(G.chum.x - x) < 3) {
    const gb = GROUNDBAITS[G.chum.gb];
    if (gb && !PREDATORS[id] && (!gb.fish || gb.fish.includes(id))) {
      let k = 1 + G.chum.level * 1.7;
      if (gb.night && opts.tod === 'night') k *= 1.3;
      f *= k;
    }
  }
  // активные точки
  for (const h of G.hot) {
    if (Math.abs(h.dist - dist) < h.r && Math.abs(h.x - x) < h.r * 0.8) {
      if (h.kind === 'bubbles' && s.layer === 'bottom' && !PREDATORS[id]) f *= 2.6;
      if ((h.kind === 'boil' || h.kind === 'birds') && PREDATORS[id]) f *= 2.8;
      if (h.kind === 'school' && !PREDATORS[id] && s.layer !== 'bottom') f *= 2.4;
    }
  }
  return f;
}
function biteRates(dist, x, layer) {
  const L = G.L;
  const tod = todOf(SAVE.clock);
  const opts = { tod, layer };
  let common = WEATHER[SAVE.weather].bite * PRESSURE[SAVE.pressure].bite * GLOBAL_BITE * (L.rate || 1);
  if (SAVE.owned.sonar) common *= 1.1;
  if (SAVE.thermos > 0) common *= 1.3;
  if (G.rigType === 'spin') common *= 1.5;
  const rates = {};
  let sum = 0;
  for (const id in L.fish) {
    const r = L.fish[id] * speciesFactors(id, dist, x, opts) * common / 60;
    if (r > 0) { rates[id] = r; sum += r; }
  }
  return { rates, sum };
}
function forecast() {
  // оценка клёва 0..5 для текущей снасти на средней дистанции
  const d = G.cast ? G.cast.dist : Math.min(maxCast() * 0.6, 25);
  const x = G.cast ? G.cast.x : 0;
  const { sum } = biteRates(d, x, layerOfBait());
  const perMin = sum * 60;
  return clamp(Math.round(perMin * 0.9), 0, 5);
}

function rollWeight(id) {
  const s = SPECIES[id];
  const L = G.L;
  const mul = (L.sizeMul && L.sizeMul[id] != null) ? L.sizeMul[id] : 1;
  const boost = (L.sizeBoost && L.sizeBoost[id]) || 1;
  const top = s.min + (s.max - s.min) * mul;
  let skew = 3.2;
  const bsize = G.rigType === 'spin' ? (rigStats().lure ? rigStats().lure.size : 2) : (rigStats().bait ? rigStats().bait.size : 2);
  skew -= (bsize - 2) * 0.55;
  if (G.rigType === 'feeder' && G.chum.level > 0.6) skew -= 0.2;
  let u = Math.pow(Math.random(), skew);
  const trophyChance = 0.035 * (SAVE.owned.charm ? 1.4 : 1);
  if (Math.random() < trophyChance) u = 0.7 + Math.random() * 0.3;
  let w = (s.min + (top - s.min) * u) * boost;
  w *= rand(0.94, 1.06);
  return Math.max(s.min * 0.9, Math.round(w * 1000) / 1000);
}

/* ---------------------------------------------------------------- сессия */
function startSession(locId) {
  G.loc = locId; G.L = LOCATIONS[locId];
  G.state = 'fish'; G.paused = false; G.ended = false;
  G.phase = 'idle'; G.cast = null; G.bite = null; G.fish = null; G.snag = null;
  G.hot = []; G.hotTimer = rand(8, 20);
  G.chum = { dist: 0, x: 0, level: 0, gb: null };
  G.keepnet = [];
  G.sess = { count: 0, weight: 0, money: 0, xp: 0, best: null, start: SAVE.clock, released: 0, lost: 0, junk: 0, night: 0, list: [] };
  G.splashes.length = 0; G.ripples.length = 0; G.particles.length = 0;
  G.rigType = SAVE.rig;
  if (rigReady(G.rigType) && !rigReady('float')) G.rigType = 'float';
  G.aimX = 0; G.tilt = 0; G.reel = false;
  const r = rigStats();
  G.drag = r.reel ? Math.min(r.reel.drag, r.line ? r.line.str * 0.75 : 2) : 2;
  G.drag = Math.round(G.drag * 10) / 10;
  SAVE.visited[locId] = 1;
  SAVE.lastLoc = locId;
  persist();
}

function setPhase(p) {
  G.phase = p;
  if (typeof onPhaseChange === 'function') onPhaseChange(p);
}

/* ---------------------------------------------------------------- заброс */
function beginCharge() {
  if (G.phase !== 'idle' || G.paused) return;
  const err = rigReady(G.rigType);
  if (err) { showMsg(err, 'warn'); AUD.error(); if (typeof openTackleQuick === 'function') setTimeout(openTackleQuick, 400); return; }
  G.charging = true; G.power = 0; G.powerDir = 1;
  setPhase('charge');
}
function releaseCast() {
  if (G.phase !== 'charge') return;
  G.charging = false;
  const p = clamp(G.power, 0.08, 1);
  const mc = maxCast();
  const dist = Math.max(3.5, p * mc * rand(0.95, 1.03));
  const x = G.aimX + rand(-1, 1) * (1 - rigStats().rod.sens) * 2.5 * p;
  G.cast = { dist, x, t: 0, tFlight: 0.55 + p * 0.7, landed: false, drift: 0 };
  G.bite = null; G.waitT = 0; G.biteT = 0;
  G.lureMoving = false; G.lureStopT = 0;
  AUD.play('cast', 0.8, rand(0.95, 1.05));
  haptic('light');
  setPhase('flight');
}
function onLanded() {
  const c = G.cast;
  c.landed = true;
  AUD.play('plop', 0.7, G.rigType === 'feeder' ? 0.75 : rand(0.95, 1.15));
  addRipple(c.x, c.dist, 1.2);
  addSplash(c.x, c.dist, G.rigType === 'feeder' ? 1.2 : 0.6);
  if (G.rigType === 'feeder') {
    const gbId = rigOf('feeder').gb;
    if (gbId && SAVE.inv[gbId] > 0) {
      SAVE.inv[gbId]--;
      const gb = GROUNDBAITS[gbId];
      if (G.chum.gb === gbId && Math.abs(G.chum.dist - c.dist) < 3.5 && Math.abs(G.chum.x - c.x) < 2.8) {
        G.chum.level = Math.min(1.6, G.chum.level + gb.power * 0.35);
        showMsg('Прикормка точки: ' + Math.round(G.chum.level / 1.6 * 100) + '%', 'info');
      } else {
        G.chum = { dist: c.dist, x: c.x, level: gb.power * 0.35, gb: gbId };
        showMsg('Новая точка прикормлена', 'info');
      }
      if (!SAVE.inv[gbId]) showMsg('Прикормка закончилась', 'warn');
    }
  }
  if (G.rigType === 'spin') setPhase('retrieve');
  else setPhase('wait');
  scheduleBite();
}

function scheduleBite() {
  G.biteT = 0;
  G.bite = null;
}

/* ---------------------------------------------------------------- ожидание и поклёвка */
function updateWait(dt) {
  const c = G.cast;
  // снос течением
  if (G.L.current > 0 && G.rigType === 'float') {
    c.x += G.L.current * 0.25 * dt;
    if (Math.abs(c.x - G.aimX) > 7) { showMsg('Поплавок снесло течением — перезабрось', 'info'); }
  }
  if (G.bite) { updateBite(dt); return; }
  G.waitT += dt;
  if (c.baitless) return;
  const layer = layerOfBait();
  const { rates, sum } = biteRates(c.dist, c.x, layer);
  const junkRate = G.L.junk / 60 * (layer === 'bottom' ? 1 : 0.3) * (G.rigType === 'spin' ? 0 : 1);
  const total = sum + junkRate;
  if (Math.random() < 1 - Math.exp(-total * dt)) {
    if (Math.random() < junkRate / total) startBite(null);
    else startBite(weightedPick(rates));
  }
  // ложные подрагивания поплавка от мелочи/ветра
  if (Math.random() < dt * 0.06) G.bobberNoise = 0.6;
}

function startBite(id) {
  const st = rigStats();
  const s = id ? SPECIES[id] : null;
  const wary = s ? s.wary : 0.2;
  const nib = rand(0.5, 1.4) + wary * rand(0.5, 2.2);
  let window_ = (0.9 + st.rod.sens * 0.7) * (s && s.style === 'jumper' ? 0.8 : 1);
  if (G.rigType === 'spin') window_ = 0.75 + st.rod.sens * 0.5;
  const style = !s ? 'drag' : s.layer === 'bottom' && !PREDATORS[id] && Math.random() < 0.35 ? 'lift' : (PREDATORS[id] ? 'run' : pick(['dip', 'dip', 'drag']));
  G.bite = { id, junk: !id, stage: G.rigType === 'spin' ? 'take' : 'nibble', t: 0, nib, window: window_, style, twitch: 0, w: id ? rollWeight(id) : 0 };
  if (G.rigType === 'spin') {
    G.bite.t = 0;
    showMsg('Удар!', 'bite');
    AUD.play('hookset', 0.5, 1.3);
    haptic('medium');
    setPhase('bite');
  }
}
function updateBite(dt) {
  const b = G.bite;
  b.t += dt;
  if (b.stage === 'nibble') {
    if (Math.random() < dt * 3.2) {
      b.twitch = 1;
      AUD.play('nibble', 0.35, rand(0.85, 1.2));
      if (G.rigType === 'feeder' && Math.random() < 0.5) AUD.play('bell', 0.25, rand(1.1, 1.3));
    }
    if (b.t > b.nib) {
      b.stage = 'take'; b.t = 0;
      setPhase('bite');
      showMsg('Поклёвка!', 'bite');
      haptic('medium');
      if (G.rigType === 'feeder') AUD.play('bell', 0.6, 1);
      else AUD.play('nibble', 0.6, 0.7);
      // самоподсечка на фидере
      if (G.rigType === 'feeder' && Math.random() < 0.25) { b.selfHook = true; }
    }
  } else if (b.stage === 'take') {
    if (b.t > b.window) {
      if (b.selfHook) { hookFish(true); return; }
      if (G.rigType === 'spin') {
        if (Math.random() < 0.3) { hookFish(true); return; }
        G.bite = null; setPhase('retrieve'); showMsg('Рыба не засеклась', 'warn');
        return;
      }
      // рыба объела насадку
      G.bite = null;
      const bid = rigOf().bait;
      if (bid && SAVE.inv[bid] > 0) SAVE.inv[bid]--;
      G.cast.baitless = true;
      showMsg('Насадку объели! Смотай и перезабрось', 'warn');
      AUD.play('bubbles', 0.4);
      setPhase('wait');
      updateBaitHud();
    }
  }
}

/* игрок нажал «Подсечь» */
function strike() {
  if (G.phase === 'wait' || G.phase === 'retrieve') {
    if (G.bite && G.bite.stage === 'nibble') {
      // рано
      AUD.play('hookset', 0.6);
      if (Math.random() < 0.22) { hookFish(false); return; }
      G.bite = null;
      showMsg('Рано подсёк — рыба ушла', 'warn');
      if (Math.random() < 0.4) { const bid = rigOf().bait; if (bid && SAVE.inv[bid] > 0) SAVE.inv[bid]--; G.cast.baitless = true; updateBaitHud(); }
      return;
    }
    // пустая подсечка — просто подёргивание
    AUD.play('hookset', 0.4, 1.2);
    G.shake = 0.15;
    return;
  }
  if (G.phase === 'bite' && G.bite && G.bite.stage === 'take') {
    hookFish(false);
  }
}
function hookFish(auto) {
  const b = G.bite;
  const st = rigStats();
  AUD.play('hookset', 0.8);
  haptic('heavy');
  G.shake = 0.3;
  if (b.junk) {
    const r = Math.random();
    let jid = r < 0.03 ? 'junk_chest' : r < 0.16 ? 'junk_bottle' : r < 0.32 ? 'junk_snag' : r < 0.66 ? 'junk_boot' : 'junk_can';
    const J = JUNK[jid];
    const w = rand(J.w[0], J.w[1]);
    G.fish = makeFightFish(null, w, jid);
    G.bite = null;
    setPhase('fight');
    showMsg('Что-то тяжёлое…', 'info');
    return;
  }
  // шанс засечь
  let chance = 0.9 * (st.hook ? st.hook.hold : 0.92) + st.rod.sens * 0.08;
  if (st.line.braid) chance += 0.05;
  if (G.cast.dist > 40 && !st.line.braid) chance -= (G.cast.dist - 40) * 0.004;
  if (auto) chance -= 0.1;
  if (Math.random() > chance) {
    G.bite = null;
    showMsg('Пустая подсечка!', 'warn');
    if (Math.random() < 0.5 && G.rigType !== 'spin') { const bid = rigOf().bait; if (bid && SAVE.inv[bid] > 0) SAVE.inv[bid]--; G.cast.baitless = true; updateBaitHud(); }
    setPhase(G.rigType === 'spin' ? 'retrieve' : 'wait');
    return;
  }
  G.fish = makeFightFish(b.id, b.w, null);
  G.bite = null;
  setPhase('fight');
  showMsg(auto ? 'Рыба засеклась сама!' : 'Есть! Тяни!', 'good');
}

/* ---------------------------------------------------------------- вываживание */
function makeFightFish(id, w, junk) {
  const s = id ? SPECIES[id] : null;
  const st = rigStats();
  let hold = st.hook ? st.hook.hold : 0.94;
  if (s && st.hook) {
    const diff = st.hook.size - s.mouth;
    if (diff < 0) hold -= 0.12 * (-diff);
  }
  if (G.rigType === 'spin') hold = 0.9 + (st.lure ? 0.02 * st.lure.size : 0);
  if (st.line.braid) hold -= 0.02;
  const pow = s ? s.pow : 0.25;
  return {
    id, junk, w, s, hold,
    maxPull: junk ? w * 0.35 + 0.3 : w * pow,
    stam: 1, beh: 'pull', behT: rand(0.5, 1.2), pullTarget: 0, pull: 0,
    lx: G.cast ? clamp(G.cast.x / 8, -1, 1) : 0, vx: rand(-0.4, 0.4), dir: 0,
    dist: G.cast ? G.cast.dist : 10, jumpCD: rand(2, 5), jumping: 0, landed: false, t: 0,
  };
}
function updateFight(dt) {
  const f = G.fish;
  const st = rigStats();
  const s = f.s;
  f.t += dt;
  // поведение
  f.behT -= dt;
  if (f.behT <= 0) {
    const style = s ? s.style : 'steady';
    const r = Math.random();
    const runP = style === 'runner' ? 0.38 : style === 'jumper' ? 0.3 : style === 'zigzag' ? 0.25 : style === 'bottom' ? 0.2 : 0.15;
    if (f.junk) { f.beh = 'pull'; f.behT = rand(1, 2); }
    else if (r < runP) { f.beh = 'run'; f.behT = rand(0.6, 1.6); f.vx = rand(-1.2, 1.2); }
    else if (r < runP + 0.22) { f.beh = 'rest'; f.behT = rand(0.6, 1.6); }
    else if (r < runP + 0.34) { f.beh = 'toward'; f.behT = rand(0.6, 1.3); }
    else { f.beh = 'pull'; f.behT = rand(0.8, 2); f.vx = rand(-0.7, 0.7); }
    if (style === 'zigzag') f.vx = (f.vx > 0 ? -1 : 1) * rand(0.6, 1.2);
  }
  const curve = 0.25 + 0.75 * f.stam;
  let target;
  switch (f.beh) {
    case 'run': target = f.maxPull * rand(0.9, 1.15) * curve; break;
    case 'rest': target = f.maxPull * 0.18 * curve; break;
    case 'toward': target = f.maxPull * 0.03; break;
    default: target = f.maxPull * 0.55 * curve;
  }
  if (f.junk) target = f.maxPull * (0.8 + 0.2 * Math.sin(f.t * 3));
  // наклон удилища против хода
  f.lx = clamp(f.lx + f.vx * dt * 0.25, -1, 1);
  if (Math.abs(f.lx) > 0.97) f.vx *= -0.6;
  f.dir = f.vx > 0.1 ? 1 : f.vx < -0.1 ? -1 : 0;
  let drainMul = 1;
  if (G.tilt !== 0 && f.dir !== 0) {
    if (G.tilt === -f.dir) { target *= 0.8; drainMul = 1.7; }
    else if (G.tilt === f.dir) { target *= 1.15; drainMul = 0.8; }
  }
  // прыжки
  if (s && (s.style === 'jumper' || (s.style === 'runner' && PREDATORS[f.id])) && f.dist < 40) {
    f.jumpCD -= dt;
    if (f.jumpCD <= 0) {
      f.jumpCD = rand(3, 7);
      f.jumping = 1;
      AUD.play('splash_b', 0.6, rand(1.1, 1.3), f.lx * 0.6);
      addSplash(fishWorldX(), f.dist, 1.4);
      target = f.maxPull * 1.2;
      // встряска головой
      const slackish = G.tension < 0.12 * f.maxPull;
      const tooHard = G.tensionEff > 0.9 * st.line.str;
      if ((slackish || tooHard) && Math.random() < (1 - f.hold) * 2 + 0.04) { loseFish('jump'); return; }
    }
  }
  if (f.jumping > 0) f.jumping = Math.max(0, f.jumping - dt * 1.4);
  f.pull += (target - f.pull) * Math.min(1, dt * 6);
  const pull = f.pull;
  // подмотка
  const reelLoad = 0.25 + 0.15 * Math.pow(f.w, 0.6);
  const drag = G.drag;
  let tension, slip = 0;
  if (G.reel) {
    tension = pull + reelLoad;
    if (tension > drag) { slip = (tension - drag); tension = drag; }
    else {
      const easy = 1 + 0.8 * (1 - Math.min(1, pull / 1.5));
      const sp = st.reel.speed * easy * Math.max(0.15, 1 - 0.6 * pull / drag);
      f.dist -= sp * dt;
    }
  } else {
    tension = pull * 0.9;
    if (pull > drag) { slip = pull - drag; tension = drag; }
  }
  if (f.beh === 'toward') f.dist -= 0.6 * dt;
  if (slip > 0) {
    f.dist += slip / (1 + f.w * 0.3) * 1.2 * dt;
    AUD.loop('drag', true, 0.45, 0.85 + Math.min(0.5, slip * 0.1));
  } else AUD.loop('drag', false);
  AUD.loop('reel', G.reel && slip === 0, 0.35, 0.8 + st.reel.speed * 0.15);
  // рывки
  const jerkRaw = Math.max(0, (pull - G.lastPull) / Math.max(dt, 0.001)) * (st.line.braid ? 0.02 : 0.012);
  const jerk = Math.min(jerkRaw, 0.2 * drag + 0.2) * (slip > 0 ? 0.5 : 1);
  G.lastPull = pull;
  G.tension = tension;
  G.tensionEff = tension + jerk;
  G.tensionShow += (G.tensionEff - G.tensionShow) * Math.min(1, dt * 8);
  // выносливость
  const ratio = tension / Math.max(0.05, f.maxPull);
  const drain = (0.05 + 0.18 * ratio) * drainMul / ((s ? s.stam : 0.5) * Math.pow(f.w + 0.5, 0.35));
  f.stam = Math.max(0, f.stam - drain * dt);
  // обрыв
  if (G.tensionEff > st.line.str) { lineBreak('line'); return; }
  // перегруз удилища
  if (G.tensionEff > st.rod.power) {
    G.rodStress += (G.tensionEff / st.rod.power - 1) * 0.9 * dt + 0.05 * dt;
    if (G.rodStress > 1) { lineBreak('rod'); return; }
  } else G.rodStress = Math.max(0, G.rodStress - 0.12 * dt);
  // кончилась леска
  if (f.dist > st.reel.cap) { lineBreak('spool'); return; }
  // провис лески — рыба может сойти
  const slackLimit = Math.min(0.06 + 0.04 * f.w, 0.4 * drag);
  if (tension < slackLimit && !f.junk) G.slackT += dt; else G.slackT = Math.max(0, G.slackT - dt * 2);
  if (G.slackT > 1.2 && Math.random() < (1 - f.hold) * 4 * dt) { loseFish('slack'); return; }
  // у берега: свежая рыба делает рывок прочь
  if (f.dist <= 1.2) {
    if (!f.junk && f.stam > 0.3 && f.w > 0.35) {
      f.dist = 1.3; f.beh = 'run'; f.behT = rand(0.8, 1.5); f.vx = rand(-1.4, 1.4);
      f.pull = f.maxPull * 0.9;
      addSplash(fishWorldX(), 2, 1.2);
      AUD.play('splash_b', 0.5, rand(1, 1.2));
      if (!f.boltMsg) { f.boltMsg = 1; showMsg('Рыба ещё сильна — утоми её!', 'warn'); }
    } else landFish();
  }
}
function fishWorldX() {
  const f = G.fish;
  return f ? f.lx * Math.min(12, f.dist * 0.35 + 3) : 0;
}

function landFish() {
  const f = G.fish;
  if (!f.junk && f.w > 2 && !SAVE.owned.net) {
    const risk = f.stam < 0.12 ? 0.15 : 0.4;
    if (Math.random() < risk) { loseFish('net'); return; }
  }
  AUD.stopLoops();
  AUD.play('flop', 0.7);
  AUD.play('splash_s', 0.6);
  haptic('success');
  setPhase('land');
  G.reel = false;
  setTimeout(() => { if (G.phase === 'land') onCatch(f); }, 650);
}
function loseFish(reason) {
  AUD.stopLoops();
  const f = G.fish;
  const msgs = { slack: 'Сход! Леска провисла', jump: 'Сошла в прыжке!', net: 'Сорвалась у берега — нужен подсак', };
  showMsg(msgs[reason] || 'Сход!', 'bad');
  AUD.play('splash_s', 0.7);
  AUD.jingle('j_fail', AUD.lose);
  haptic('error');
  if (G.rigType !== 'spin') { const bid = rigOf().bait; if (bid && SAVE.inv[bid] > 0) SAVE.inv[bid]--; }
  G.sess.lost++;
  G.fish = null; G.cast = null;
  G.tension = G.tensionEff = 0; G.slackT = 0; G.rodStress = 0;
  setPhase('idle');
  updateBaitHud();
  persistSoon();
}
function lineBreak(reason) {
  AUD.stopLoops();
  AUD.play('snap', 0.9);
  AUD.jingle('j_fail', AUD.lose);
  haptic('error');
  G.shake = 0.5;
  const r = rigOf();
  let txt = 'Обрыв лески!';
  if (reason === 'rod') {
    txt = 'Удилище сломалось от перегруза!';
    SAVE.broken[r.rod] = 1;
  } else if (reason === 'spool') txt = 'Рыба смотала всю леску — обрыв!';
  if (G.rigType === 'spin') { if (r.lure && SAVE.inv[r.lure] > 0) SAVE.inv[r.lure]--; txt += ' Приманка потеряна'; }
  else {
    if (r.hook && SAVE.inv[r.hook] > 0) SAVE.inv[r.hook]--;
    if (r.bait && SAVE.inv[r.bait] > 0) SAVE.inv[r.bait]--;
  }
  SAVE.stats.breaks = (SAVE.stats.breaks || 0) + 1;
  showMsg(txt, 'bad');
  G.sess.lost++;
  G.fish = null; G.cast = null;
  G.tension = G.tensionEff = 0; G.slackT = 0; G.rodStress = 0;
  setPhase('idle');
  updateBaitHud();
  persist();
}

/* ---------------------------------------------------------------- спиннинг: проводка */
function updateRetrieve(dt) {
  const c = G.cast;
  const st = rigStats();
  if (G.bite) { updateBite(dt); if (G.phase !== 'retrieve' && G.phase !== 'bite') return; }
  if (G.phase === 'bite') return;
  if (G.reel) {
    c.dist -= st.reel.speed * 0.8 * dt;
    c.x += (G.aimX * 0.3 - c.x) * dt * 0.15;
    G.lureMoving = true; G.lureStopT = 0;
    AUD.loop('reel', true, 0.28, 1);
  } else {
    if (G.lureMoving) G.lureStopT = 0;
    G.lureMoving = false; G.lureStopT += dt;
    AUD.loop('reel', false);
  }
  if (c.dist <= 2.2) {
    AUD.loop('reel', false);
    G.cast = null;
    setPhase('idle');
    return;
  }
  const lure = st.lure;
  let k = G.lureMoving ? 1 : (lure.layer === 'bottom' && G.lureStopT < 1.4 ? 0.7 : G.lureStopT < 0.6 ? 0.4 : 0.05);
  const { rates, sum } = biteRates(c.dist, c.x, lure.layer);
  if (!G.bite && Math.random() < 1 - Math.exp(-sum * k * dt)) startBite(weightedPick(rates));
  // зацепы
  if (!G.bite && lure.layer !== 'surface') {
    const snagRate = G.L.snags * (lure.layer === 'bottom' ? 0.05 : 0.012) * (G.lureMoving ? 1 : 1.8);
    if (Math.random() < snagRate * dt) startSnag();
  }
}
function startSnag() {
  AUD.loop('reel', false);
  AUD.play('snag', 0.7);
  haptic('heavy');
  G.snag = { tries: 0 };
  setPhase('snag');
  showMsg('Зацеп! Попробуй дёрнуть или обрежь', 'warn');
}
function snagPull() {
  if (G.phase !== 'snag') return;
  G.snag.tries++;
  AUD.play('snag', 0.6, rand(0.9, 1.2));
  G.shake = 0.25;
  if (Math.random() < 0.38) {
    G.snag = null;
    showMsg('Приманка освободилась!', 'good');
    setPhase('retrieve');
  } else if (G.snag.tries >= 4) {
    showMsg('Не выходит… Придётся обрезать', 'warn');
  }
}
function snagCut() {
  if (G.phase !== 'snag') return;
  const r = rigOf('spin');
  if (r.lure && SAVE.inv[r.lure] > 0) SAVE.inv[r.lure]--;
  AUD.play('snap', 0.6, 1.3);
  showMsg('Приманка осталась на коряге', 'bad');
  G.snag = null; G.cast = null;
  setPhase('idle');
  updateBaitHud();
  persistSoon();
}

/* смотать снасть (поплавок/фидер) */
function reelIn() {
  if (!G.cast) { setPhase('idle'); return; }
  if (G.phase === 'wait' || G.phase === 'bite') {
    G.bite = null;
    G.cast.reeling = true;
    setPhase('reelin');
  }
}
function updateReelIn(dt) {
  const st = rigStats();
  G.cast.dist -= st.reel.speed * 1.8 * dt;
  AUD.loop('reel', true, 0.3, 1.2);
  if (G.cast.dist <= 2) {
    AUD.loop('reel', false);
    G.cast = null;
    setPhase('idle');
    if (G.rigType === 'feeder' && Math.random() < 0.12 && G.L.snags > 0.2) {
      showMsg('Подцепил траву, кормушку отмыл', 'info');
    }
  }
}

/* ---------------------------------------------------------------- активные точки */
function updateHot(dt) {
  G.hotTimer -= dt;
  if (G.hotTimer <= 0) {
    G.hotTimer = rand(35, 80);
    const kinds = ['bubbles', 'boil', 'school'];
    if (['lake', 'volga', 'north'].includes(G.loc)) kinds.push('birds');
    const kind = pick(kinds);
    const mc = Math.max(8, maxCast());
    G.hot.push({ kind, dist: rand(6, Math.min(mc * 0.95, 70)), x: rand(-8, 8), r: 4.5, t: 0, life: rand(40, 80), fx: 0 });
    if (G.hot.length > 3) G.hot.shift();
  }
  for (const h of G.hot) {
    h.t += dt; h.fx -= dt;
    if (h.fx <= 0) {
      h.fx = h.kind === 'bubbles' ? rand(0.2, 0.6) : h.kind === 'boil' ? rand(1.2, 3) : rand(0.6, 1.4);
      if (h.kind === 'bubbles') addBubble(h.x + rand(-1.5, 1.5), h.dist + rand(-1.5, 1.5));
      else if (h.kind === 'boil') { addSplash(h.x + rand(-2, 2), h.dist + rand(-2, 2), rand(0.7, 1.3)); AUD.play('splash_s', 0.12, rand(0.9, 1.3)); }
      else addRipple(h.x + rand(-2, 2), h.dist + rand(-2, 2), 0.6);
    }
  }
  G.hot = G.hot.filter(h => h.t < h.life);
  // случайные всплески рыбы
  G.ambientJumpT -= dt;
  if (G.ambientJumpT <= 0) {
    G.ambientJumpT = rand(6, 16);
    const d = rand(8, 60), x = rand(-14, 14);
    addSplash(x, d, rand(0.4, 1));
    addRipple(x, d, 1);
  }
}

/* эффекты на воде (координаты мира: x — метры вбок, dist — метры от берега) */
function addRipple(x, dist, size) { if (G.ripples.length < 40) G.ripples.push({ x, dist, t: 0, size: size || 1 }); }
function addSplash(x, dist, size) {
  for (let i = 0; i < 10 * (size || 1) && G.splashes.length < 180; i++) {
    G.splashes.push({ x, dist, vx: rand(-1, 1) * 0.6, vy: rand(1.5, 3.2) * (size || 1), h: 0, t: 0, life: rand(0.5, 0.9) });
  }
  addRipple(x, dist, size);
}
function addBubble(x, dist) { if (G.particles.length < 120) G.particles.push({ kind: 'bubble', x, dist, t: 0, life: rand(0.8, 1.6), r: rand(0.3, 0.8) }); }

/* ---------------------------------------------------------------- основной апдейт */
function updateFishing(dt) {
  // часы
  G.timeAcc += dt;
  if (G.timeAcc >= 1) {
    const m = Math.floor(G.timeAcc);
    G.timeAcc -= m;
    const before = SAVE.clock;
    SAVE.clock += m;
    if (SAVE.thermos > 0) SAVE.thermos = Math.max(0, SAVE.thermos - m);
    if (before < 720 && SAVE.clock >= 720 && Math.random() < 0.3) { rollWeather(); onWeatherChange(); }
    if (SAVE.clock >= 1440) { SAVE.clock -= 1440; SAVE.day++; rollWeather(); onWeatherChange(); }
    if (G.chum.level > 0) {
      const gb = GROUNDBAITS[G.chum.gb];
      const decay = (G.L.current > 0 && !(gb && gb.river)) ? 0.03 : 0.012;
      G.chum.level = Math.max(0, G.chum.level - decay * m);
    }
  }
  updateHot(dt);
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt);
  switch (G.phase) {
    case 'charge':
      G.power += G.powerDir * dt * 0.85;
      if (G.power >= 1) { G.power = 1; G.powerDir = -1; }
      if (G.power <= 0) { G.power = 0; G.powerDir = 1; }
      break;
    case 'flight':
      G.cast.t += dt;
      if (G.cast.t >= G.cast.tFlight) onLanded();
      break;
    case 'wait':
    case 'bite':
      if (G.rigType === 'spin') updateRetrieve(dt);
      else updateWait(dt);
      break;
    case 'retrieve':
      updateRetrieve(dt);
      break;
    case 'reelin':
      updateReelIn(dt);
      break;
    case 'fight':
      updateFight(dt);
      break;
  }
  // эффекты
  for (const r of G.ripples) r.t += dt;
  G.ripples = G.ripples.filter(r => r.t < 2.2);
  for (const s of G.splashes) { s.t += dt; s.vy -= 9 * dt; s.h += s.vy * dt; s.x += s.vx * dt; }
  G.splashes = G.splashes.filter(s => s.t < s.life && s.h > -0.1);
  for (const p of G.particles) p.t += dt;
  G.particles = G.particles.filter(p => p.t < p.life);
  if (G.bite && G.bite.twitch > 0) G.bite.twitch = Math.max(0, G.bite.twitch - dt * 4);
  if (G.bobberNoise > 0) G.bobberNoise = Math.max(0, G.bobberNoise - dt * 2);
}

/* ---------------------------------------------------------------- улов */
function fishValue(id, w, trophy) {
  const s = SPECIES[id];
  if (s.fixed) return s.fixed;
  if (s.protect) return 0;
  return Math.round(w * s.price * (trophy ? 1.5 : 1));
}
function fishXp(id, w) {
  const s = SPECIES[id];
  return Math.round(6 + Math.sqrt(w) * 18 * s.xp);
}
function keepnetWeight() { return G.keepnet.reduce((a, f) => a + f.w, 0); }
function keepnetCap() {
  let cap = 0;
  for (const k of ['keepnet_1', 'keepnet_2', 'keepnet_3']) if (SAVE.owned[k]) cap = Math.max(cap, GEAR[k].cap);
  return cap;
}
