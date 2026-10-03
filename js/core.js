'use strict';
/* =====================================================================
   Ядро: хелперы, адаптер MAX, сохранения, вёрстка под видимую область,
   координаты касаний, прокрутка списков, оверлеи и тосты.
   ===================================================================== */

const $ = id => document.getElementById(id);
const fmt = n => Math.floor(n).toLocaleString('ru-RU');
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const smooth = t => t * t * (3 - 2 * t);

function fmtKg(kg) {
  if (kg < 1) return Math.round(kg * 1000) + ' г';
  if (kg < 10) return kg.toFixed(2).replace('.', ',') + ' кг';
  return kg.toFixed(1).replace('.', ',') + ' кг';
}
function fmtMoney(n) { return fmt(n) + ' ₽'; }
function plural(n, a, b, c) {
  n = Math.abs(n) % 100; const n1 = n % 10;
  if (n > 10 && n < 20) return c;
  if (n1 > 1 && n1 < 5) return b;
  if (n1 === 1) return a;
  return c;
}
function weightedPick(obj) {
  let tot = 0;
  for (const k in obj) tot += obj[k];
  let r = Math.random() * tot;
  for (const k in obj) { r -= obj[k]; if (r <= 0) return k; }
  return Object.keys(obj)[0];
}
function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
function icon(id, cls) { return '<svg class="ic ' + (cls || '') + '"><use href="#i-' + id + '"/></svg>'; }

/* ---------------------------------------------------------------- MAX */
function maxW() { return window.WebApp || null; }
function maxInit() {
  try {
    const w = maxW(); if (!w) return;
    if (w.ready) w.ready();
    if (w.disableVerticalSwipes) w.disableVerticalSwipes();
  } catch (e) {}
}
function maxUser() {
  try { const w = maxW(); return (w && w.initDataUnsafe && w.initDataUnsafe.user) || null; }
  catch (e) { return null; }
}
let lastHaptic = 0;
function haptic(kind) {
  const now = performance.now();
  if (now - lastHaptic < 120) return;
  lastHaptic = now;
  try {
    const w = maxW();
    if (!w || !w.HapticFeedback) return;
    if (kind === 'success' || kind === 'warning' || kind === 'error') w.HapticFeedback.notificationOccurred(kind);
    else w.HapticFeedback.impactOccurred(kind || 'light');
  } catch (e) {}
}
function metrika(fn, extra) {
  try { if (window.GameMetrika && window.GameMetrika[fn]) window.GameMetrika[fn](extra || {}); } catch (e) {}
}

/* ---------------------------------------------------------------- save */
let SAVE = defaultSave();
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (!d || typeof d !== 'object') return;
    const def = defaultSave();
    const num = (v, a, b, dv) => (typeof v === 'number' && isFinite(v)) ? clamp(v, a, b) : dv;
    SAVE.money = Math.floor(num(d.money, 0, 1e10, def.money));
    SAVE.xp = Math.floor(num(d.xp, 0, 1e10, 0));
    SAVE.level = Math.floor(num(d.level, 1, MAX_LEVEL, 1));
    SAVE.owned = (d.owned && typeof d.owned === 'object') ? d.owned : def.owned;
    for (const k in def.owned) SAVE.owned[k] = 1;
    SAVE.inv = (d.inv && typeof d.inv === 'object') ? d.inv : def.inv;
    for (const k in SAVE.inv) SAVE.inv[k] = Math.max(0, Math.floor(+SAVE.inv[k] || 0));
    if (d.rigs && typeof d.rigs === 'object') {
      for (const t of ['float', 'feeder', 'spin']) if (d.rigs[t]) Object.assign(SAVE.rigs[t], d.rigs[t]);
    }
    SAVE.rigs.float.depth = num(SAVE.rigs.float.depth, 0.2, 25, 1.2);
    SAVE.rig = ['float', 'feeder', 'spin'].includes(d.rig) ? d.rig : 'float';
    SAVE.broken = (d.broken && typeof d.broken === 'object') ? d.broken : {};
    if (d.stats && typeof d.stats === 'object') {
      Object.assign(SAVE.stats, d.stats);
      SAVE.stats.tackle = Object.assign({ float: 0, feeder: 0, spin: 0 }, d.stats.tackle || {});
    }
    SAVE.species = (d.species && typeof d.species === 'object') ? d.species : {};
    for (const k in SAVE.species) if (!SPECIES[k]) delete SAVE.species[k];
    SAVE.visited = d.visited || {};
    SAVE.ach = d.ach || {};
    SAVE.quests = Array.isArray(d.quests) ? d.quests.filter(q => q && q.type) : [];
    SAVE.questDone = Math.floor(num(d.questDone, 0, 1e7, 0));
    SAVE.clock = num(d.clock, 0, 1440, 360);
    SAVE.day = Math.floor(num(d.day, 1, 1e7, 1));
    SAVE.weather = WEATHER[d.weather] ? d.weather : 'clear';
    SAVE.pressure = PRESSURE[d.pressure] ? d.pressure : 'stable';
    SAVE.daily = typeof d.daily === 'string' ? d.daily : '';
    SAVE.streak = Math.floor(num(d.streak, 0, 1000, 0));
    SAVE.tut = d.tut || {};
    if (typeof d.sound === 'boolean') SAVE.sound = d.sound;
    if (typeof d.music === 'boolean') SAVE.music = d.music;
    if (typeof d.amb === 'boolean') SAVE.amb = d.amb;
    SAVE.lastLoc = LOCATIONS[d.lastLoc] ? d.lastLoc : 'pond';
    SAVE.thermos = 0;
    // проверка снастей
    for (const t of ['float', 'feeder', 'spin']) {
      const r = SAVE.rigs[t];
      if (r.rod && (!RODS[r.rod] || !SAVE.owned[r.rod] || RODS[r.rod].type !== t)) r.rod = null;
      if (r.reel && (!REELS[r.reel] || !SAVE.owned[r.reel])) r.reel = null;
      if (r.line && (!LINES[r.line] || !SAVE.owned[r.line])) r.line = null;
      if (r.bait && !BAITS[r.bait]) r.bait = null;
      if (r.lure && !LURES[r.lure]) r.lure = null;
      if (r.hook && !HOOKS[r.hook]) r.hook = 'hook_12';
      if (r.gb && !GROUNDBAITS[r.gb]) r.gb = null;
    }
  } catch (e) { console.warn('[Game] save load error', e); }
}
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) {} }
let persistTimer = 0;
function persistSoon() { clearTimeout(persistTimer); persistTimer = setTimeout(persist, 600); }

/* ---------------------------------------------------------------- layout (горизонтальная игра) */
const app = $('app');
let APPW = 700, APPH = 372, ROT = false, UIK = 1;
const BASE_W = 700, BASE_H = 372;

function visibleSize() {
  const vv = window.visualViewport;
  let w = window.innerWidth, h = window.innerHeight;
  if (vv && vv.width > 50 && vv.height > 50) { w = Math.min(w, vv.width); h = Math.min(h, vv.height); }
  const de = document.documentElement;
  if (de && de.clientHeight > 50) h = Math.min(h, de.clientHeight);
  return { w: Math.round(w), h: Math.round(h) };
}
function layoutApp() {
  const s = visibleSize(), st = app.style;
  ROT = s.h > s.w;
  if (ROT) {
    st.width = s.h + 'px'; st.height = s.w + 'px';
    st.left = '0px'; st.top = '0px';
    st.transform = 'rotate(90deg) translateY(-100%)';
    APPW = s.h; APPH = s.w;
  } else {
    let w = s.w;
    if (w > s.h * 2.4) w = Math.round(s.h * 2.4);
    st.width = w + 'px'; st.height = s.h + 'px';
    st.left = Math.round((s.w - w) / 2) + 'px'; st.top = '0px';
    st.transform = 'none';
    APPW = w; APPH = s.h;
  }
  fitUI();
}
function fitPanel(p) {
  p.style.scale = '1';
  const bw = APPW / UIK, bh = APPH / UIK;
  const k = Math.min(1, (bw - 16) / p.offsetWidth, (bh - 20) / p.offsetHeight);
  p.style.scale = String(k);
}
function fitUI() {
  const k = Math.min(1.35, APPW / BASE_W, APPH / BASE_H);
  UIK = k;
  document.querySelectorAll('.scaler').forEach(m => {
    m.style.width = (APPW / k) + 'px';
    m.style.height = (APPH / k) + 'px';
    m.style.transformOrigin = '0 0';
    m.style.transform = 'scale(' + k + ')';
  });
  document.querySelectorAll('.overlay.show .panel').forEach(fitPanel);
  if (typeof resizeCanvas === 'function') resizeCanvas();
  if (window.onFitHook) window.onFitHook();
}
window.addEventListener('resize', layoutApp);
window.addEventListener('orientationchange', () => setTimeout(layoutApp, 200));
if (window.visualViewport) window.visualViewport.addEventListener('resize', layoutApp);

function toGame(e) {
  const r = app.getBoundingClientRect();
  if (ROT) return {
    x: (e.clientY - r.top) * (APPW / r.height),
    y: (r.right - e.clientX) * (APPH / r.width)
  };
  return {
    x: (e.clientX - r.left) * (APPW / r.width),
    y: (e.clientY - r.top) * (APPH / r.height)
  };
}

/* ---------------------------------------------------------------- своя прокрутка */
function makeScroll(el) {
  if (!el || el._scroll) return;
  el._scroll = true;
  el.style.touchAction = 'none';
  el.style.overscrollBehavior = 'contain';
  let pid = null, y0 = 0, s0 = 0, ly = 0, lt = 0, vel = 0, moved = false, raf = 0;
  const horiz = el.classList.contains('hscroll');
  const k = () => {
    const r = el.getBoundingClientRect();
    if (horiz) return ((ROT ? r.height : r.width) / el.offsetWidth) || 1;
    return ((ROT ? r.width : r.height) / el.offsetHeight) || 1;
  };
  const coord = e => { const g = toGame(e); return horiz ? g.x : g.y; };
  const getS = () => horiz ? el.scrollLeft : el.scrollTop;
  const setS = v => { if (horiz) el.scrollLeft = v; else el.scrollTop = v; };
  el.addEventListener('pointerdown', e => {
    pid = e.pointerId; y0 = ly = coord(e); s0 = getS();
    lt = performance.now(); vel = 0; moved = false; cancelAnimationFrame(raf);
  });
  el.addEventListener('pointermove', e => {
    if (e.pointerId !== pid) return;
    const y = coord(e);
    if (!moved && Math.abs(y - y0) > 8) {
      moved = true;
      try { el.setPointerCapture(pid); } catch (_) {}
    }
    if (!moved) return;
    setS(s0 - (y - y0) / k());
    const t = performance.now();
    if (t > lt) vel = (ly - y) / k() / (t - lt);
    ly = y; lt = t;
  });
  const end = e => {
    if (e.pointerId !== pid) return;
    pid = null;
    if (!moved) return;
    let last = performance.now();
    const step = t => {
      const dt = t - last; last = t;
      setS(getS() + vel * dt);
      vel *= Math.pow(0.995, dt);
      if (Math.abs(vel) > 0.02) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('click', e => {
    if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; }
  }, true);
}

/* ---------------------------------------------------------------- экраны и оверлеи */
let currentScreen = 'loading';
function showScreen(name) {
  currentScreen = name;
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'scr-' + name));
  requestAnimationFrame(fitUI);
}
const overlayStack = [];
function openOverlay(id) {
  const o = $(id);
  if (!o) return;
  o.classList.add('show');
  if (!overlayStack.includes(id)) overlayStack.push(id);
  const p = o.querySelector('.panel'); if (p) fitPanel(p);
  requestAnimationFrame(() => { const p2 = o.querySelector('.panel'); if (p2) fitPanel(p2); });
}
function closeOverlay(id) {
  const o = $(id); if (o) o.classList.remove('show');
  const i = overlayStack.indexOf(id); if (i >= 0) overlayStack.splice(i, 1);
}
function closeAllOverlays() {
  document.querySelectorAll('.overlay').forEach(o => o.classList.remove('show'));
  overlayStack.length = 0;
}
function anyOverlay() { return overlayStack.length > 0; }

let toastTimer = 0;
function toast(text, kind) {
  const t = $('toast');
  t.textContent = text;
  t.className = 'show' + (kind ? ' ' + kind : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = ''; }, 2400);
}

/* подтверждение в своём окне */
let confirmCb = null;
function askConfirm(title, text, okText, cb) {
  $('cf-title').textContent = title;
  $('cf-text').textContent = text;
  $('cf-ok').textContent = okText || 'Да';
  confirmCb = cb;
  openOverlay('ov-confirm');
}

/* ---------------------------------------------------------------- шаринг и политика */
function fullShareText(text) {
  return text.includes(SHARE_LINK) ? text : text + '\nиграй прямо в Максе без скачиваний ' + SHARE_LINK;
}
function shareText(text) {
  const fullText = fullShareText(text);
  metrika('shareClick');
  try {
    if (window.WebApp && window.WebApp.shareContent) { window.WebApp.shareContent({ text: fullText }); return; }
  } catch (e) {}
  try {
    if (navigator.share) { navigator.share({ text: fullText }).catch(() => {}); return; }
  } catch (e) {}
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(fullText).then(() => toast('Текст скопирован — поделись с друзьями!')).catch(() => {});
      return;
    }
  } catch (e) {}
  toast('Поделись с друзьями!');
}
function shareWithCard(text, cardCanvas) {
  if ((window.WebApp && window.WebApp.shareContent) || !navigator.canShare || !window.File || !cardCanvas) return shareText(text);
  try {
    cardCanvas.toBlob(async blob => {
      try {
        if (!blob) return shareText(text);
        const file = new File([blob], 'ulov.png', { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], text: fullShareText(text) });
          return;
        }
      } catch (e) { if (e && e.name === 'AbortError') return; }
      shareText(text);
    }, 'image/png');
  } catch (e) { shareText(text); }
}
function openPrivacy() {
  try {
    if (window.GameSDK && GameSDK.openConsentSettings) { GameSDK.openConsentSettings(); return; }
  } catch (e) {}
  toast('Настройки доступны в Максе');
}

/* ---------------------------------------------------------------- рейтинг */
function totalScore() { return Math.floor(SAVE.stats.weightG || 0); }
let lastSentScore = 0;
function submitScore() {
  const scoreToSend = Math.floor(totalScore());
  if (scoreToSend <= 0 || scoreToSend === lastSentScore) return;
  if (window.GameSDK && typeof GameSDK.saveScore === 'function') {
    try {
      GameSDK.saveScore(scoreToSend).then(res => {
        if (res && res.ok) {
          lastSentScore = scoreToSend;
          if (res.is_new_record) { toast('Новый рекорд в рейтинге!', 'gold'); metrika('newRecord'); }
        }
      }).catch(e => console.warn('[Game] saveScore ошибка:', e));
    } catch (e) { console.warn('[Game] saveScore ошибка:', e); }
  }
}
async function openLeaderboard() {
  openOverlay('ov-leaderboard');
  $('lb-mine').textContent = fmtKg(totalScore() / 1000);
  const list = $('lb-list');
  list.innerHTML = '<div class="lb-empty">Загрузка рейтинга…</div>';
  if (window.GameSDK && GameSDK.getLeaderboard) {
    try {
      const res = await GameSDK.getLeaderboard(20);
      renderLeaderboard(res && res.ok && res.leaderboard ? res.leaderboard : []);
    } catch (e) {
      list.innerHTML = '<div class="lb-empty">Ошибка загрузки. Попробуйте позже.</div>';
    }
  } else renderLeaderboard([]);
  fitPanel($('ov-leaderboard').querySelector('.panel'));
}
function renderLeaderboard(players) {
  const list = $('lb-list');
  list.innerHTML = '';
  if (!players || players.length === 0) {
    list.innerHTML = '<div class="lb-empty">Пока нет рекордов. Будьте первым!</div>';
    return;
  }
  const me = maxUser();
  players.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'lb-row';
    if (i === 0) row.classList.add('top-1');
    else if (i === 1) row.classList.add('top-2');
    else if (i === 2) row.classList.add('top-3');
    if (me && p.id && String(p.id) === String(me.id)) row.classList.add('me');
    const medal = document.createElement('div');
    medal.className = 'lb-medal';
    if (i < 3) { medal.innerHTML = icon('medal'); const s = document.createElement('span'); s.textContent = String(i + 1); medal.appendChild(s); medal.classList.add(['gold', 'silver', 'bronze'][i]); }
    else medal.textContent = '#' + (i + 1);
    row.appendChild(medal);
    const avatar = document.createElement('div');
    avatar.className = 'lb-avatar';
    const displayName = p.name || p.nickname || 'Рыбак';
    avatar.textContent = displayName.charAt(0).toUpperCase();
    if (p.photo_url) {
      const img = document.createElement('img');
      img.src = p.photo_url; img.alt = '';
      img.onerror = function () { this.remove(); };
      avatar.appendChild(img);
    }
    row.appendChild(avatar);
    const name = document.createElement('div');
    name.className = 'lb-name';
    name.textContent = displayName;
    row.appendChild(name);
    const score = document.createElement('div');
    score.className = 'lb-score';
    score.textContent = fmtKg((p.score || 0) / 1000);
    row.appendChild(score);
    list.appendChild(row);
  });
}
