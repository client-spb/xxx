'use strict';
/* =====================================================================
   Интерфейс: меню, карта, HUD рыбалки, улов, садок, итоги, магазин,
   снасти, задания, атлас, достижения, уровень, подарок, настройки.
   ===================================================================== */

const UI = { shopTab: 'rods', tackleRig: 'float', tackleSlot: 'rod', mapSel: 'pond', returnTo: 'menu', popups: [], hudCache: {}, lastTod: '', catchData: null, lastSubmitCount: 0 };
const RANKS = [[1, 'Новичок'], [3, 'Любитель'], [5, 'Рыболов'], [8, 'Опытный рыболов'], [11, 'Знаток водоёмов'], [14, 'Мастер поплавка'], [18, 'Мастер спорта'], [22, 'Ас рыбалки'], [26, 'Легенда реки'], [30, 'Гуру рыбалки']];
function rankOf(l) { let r = RANKS[0][1]; for (const [lv, n] of RANKS) if (l >= lv) r = n; return r; }

function setText(id, v) { const e = typeof id === 'string' ? $(id) : id; if (e && e.textContent !== String(v)) e.textContent = v; }
function itemIcon(id) {
  if (BAITS[id]) return itemPath(BAITS[id].icon);
  if (LURES[id]) return itemPath(LURES[id].icon);
  return itemPath(id);
}
function imgSrc(path) { return ASSETS.url(path) || path; }
function itemName(id) {
  return (RODS[id] || REELS[id] || LINES[id] || HOOKS[id] || BAITS[id] || LURES[id] || GROUNDBAITS[id] || GEAR[id] || { name: id }).name;
}
function sfxClick() { AUD.click(); haptic('light'); }

/* ---------------------------------------------------------------- всплывающие окна по очереди */
function queuePopup(fn) { UI.popups.push(fn); flushPopups(); }
function flushPopups() {
  setTimeout(() => {
    if (anyOverlay() || !UI.popups.length) return;
    const fn = UI.popups.shift();
    fn();
  }, 260);
}
function closeOv(id) { closeOverlay(id); flushPopups(); }

/* ---------------------------------------------------------------- эффекты */
function fxText(text, x, y, color) {
  const e = el('div', 'fx-float', '');
  e.textContent = text;
  e.style.left = (x * UIK) + 'px'; e.style.top = (y * UIK) + 'px';
  if (color) e.style.color = color;
  $('fxLayer').appendChild(e);
  setTimeout(() => e.remove(), 1500);
}
function addMoney(n, x, y) {
  if (!n) return;
  SAVE.money += n;
  if (n > 0) SAVE.stats.earned += n;
  if (x != null) fxText((n > 0 ? '+' : '') + fmt(n) + ' ₽', x, y);
  AUD.coin();
  questEvent({ type: 'money', n });
}
function addXp(n, x, y) {
  if (!n) return;
  SAVE.xp += n;
  if (x != null) fxText('+' + n + ' опыта', x, y, '#9ae0ff');
  let up = false;
  while (SAVE.level < MAX_LEVEL && SAVE.xp >= xpForLevel(SAVE.level)) {
    SAVE.xp -= xpForLevel(SAVE.level);
    SAVE.level++;
    up = true;
    const lv = SAVE.level;
    queuePopup(() => showLevelUp(lv));
  }
  if (SAVE.level >= MAX_LEVEL) SAVE.xp = Math.min(SAVE.xp, xpForLevel(MAX_LEVEL));
  if (up) { checkAch(); submitScore(); }
}

/* ---------------------------------------------------------------- меню */
function renderMenu() {
  setText('mp-level', SAVE.level);
  setText('mp-rank', rankOf(SAVE.level));
  const need = xpForLevel(SAVE.level);
  $('mp-xp').style.width = (SAVE.level >= MAX_LEVEL ? 100 : clamp(SAVE.xp / need * 100, 0, 100)) + '%';
  setText('mp-xptxt', SAVE.level >= MAX_LEVEL ? 'Максимальный уровень' : fmt(SAVE.xp) + ' / ' + fmt(need) + ' опыта');
  setText('mp-money', fmt(SAVE.money));
  $('guestNote').classList.toggle('show', !maxUser());
  $('btnGift').classList.toggle('show', SAVE.daily !== todayStr());
  ensureQuests();
  $('questDot').classList.toggle('on', SAVE.quests.some(q => q.done && !q.claimed));
  syncSoundButtons();
}
function syncSoundButtons() {
  const s = SAVE.sound ? 'i-sound' : 'i-sound-off';
  const m = SAVE.music ? 'i-music' : 'i-music-off';
  for (const id of ['btnSound', 'pzSound']) { const u = $(id) && $(id).querySelector('use'); if (u) u.setAttribute('href', '#' + s); }
  for (const id of ['btnMusic', 'pzMusic']) { const u = $(id) && $(id).querySelector('use'); if (u) u.setAttribute('href', '#' + m); }
  const a = $('pzAmb'); if (a) a.style.opacity = SAVE.amb ? 1 : 0.4;
  $('stSound').classList.toggle('on', SAVE.sound);
  $('stMusic').classList.toggle('on', SAVE.music);
  $('stAmb').classList.toggle('on', SAVE.amb);
}
function toggleSound(kind) {
  SAVE[kind] = !SAVE[kind];
  AUD.applyVolumes();
  if (kind === 'music' && SAVE.music) refreshMusic(true);
  if (kind === 'amb' && SAVE.amb && currentScreen === 'fish') refreshMusic(true);
  syncSoundButtons();
  persist();
  sfxClick();
}
function refreshMusic(force) {
  if (currentScreen === 'fish') {
    if (G.paused) return;
    const tod = todOf(SAVE.clock);
    const night = tod === 'night';
    AUD.stopMusic();
    let amb = G.L.amb;
    if (night) amb = { swamp: 'swamp', mountain: 'rapids', north: 'north', river: 'river' }[G.loc] || 'night';
    if (SAVE.weather === 'rain') amb = 'rain';
    AUD.amb(amb);
  } else if (['menu', 'map'].includes(currentScreen)) {
    AUD.music('menu'); AUD.stopAmb();
  } else if (['shop', 'tackle'].includes(currentScreen)) {
    if (UI.returnTo !== 'fish') { AUD.music('menu'); AUD.stopAmb(); }
  }
}
function todayStr() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }

/* ---------------------------------------------------------------- карта */
function renderMap() {
  setText('mapMoney', fmt(SAVE.money));
  const wrap = document.querySelector('.map-wrap');
  const box = $('mapMarkers');
  const w = wrap.clientWidth, h = wrap.clientHeight;
  const sc = Math.max(w / 1600, h / 900);
  const iw = 1600 * sc, ih = 900 * sc, ox = (w - iw) / 2, oy = (h - ih) / 2;
  box.innerHTML = '';
  for (const id of LOCATION_ORDER) {
    const L = LOCATIONS[id];
    const [px, py] = MAP_POS[id];
    const lock = SAVE.level < L.level;
    const m = el('div', 'mk' + (lock ? ' lock' : '') + (UI.mapSel === id ? ' sel' : ''), '<div class="ripple"></div><div class="pin">' + icon(lock ? 'lock' : 'fish') + '</div><div class="lbl"></div>');
    m.querySelector('.lbl').textContent = L.short + (lock ? ' · ур. ' + L.level : '');
    m.style.left = (ox + px * iw) + 'px';
    m.style.top = (oy + py * ih) + 'px';
    m.addEventListener('click', () => { sfxClick(); UI.mapSel = id; renderMap(); });
    box.appendChild(m);
  }
  const L = LOCATIONS[UI.mapSel];
  setText('mpTitle', L.name);
  const lock = SAVE.level < L.level;
  const lv = $('mpLevel');
  lv.textContent = lock ? 'Откроется на ' + L.level + ' уровне' : (SAVE.visited[UI.mapSel] ? 'Ты уже рыбачил здесь' : 'Новое место');
  lv.classList.toggle('bad', lock);
  setText('mpDesc', L.desc);
  $('mpThumb').style.backgroundImage = 'url(' + imgSrc(bgPath(UI.mapSel, 'day')) + ')';
  const fl = $('mpFish');
  fl.innerHTML = '';
  for (const fid in L.fish) {
    const s = SPECIES[fid];
    if (s.legend && !SAVE.species[fid]) continue;
    const f = el('div', 'f' + (SAVE.species[fid] ? '' : ' un'));
    f.style.backgroundImage = 'url(' + imgSrc(fishPath(fid)) + ')';
    f.title = s.name;
    f.addEventListener('click', () => { if (SAVE.species[fid]) openFishInfo(fid); else toast('Неизвестный вид — поймай, чтобы узнать'); });
    fl.appendChild(f);
  }
  setText('mpTicket', L.ticket ? 'Путёвка: ' + fmtMoney(L.ticket) : 'Бесплатно');
  const go = $('mpGo');
  go.classList.toggle('off', lock);
  go.querySelector('span').textContent = lock ? 'Закрыто' : 'Поехать';
}
async function goFishing(id) {
  const L = LOCATIONS[id];
  if (SAVE.level < L.level) { AUD.error(); toast('Нужен ' + L.level + ' уровень'); return; }
  if (SAVE.money < L.ticket) { AUD.error(); toast('Не хватает денег на путёвку'); return; }
  if (rigReady('float') && rigReady('feeder') && rigReady('spin')) {
    AUD.error();
    askConfirm('Снасть не готова', 'Ни одна снасть не собрана или нет наживки. Открыть магазин?', 'В магазин', () => openShop('baits', 'map'));
    return;
  }
  if (L.ticket) { SAVE.money -= L.ticket; AUD.coin(); }
  sfxClick();
  const paths = ['day', 'evening', 'night'].map(t => bgPath(id, t)).concat(Object.keys(L.fish).map(f => fishPath(f)));
  await ASSETS.ensure(paths);
  closeAllOverlays();
  startSession(id);
  if (Math.random() < 0.6) rollWeather();
  showScreen('fish');
  VIEW.t = 0;
  hudInit();
  refreshMusic(true);
  metrika('gameStart', { loc: id });
  if (!SAVE.tut.cast) setTimeout(() => hint('Коснись воды, чтобы выбрать направление. Зажми кнопку «Заброс» и отпусти, когда шкала силы будет нужной высоты.', 7000), 600);
}

/* ---------------------------------------------------------------- HUD */
let hintTimer = 0;
function hint(text, ms) {
  const b = $('hintBubble');
  b.textContent = text; b.classList.add('show');
  clearTimeout(hintTimer); hintTimer = setTimeout(() => b.classList.remove('show'), ms || 5000);
}
let msgTimer = 0;
function showMsg(text, kind) {
  const m = $('hudMsg');
  m.textContent = text;
  m.className = 'hud-msg show ' + (kind || '');
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => { m.className = 'hud-msg'; }, kind === 'bite' ? 1600 : 2400);
}
function hudInit() {
  UI.hudCache = {};
  setText('hudLoc', G.L.short);
  $('sonar').classList.toggle('on', !!SAVE.owned.sonar);
  syncRigButtons();
  updateBaitHud();
  onPhaseChange(G.phase);
  updateDragUi();
  updateDepthUi();
  onWeatherChange();
}
function syncRigButtons() {
  document.querySelectorAll('.rigb').forEach(b => {
    const t = b.dataset.rig;
    b.classList.toggle('on', t === G.rigType);
    b.classList.toggle('na', !!rigReady(t) && !(rigOf(t).rod));
  });
  $('depthCtl').style.display = G.rigType === 'float' ? 'flex' : 'none';
  $('chumBar').classList.toggle('on', G.rigType === 'feeder');
}
function updateBaitHud() {
  const r = rigOf(G.rigType);
  const id = G.rigType === 'spin' ? r.lure : r.bait;
  const im = $('hudBaitImg');
  if (id) { const src = imgSrc(itemIcon(id)); if (im.getAttribute('src') !== src) im.src = src; im.style.visibility = 'visible'; }
  else im.style.visibility = 'hidden';
  const n = id ? (SAVE.inv[id] || 0) : 0;
  const sp = $('hudBaitN');
  sp.textContent = n;
  sp.classList.toggle('low', n <= 3);
  const th = $('hudThermos');
  th.classList.toggle('on', (SAVE.inv.thermos || 0) > 0 || SAVE.thermos > 0);
  th.classList.toggle('active', SAVE.thermos > 0);
  setText('thermosN', SAVE.thermos > 0 ? Math.ceil(SAVE.thermos / 60) + ' мин' : (SAVE.inv.thermos || 0));
}
function onWeatherChange() {
  const W = WEATHER[SAVE.weather];
  setText('hudWeather', W.name + ', давл. ' + PRESSURE[SAVE.pressure].name);
  const icn = { clear: 'sun', cloudy: 'cloud', rain: 'rain', wind: 'wind', fog: 'fog' }[SAVE.weather];
  $('hudWeatherIc').querySelector('use').setAttribute('href', '#i-' + icn);
  if (currentScreen === 'fish') refreshMusic();
}
function updateDragUi() {
  const st = rigStats();
  setText('dragVal', G.drag.toFixed(1).replace('.', ',') + ' кг');
  const dv = $('dragVal');
  dv.style.color = st.line && G.drag > st.line.str ? '#ff8a6a' : '';
}
function updateDepthUi() { setText('depthVal', rigOf('float').depth.toFixed(1).replace('.', ',') + ' м'); }
function changeDrag(dir) {
  const st = rigStats();
  if (!st.reel) return;
  const step = G.drag < 2 ? 0.1 : G.drag < 10 ? 0.25 : 0.5;
  G.drag = clamp(Math.round((G.drag + dir * step) * 100) / 100, 0.3, st.reel.drag);
  updateDragUi();
  AUD.tick();
  if (st.line && G.drag > st.line.str && dir > 0) showMsg('Фрикцион выше прочности лески!', 'warn');
}
function changeDepth(dir) {
  const r = rigOf('float');
  const step = r.depth < 2 ? 0.1 : 0.25;
  r.depth = clamp(Math.round((r.depth + dir * step) * 100) / 100, 0.2, 14);
  updateDepthUi();
  AUD.tick();
  persistSoon();
}

const ACT = {
  idle: ['cast', 'Заброс', ''], charge: ['cast', 'Отпусти!', 'press'], flight: ['cast', '…', 'dis'],
  wait: ['hook', 'Подсечь', ''], bite: ['hook', 'Подсекай!', 'alert'], retrieve: ['reel', 'Подмотка', 'reel'],
  reelin: ['reel', 'Сматываю', 'dis'], fight: ['reel', 'Тянуть', 'reel'], land: ['net', 'Подсак!', 'dis'], snag: ['rod', 'Дёрнуть', ''],
};
function onPhaseChange(p) {
  const a = ACT[p] || ACT.idle;
  const btn = $('actBtn');
  btn.className = 'act ' + a[2];
  $('actIc').querySelector('use').setAttribute('href', '#i-' + a[0]);
  setText('actLbl', G.rigType === 'spin' && p === 'wait' ? 'Подмотка' : a[1]);
  const sec = $('secAct');
  if (p === 'wait' || (p === 'bite' && G.rigType !== 'spin')) { sec.classList.add('on'); setText('secLbl', 'Смотать'); sec.querySelector('use').setAttribute('href', '#i-reel'); }
  else if (p === 'snag') { sec.classList.add('on'); setText('secLbl', 'Обрезать'); sec.querySelector('use').setAttribute('href', '#i-cut'); }
  else sec.classList.remove('on');
  $('powerBar').classList.toggle('on', p === 'charge');
  const fight = p === 'fight';
  $('fightUi').classList.toggle('on', fight);
  $('ctrlL').classList.toggle('on', fight);
  $('fishDir').classList.toggle('on', fight);
  $('hudIn').classList.toggle('fighting', fight);
  if (!fight) { G.tilt = 0; $('tiltL').classList.remove('on'); $('tiltR').classList.remove('on'); }
  if (fight && G.fish) {
    const st = rigStats();
    setText('tLine', st.line.str.toFixed(1).replace('.', ','));
    if (!SAVE.tut.fight) { SAVE.tut.fight = 1; hint('Держи «Тянуть», чтобы подматывать. Следи за натяжением — белая метка это фрикцион. Стрелками наклоняй удилище против хода рыбы!', 7000); }
  }
  if (p === 'wait' && !SAVE.tut.wait) {
    SAVE.tut.wait = 1;
    hint(G.rigType === 'feeder' ? 'Следи за кончиком удилища. Когда он резко согнётся и зазвенит колокольчик — подсекай!' : 'Жди поклёвку. Поплавок задрожит, а потом уйдёт под воду — жми «Подсечь»!', 6500);
  }
  if (p === 'retrieve' && !SAVE.tut.spin) { SAVE.tut.spin = 1; hint('Зажимай «Подмотка», чтобы вести приманку. Паузы тоже работают! При ударе хищника — подсекай.', 6500); }
  if (p === 'flight') SAVE.tut.cast = 1;
  const busy = !(p === 'idle');
  document.querySelectorAll('.rigb').forEach(b => b.classList.toggle('off', busy && b.dataset.rig !== G.rigType));
  updateBaitHud();
}
function hudRefresh() {
  const c = UI.hudCache;
  const clock = clockStr(SAVE.clock);
  if (c.clock !== clock) {
    c.clock = clock; setText('hudClock', clock);
    const tod = todOf(SAVE.clock);
    if (UI.lastTod !== tod) {
      UI.lastTod = tod;
      $('hudTodIc').querySelector('use').setAttribute('href', '#i-' + ({ dawn: 'dawn', day: 'sun', dusk: 'dawn', night: 'moon' }[tod]));
      refreshMusic();
    }
    const fc = forecast();
    if (c.fc !== fc) {
      c.fc = fc;
      let h = '';
      for (let i = 0; i < 5; i++) h += '<svg class="ic sm' + (i < fc ? '' : ' off') + '"><use href="#i-float"/></svg>';
      $('hudBite').innerHTML = h;
    }
    updateBaitHud();
  }
  const money = fmt(SAVE.money);
  if (c.money !== money) { c.money = money; setText('hudMoney', money); }
  const kw = keepnetWeight(), cap = keepnetCap();
  const ks = fmtKg(kw).replace(' кг', '') + ' / ' + cap + ' кг';
  if (c.keep !== ks) { c.keep = ks; setText('hudKeepW', kw < 1 ? fmtKg(kw) + ' / ' + cap + ' кг' : ks); $('hudKeep').classList.toggle('full', kw >= cap * 0.95); }
  if (G.rigType === 'feeder') $('chumFill').style.width = clamp(G.chum.level / 1.6 * 100, 0, 100) + '%';
  if (G.phase === 'charge') $('powerFill').style.height = (G.power * 100) + '%';
  // информационная строка
  let info = '';
  if (G.phase === 'idle') {
    const err = rigReady(G.rigType);
    info = err || ('Заброс до ' + Math.round(maxCast()) + ' м · ' + RIG_TYPES[G.rigType].short);
  } else if ((G.phase === 'wait' || G.phase === 'retrieve' || G.phase === 'bite') && G.cast) {
    const dep = depthAt(G.cast.dist, G.cast.x);
    info = Math.round(G.cast.dist) + ' м · глубина ' + dep.toFixed(1).replace('.', ',') + ' м';
    if (G.rigType === 'float') info += ' · насадка ' + LAYER_NAMES[layerOfBait()];
    if (G.cast.baitless) info = 'Насадки нет — смотай и перезабрось';
  }
  if (G.phase === 'fight') info = '';
  if (c.info !== info) { c.info = info; setText('hudInfo', info); }
  if (G.phase === 'fight' && G.fish) {
    const st = rigStats();
    const f = G.fish;
    setText('fDist', Math.max(0, Math.round(f.dist)) + ' м');
    const max = st.line.str * 1.05;
    $('tFill').style.width = clamp(G.tensionShow / max * 100, 0, 100) + '%';
    $('tDrag').style.left = clamp(G.drag / max * 100, 0, 100) + '%';
    $('tRod').style.left = clamp(st.rod.power / max * 100, 0, 100) + '%';
    $('tRod').style.display = st.rod.power < max ? 'block' : 'none';
    setText('tVal', G.tensionShow.toFixed(1).replace('.', ','));
    $('fStam').style.width = (f.stam * 100) + '%';
    const d = f.dir;
    const fd = $('fishDir');
    fd.style.visibility = d ? 'visible' : 'hidden';
    fd.querySelector('use').setAttribute('href', d < 0 ? '#i-arrow-l' : '#i-arrow-r');
  }
}

/* ---------------------------------------------------------------- управление на рыбалке */
function actDown() {
  if (G.paused || anyOverlay()) return;
  $('actBtn').classList.add('press');
  switch (G.phase) {
    case 'idle': beginCharge(); break;
    case 'wait': if (G.rigType === 'spin') { G.reel = true; } else strike(); break;
    case 'bite': strike(); break;
    case 'retrieve': G.reel = true; break;
    case 'fight': G.reel = true; break;
    case 'snag': snagPull(); break;
  }
}
function actUp() {
  $('actBtn').classList.remove('press');
  if (G.phase === 'charge') releaseCast();
  G.reel = false;
}
function secAct() {
  if (G.paused) return;
  sfxClick();
  if (G.phase === 'snag') snagCut();
  else if (G.phase === 'wait' || G.phase === 'bite') reelIn();
}
function clearInput() {
  G.reel = false; G.tilt = 0;
  $('actBtn').classList.remove('press');
  $('tiltL').classList.remove('on'); $('tiltR').classList.remove('on');
  if (G.phase === 'charge') { G.charging = false; setPhase('idle'); }
  AUD.stopLoops();
}
function switchRig(t) {
  if (G.phase !== 'idle') { toast('Сначала смотай снасть'); return; }
  const err = rigReady(t);
  if (err && !rigOf(t).rod) { AUD.error(); toast(RIG_TYPES[t].name + ': ' + err.toLowerCase()); return; }
  G.rigType = t; SAVE.rig = t;
  const st = rigStats();
  if (st.reel) G.drag = Math.min(st.reel.drag, st.line ? Math.round(st.line.str * 0.75 * 10) / 10 : 2);
  sfxClick();
  syncRigButtons(); updateBaitHud(); updateDragUi(); onPhaseChange(G.phase);
  if (err) showMsg(err, 'warn');
  persistSoon();
}

/* ---------------------------------------------------------------- улов */
function onCatch(f) {
  G.phase = 'result';
  const card = $('ov-catch').querySelector('.panel');
  const badges = $('ctBadges');
  badges.innerHTML = '';
  const tod = todOf(SAVE.clock);
  let data;
  if (f.junk) {
    const J = JUNK[f.junk];
    let money = J.price, note = J.desc;
    if (J.chest) money = Math.round(randi(800, 4000) * (1 + SAVE.level * 0.06));
    if (f.junk === 'junk_bottle') note = '«' + pick(BOTTLE_TIPS) + '»';
    data = { junk: true, id: f.junk, w: f.w, money, xp: J.xp, name: J.name, note };
    $('ctImg').src = imgSrc(itemPath(f.junk));
    if (J.chest) badges.innerHTML = '<span class="badge gold">' + icon('chest') + 'Клад!</span>';
    card.classList.toggle('trophy', !!J.chest);
    setText('ctName', J.name);
    setText('ctW', fmtKg(f.w));
    setText('ctPrice', fmt(money) + ' ₽');
    setText('ctXp', '+' + J.xp);
    setText('ctNote', note);
    $('ctRelease').style.display = 'none';
    $('ctKeep').querySelector('span').textContent = 'Забрать';
    $('ctKeep').classList.remove('off');
    $('ctShare').style.display = J.chest ? '' : 'none';
    SAVE.stats.junk++;
    if (J.chest) SAVE.stats.chests++;
    G.sess.junk++;
    AUD.jingle(J.chest ? 'j_trophy' : 'j_sell', AUD.win);
  } else {
    const s = SPECIES[f.id];
    const w = f.w;
    const trophy = w >= s.trophy;
    const value = fishValue(f.id, w, trophy);
    const xp = fishXp(f.id, w) * (trophy ? 2 : 1);
    const prev = SAVE.species[f.id];
    const newSp = !prev;
    const record = !prev || w > prev.best;
    data = { id: f.id, w, trophy, value, xp, newSp, record, protect: !!s.protect, legend: !!s.legend };
    $('ctImg').src = imgSrc(fishPath(f.id));
    setText('ctName', s.name);
    setText('ctW', fmtKg(w));
    setText('ctPrice', s.protect ? 'премия' : fmt(value) + ' ₽');
    setText('ctXp', '+' + xp);
    let b = '';
    if (s.legend) b += '<span class="badge red">' + icon('star') + 'Легенда</span>';
    if (trophy) b += '<span class="badge gold">' + icon('trophy') + 'Трофей</span>';
    if (newSp) b += '<span class="badge blue">' + icon('book') + 'Новый вид</span>';
    else if (record) b += '<span class="badge green">' + icon('flag') + 'Личный рекорд</span>';
    badges.innerHTML = b;
    card.classList.toggle('trophy', trophy || !!s.legend);
    let note;
    if (s.protect) {
      const bonus = protectBonus(f.id, w);
      data.bonus = bonus;
      note = 'Краснокнижный вид — только отпустить! Премия рыбнадзора: ' + fmtMoney(bonus) + '.';
    } else {
      note = 'Скупщик даст ' + fmtMoney(value) + '. Отпустишь — получишь в 1,5 раза больше опыта.';
    }
    setText('ctNote', note);
    $('ctRelease').style.display = '';
    $('ctShare').style.display = '';
    const full = keepnetWeight() + w > keepnetCap();
    data.full = full;
    $('ctKeep').querySelector('span').textContent = s.protect ? 'В садок' : full ? 'Продать сразу' : 'В садок';
    $('ctKeep').classList.toggle('off', !!s.protect);
    // статистика
    SAVE.species[f.id] = { n: (prev ? prev.n : 0) + 1, best: Math.max(prev ? prev.best : 0, w) };
    SAVE.stats.caught++;
    SAVE.stats.weightG += Math.round(w * 1000);
    SAVE.stats.tackle[G.rigType] = (SAVE.stats.tackle[G.rigType] || 0) + 1;
    if (tod === 'night') { SAVE.stats.night++; G.sess.night++; }
    if (trophy) SAVE.stats.trophies++;
    if (!SAVE.stats.biggest || w > SAVE.stats.biggest.w) SAVE.stats.biggest = { id: f.id, w };
    G.sess.count++; G.sess.weight += w;
    if (!G.sess.best || w * (s.price || 300) > G.sess.best.w * ((SPECIES[G.sess.best.id].price) || 300)) G.sess.best = { id: f.id, w };
    questEvent({ type: 'catch', id: f.id, w, rig: G.rigType, loc: G.loc, night: tod === 'night' });
    if (s.legend) AUD.jingle('j_legend', AUD.win);
    else if (trophy || newSp) AUD.jingle('j_trophy', AUD.win);
    else AUD.jingle('j_catch', AUD.win);
    if (SAVE.stats.caught - UI.lastSubmitCount >= 5 || trophy || s.legend) { UI.lastSubmitCount = SAVE.stats.caught; submitScore(); }
  }
  UI.catchData = data;
  // насадка съедена
  if (G.rigType !== 'spin') { const bid = rigOf().bait; if (bid && SAVE.inv[bid] > 0) SAVE.inv[bid]--; }
  openOverlay('ov-catch');
  checkAch();
}
function protectBonus(id, w) { return id === 'beluga' ? Math.round(30000 + w * 100) : Math.round(w * 300 + 200); }
function finishCatch(action) {
  const d = UI.catchData;
  if (!d) return;
  UI.catchData = null;
  const cx0 = APPW / UIK / 2, cy0 = APPH / UIK / 2;
  if (d.junk) {
    addMoney(d.money, cx0, cy0 - 20);
    addXp(d.xp, cx0, cy0 + 10);
  } else if (action === 'release') {
    SAVE.stats.released++; G.sess.released++;
    addXp(Math.round(d.xp * 1.5), cx0, cy0);
    if (d.protect) addMoney(d.bonus, cx0, cy0 - 30);
    AUD.play('splash_s', 0.6);
  } else {
    if (d.full) {
      addMoney(d.value, cx0, cy0 - 30);
      G.sess.money += d.value;
      AUD.jingle('j_sell');
    } else {
      G.keepnet.push({ id: d.id, w: d.w, value: d.value, trophy: d.trophy });
    }
    addXp(d.xp, cx0, cy0);
  }
  G.sess.xp += d.xp;
  closeOv('ov-catch');
  G.fish = null; G.cast = null; G.bite = null;
  G.tension = G.tensionEff = G.tensionShow = 0;
  setPhase('idle');
  checkAch();
  persist();
  const bid = G.rigType === 'spin' ? rigOf().lure : rigOf().bait;
  if (bid && !(SAVE.inv[bid] > 0)) setTimeout(() => { showMsg(G.rigType === 'spin' ? 'Приманки закончились' : 'Наживка закончилась!', 'warn'); }, 600);
}
function shareCatch(d) {
  if (!d) return;
  let text;
  if (d.junk) text = 'Выловил сундук с кладом в игре «Клёвое место»!';
  else {
    const s = SPECIES[d.id];
    text = 'Мой улов — ' + s.name.toLowerCase() + ' весом ' + fmtKg(d.w) + (d.trophy ? ' (трофей!)' : '') + ' в игре «Клёвое место»!';
  }
  shareWithCard(text, makeShareCard(d.junk ? d.id : d.id, d.w, d.junk ? JUNK[d.id].name : SPECIES[d.id].name));
}
function makeShareCard(id, w, title) {
  try {
    const c = document.createElement('canvas');
    c.width = 800; c.height = 420;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 420);
    gr.addColorStop(0, '#f3e7c9'); gr.addColorStop(1, '#d8c49a');
    g.fillStyle = gr; g.fillRect(0, 0, 800, 420);
    g.strokeStyle = '#6a4a24'; g.lineWidth = 8; g.strokeRect(12, 12, 776, 396);
    const im = ASSETS.img(SPECIES[id] ? fishPath(id) : itemPath(id));
    if (im.complete && im.naturalWidth) g.drawImage(im, 150, 60, 500, 250);
    g.fillStyle = '#3a2210'; g.textAlign = 'center';
    g.font = '700 46px ' + FONT; g.fillText(title, 400, 340);
    g.font = '600 30px ' + FONT; g.fillText(fmtKg(w) + ' · Клёвое место', 400, 385);
    return c;
  } catch (e) { return null; }
}

/* ---------------------------------------------------------------- садок */
function openKeep() {
  const list = $('kpList');
  list.innerHTML = '';
  const tot = keepnetWeight();
  const val = G.keepnet.reduce((a, f) => a + f.value, 0);
  $('kpSum').innerHTML = 'Рыб: <b>' + G.keepnet.length + '</b> · вес <b>' + fmtKg(tot) + '</b> из ' + keepnetCap() + ' кг · стоимость <b>' + fmtMoney(val) + '</b>';
  if (!G.keepnet.length) list.innerHTML = '<div class="empty">Садок пуст. Самое время поймать что-нибудь!</div>';
  const sorted = G.keepnet.slice().sort((a, b) => b.value - a.value);
  for (const f of sorted) {
    const r = el('div', 'kp-row', '<img alt=""><span></span><em></em><b></b>');
    r.querySelector('img').src = imgSrc(fishPath(f.id));
    r.querySelector('span').textContent = SPECIES[f.id].name + (f.trophy ? ' (трофей)' : '');
    r.querySelector('em').textContent = fmtKg(f.w);
    r.querySelector('b').textContent = fmtMoney(f.value);
    list.appendChild(r);
  }
  $('kpSell').classList.toggle('off', !G.keepnet.length);
  openOverlay('ov-keep');
}
function sellKeepnet(silent) {
  if (!G.keepnet.length) return 0;
  const val = G.keepnet.reduce((a, f) => a + f.value, 0);
  G.keepnet = [];
  G.sess.money += val;
  if (!silent) {
    addMoney(val, APPW / UIK / 2, APPH / UIK / 2);
    AUD.jingle('j_sell', AUD.buy);
    toast('Улов продан за ' + fmtMoney(val), 'gold');
  } else { SAVE.money += val; SAVE.stats.earned += val; questEvent({ type: 'money', n: val }); }
  persist();
  return val;
}

/* ---------------------------------------------------------------- завершение поездки */
function leaveSession() {
  if (G.ended || !G.sess) return;
  G.ended = true;
  clearInput();
  if (G.phase === 'fight' && G.fish) { G.sess.lost++; }
  const sold = sellKeepnet(true);
  questEvent({ type: 'trip', kg: G.sess.weight, money: G.sess.money, loc: G.loc });
  closeAllOverlays();
  G.paused = true;
  const s = G.sess;
  const best = $('smBest');
  if (s.best) {
    best.innerHTML = '<small>Лучшая рыба</small><img alt=""><b></b>';
    best.querySelector('img').src = imgSrc(fishPath(s.best.id));
    best.querySelector('b').textContent = SPECIES[s.best.id].name + ' · ' + fmtKg(s.best.w);
  } else best.innerHTML = '<small>Сегодня без улова</small><img alt="" src="' + imgSrc(itemPath('junk_boot')) + '"><b>Бывает и такое!</b>';
  const mins = Math.max(0, (SAVE.clock - s.start + 1440) % 1440);
  $('smStats').innerHTML =
    '<div>Поймано<b>' + s.count + ' ' + plural(s.count, 'рыба', 'рыбы', 'рыб') + '</b></div>' +
    '<div>Общий вес<b>' + fmtKg(s.weight) + '</b></div>' +
    '<div>Заработано<b>' + fmtMoney(s.money) + '</b></div>' +
    '<div>Опыт<b>+' + fmt(s.xp) + '</b></div>' +
    '<div>Отпущено<b>' + s.released + '</b></div>' +
    '<div>Сходы и обрывы<b>' + s.lost + '</b></div>';
  setText('smTitle', 'Итоги: ' + G.L.short + ' · ' + Math.floor(mins / 60) + ' ч ' + (mins % 60) + ' мин');
  if (sold) AUD.jingle('j_sell');
  if (s.count > 0) AUD.win(); else AUD.lose();
  haptic(s.count > 0 ? 'success' : 'warning');
  openOverlay('ov-summary');
  metrika('gameFinish', { loc: G.loc, fish: s.count });
  submitScore();
  checkAch();
  persist();
}
function shareTrip() {
  const s = G.sess;
  if (!s) return;
  const text = 'Рыбалка на водоёме «' + G.L.name + '»: ' + s.count + ' ' + plural(s.count, 'рыба', 'рыбы', 'рыб') + ', общий вес ' + fmtKg(s.weight) + ' в игре «Клёвое место»!';
  shareWithCard(text, s.best ? makeShareCard(s.best.id, s.best.w, SPECIES[s.best.id].name) : null);
}
function exitToMenu() {
  stopFishingAudio();
  G.state = 'menu'; G.paused = false;
  closeAllOverlays();
  renderMenu();
  showScreen('menu');
  refreshMusic(true);
  flushPopups();
}
function stopFishingAudio() { AUD.stopLoops(); AUD.stopAmb(); }

/* ---------------------------------------------------------------- пауза */
function pauseGame() {
  if (currentScreen !== 'fish' || G.paused || G.ended) return;
  if (anyOverlay() && !$('ov-pause').classList.contains('show')) { clearInput(); return; }
  G.paused = true;
  clearInput();
  AUD.stopMusic(); AUD.stopAmb();
  syncSoundButtons();
  openOverlay('ov-pause');
}
function resumeGame() {
  if (!G.paused) return;
  G.paused = false;
  lastTs = performance.now();
  closeOv('ov-pause');
  refreshMusic(true);
}

/* ---------------------------------------------------------------- быстрый выбор насадки */
function openTackleQuick() {
  const t = G.rigType;
  const r = rigOf(t);
  const list = $('btList'), gb = $('btGb');
  list.innerHTML = ''; gb.innerHTML = '';
  setText('btTitle', t === 'spin' ? 'Приманка' : 'Насадка');
  const src = t === 'spin' ? LURES : BAITS;
  let any = false;
  for (const id in src) {
    const n = SAVE.inv[id] || 0;
    if (!n && src[id].level > SAVE.level) continue;
    any = true;
    const sel = t === 'spin' ? r.lure === id : r.bait === id;
    const o = el('button', 'opt' + (sel ? ' on' : '') + (n ? '' : ' zero'), '<img alt=""><span></span>');
    o.querySelector('img').src = imgSrc(itemIcon(id));
    o.querySelector('span').innerHTML = '';
    o.querySelector('span').append(src[id].name);
    const sm = el('small'); sm.textContent = n ? n + ' шт.' : 'нет — купить в магазине';
    o.querySelector('span').appendChild(sm);
    o.addEventListener('click', () => {
      if (!n) { AUD.error(); toast('Купи в магазине'); return; }
      sfxClick();
      if (t === 'spin') r.lure = id; else r.bait = id;
      if (G.cast && G.cast.baitless === undefined && G.phase !== 'idle' && t !== 'spin') toast('Новая насадка — после перезаброса');
      updateBaitHud(); persistSoon();
      closeOv('ov-bait');
    });
    list.appendChild(o);
  }
  if (!any) list.innerHTML = '<div class="empty">Ничего нет — загляни в магазин</div>';
  if (t === 'feeder') {
    setText('btSubT', 'Прикормка');
    const none = el('button', 'opt' + (!r.gb ? ' on' : ''), '<span>Без прикормки</span>');
    none.addEventListener('click', () => { r.gb = null; sfxClick(); closeOv('ov-bait'); persistSoon(); });
    gb.appendChild(none);
    for (const id in GROUNDBAITS) {
      const n = SAVE.inv[id] || 0;
      if (!n) continue;
      const o = el('button', 'opt' + (r.gb === id ? ' on' : ''), '<img alt=""><span></span>');
      o.querySelector('img').src = imgSrc(itemPath(id));
      o.querySelector('span').append(GROUNDBAITS[id].name.replace('Прикормка ', ''));
      const sm = el('small'); sm.textContent = n + ' порц.'; o.querySelector('span').appendChild(sm);
      o.addEventListener('click', () => { r.gb = id; sfxClick(); closeOv('ov-bait'); persistSoon(); });
      gb.appendChild(o);
    }
  } else if (t === 'float') {
    setText('btSubT', 'Крючок');
    for (const id in HOOKS) {
      const n = SAVE.inv[id] || 0;
      if (!n) continue;
      const o = el('button', 'opt' + (r.hook === id ? ' on' : ''), '<img alt=""><span></span>');
      o.querySelector('img').src = imgSrc(itemPath(id));
      o.querySelector('span').append(HOOKS[id].name);
      const sm = el('small'); sm.textContent = n + ' шт.'; o.querySelector('span').appendChild(sm);
      o.addEventListener('click', () => { r.hook = id; sfxClick(); closeOv('ov-bait'); persistSoon(); });
      gb.appendChild(o);
    }
  } else setText('btSubT', '');
  openOverlay('ov-bait');
  makeScroll(list); makeScroll(gb);
}

/* ---------------------------------------------------------------- магазин */
const SHOP_TABS = [
  ['rods', 'Удилища', 'rod'], ['reels', 'Катушки', 'reel'], ['lines', 'Лески', 'wave'], ['hooks', 'Крючки', 'hook'],
  ['baits', 'Наживка', 'fish'], ['lures', 'Приманки', 'spin'], ['gb', 'Прикормка', 'feeder'], ['gear', 'Снаряжение', 'keepnet'],
];
function shopSource(tab) {
  return { rods: RODS, reels: REELS, lines: LINES, hooks: HOOKS, baits: BAITS, lures: LURES, gb: GROUNDBAITS, gear: GEAR }[tab];
}
function openShop(tab, from) {
  UI.returnTo = from || (currentScreen === 'fish' ? 'fish' : currentScreen === 'tackle' ? UI.returnTo : 'menu');
  if (tab) UI.shopTab = tab;
  closeAllOverlays();
  showScreen('shop');
  renderShop();
  refreshMusic();
}
function itemStats(tab, id, it) {
  switch (tab) {
    case 'rods': return RIG_TYPES[it.type].name + '<br>Заброс <b>' + it.cast + ' м</b> · нагрузка <b>' + it.power + ' кг</b> · чувств. <b>' + Math.round(it.sens * 100) + '%</b>';
    case 'reels': return 'Фрикцион <b>' + it.drag + ' кг</b> · подмотка <b>' + it.speed.toFixed(1).replace('.', ',') + ' м/с</b><br>Лескоёмкость <b>' + it.cap + ' м</b>';
    case 'lines': return 'Разрыв <b>' + it.str + ' кг</b> · заметность <b>' + Math.round(it.vis * 100) + '%</b>' + (it.braid ? '<br>Плетёнка: точная подсечка, жёсткие рывки' : '<br>Монолеска: гасит рывки');
    case 'hooks': return 'Размер <b>' + it.size + '/5</b> · пачка <b>' + it.pack + ' шт.</b><br>' + (it.size <= 2 ? 'Для мелкой и осторожной рыбы' : it.size >= 4 ? 'Для крупной рыбы и хищника' : 'Универсальный');
    case 'baits': return it.desc + '<br>Пачка: <b>' + it.pack + ' шт.</b>';
    case 'lures': return it.desc + '<br>Проводка: <b>' + LAYER_NAMES[it.layer] + '</b>';
    case 'gb': return it.desc + '<br>Пачка: <b>' + it.pack + ' порций</b>';
    case 'gear': return it.desc + (it.pack ? '<br>Пачка: <b>' + it.pack + ' шт.</b>' : '');
  }
  return '';
}
function isConsumable(tab, it) { return tab === 'hooks' || tab === 'baits' || tab === 'gb' || tab === 'lures' || (tab === 'gear' && it.consumable); }
function renderShop() {
  setText('shopMoney', fmt(SAVE.money));
  const tabs = $('shopTabs');
  if (!tabs.childElementCount) {
    for (const [k, n, ic] of SHOP_TABS) {
      const b = el('button', 'tab', icon(ic) + '<span>' + n + '</span>');
      b.dataset.tab = k;
      b.addEventListener('click', () => { sfxClick(); UI.shopTab = k; renderShop(); $('shopList').scrollTop = 0; });
      tabs.appendChild(b);
    }
    makeScroll(tabs);
  }
  tabs.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === UI.shopTab));
  const list = $('shopList');
  list.innerHTML = '';
  const src = shopSource(UI.shopTab);
  const ids = Object.keys(src).sort((a, b) => (src[a].level - src[b].level) || (src[a].price - src[b].price));
  for (const id of ids) {
    const it = src[id];
    const cons = isConsumable(UI.shopTab, it);
    const owned = !cons && SAVE.owned[id];
    const locked = it.level > SAVE.level;
    const broken = UI.shopTab === 'rods' && SAVE.broken[id];
    const card = el('div', 'card paper' + (locked ? ' locked' : '') + (broken ? ' broken' : ''));
    card.innerHTML = '<div class="ci"><img alt=""></div><div class="cb2"><h3></h3><div class="cs"></div><div class="cf"></div></div>';
    card.querySelector('img').src = imgSrc(itemIcon(id));
    card.querySelector('h3').textContent = it.name;
    card.querySelector('.cs').innerHTML = itemStats(UI.shopTab, id, it);
    const cf = card.querySelector('.cf');
    if (cons && SAVE.inv[id]) { const c = el('div', 'cnt'); c.textContent = SAVE.inv[id]; card.appendChild(c); }
    if (broken) {
      const cost = repairCost(id);
      cf.innerHTML = '<div class="price">' + icon('coin') + fmt(cost) + '</div>';
      const b = el('button', 'btn btn-main buy', 'Починить');
      b.addEventListener('click', () => repairRod(id));
      cf.appendChild(b);
    } else if (locked) {
      cf.innerHTML = '<div class="price">' + icon('coin') + fmt(it.price) + '</div><div class="lock">' + icon('lock', 'sm') + 'Ур. ' + it.level + '</div>';
    } else if (owned) {
      cf.innerHTML = '<div class="own">Куплено</div>';
    } else {
      cf.innerHTML = '<div class="price">' + icon('coin') + (it.price ? fmt(it.price) : '0') + '</div>';
      const b = el('button', 'btn btn-main buy', cons ? 'Купить' : 'Купить');
      if (SAVE.money < it.price) b.classList.add('off');
      b.addEventListener('click', () => buyItem(UI.shopTab, id));
      cf.appendChild(b);
    }
    list.appendChild(card);
  }
  makeScroll(list);
}
function repairCost(id) { return Math.max(100, Math.round(RODS[id].price * 0.3)); }
function repairRod(id) {
  const c = repairCost(id);
  if (SAVE.money < c) { AUD.error(); toast('Не хватает денег'); return; }
  SAVE.money -= c; delete SAVE.broken[id];
  AUD.buy(); toast('Удилище как новое!');
  persist(); renderShop();
}
function buyItem(tab, id) {
  const it = shopSource(tab)[id];
  if (it.level > SAVE.level) { AUD.error(); return; }
  if (SAVE.money < it.price) { AUD.error(); toast('Не хватает денег'); haptic('error'); return; }
  SAVE.money -= it.price;
  if (isConsumable(tab, it)) {
    SAVE.inv[id] = (SAVE.inv[id] || 0) + (it.pack || 1);
  } else {
    SAVE.owned[id] = 1;
  }
  autoAssign(tab, id);
  AUD.buy(); haptic('light');
  toast('Куплено: ' + it.name);
  persist();
  renderShop();
}
function autoAssign(tab, id) {
  const R = SAVE.rigs;
  const bestReel = () => Object.keys(REELS).filter(k => SAVE.owned[k]).sort((a, b) => REELS[b].drag - REELS[a].drag)[0] || null;
  const bestLine = () => Object.keys(LINES).filter(k => SAVE.owned[k]).sort((a, b) => LINES[b].str - LINES[a].str)[0] || null;
  if (tab === 'rods') {
    const t = RODS[id].type;
    if (!R[t].rod || RODS[id].tier > RODS[R[t].rod].tier) R[t].rod = id;
    if (!R[t].reel) R[t].reel = bestReel();
    if (!R[t].line) R[t].line = bestLine();
    if (t === 'spin' && !R.spin.lure) R.spin.lure = Object.keys(LURES).find(k => SAVE.inv[k] > 0) || null;
    if (t === 'feeder' && !R.feeder.bait) R.feeder.bait = Object.keys(BAITS).find(k => SAVE.inv[k] > 0) || null;
  }
  if (tab === 'reels') for (const t in R) if (R[t].rod && !R[t].reel) R[t].reel = id;
  if (tab === 'lines') for (const t in R) if (R[t].rod && !R[t].line) R[t].line = id;
  if (tab === 'lures' && !R.spin.lure) R.spin.lure = id;
  if (tab === 'baits') { if (!R.float.bait || !SAVE.inv[R.float.bait]) R.float.bait = id; if (!R.feeder.bait || !SAVE.inv[R.feeder.bait]) R.feeder.bait = id; }
  if (tab === 'gb' && !R.feeder.gb) R.feeder.gb = id;
  if (tab === 'hooks') { for (const t of ['float', 'feeder']) if (!R[t].hook || !SAVE.inv[R[t].hook]) R[t].hook = id; }
}
function shopBack() {
  sfxClick();
  if (UI.returnTo === 'fish') { showScreen('fish'); G.paused = false; lastTs = performance.now(); hudInit(); refreshMusic(true); }
  else if (UI.returnTo === 'tackle') { openTackle(UI.tackleRig, UI.tackleFrom || 'menu'); }
  else if (UI.returnTo === 'map') { showScreen('map'); renderMap(); }
  else { renderMenu(); showScreen('menu'); refreshMusic(); }
}

/* ---------------------------------------------------------------- снасти */
const SLOT_DEFS = {
  float: [['rod', 'Удилище'], ['reel', 'Катушка'], ['line', 'Леска'], ['hook', 'Крючок'], ['bait', 'Насадка']],
  feeder: [['rod', 'Удилище'], ['reel', 'Катушка'], ['line', 'Леска'], ['hook', 'Крючок'], ['bait', 'Насадка'], ['gb', 'Прикормка']],
  spin: [['rod', 'Удилище'], ['reel', 'Катушка'], ['line', 'Леска'], ['lure', 'Приманка']],
};
function openTackle(rig, from) {
  UI.tackleRig = rig || (currentScreen === 'fish' ? G.rigType : SAVE.rig);
  UI.tackleFrom = from || (currentScreen === 'fish' ? 'fish' : 'menu');
  closeAllOverlays();
  showScreen('tackle');
  UI.tackleSlot = 'rod';
  renderTackle();
  refreshMusic();
}
function slotOptions(rig, slot) {
  switch (slot) {
    case 'rod': return Object.keys(RODS).filter(k => SAVE.owned[k] && RODS[k].type === rig);
    case 'reel': return Object.keys(REELS).filter(k => SAVE.owned[k]);
    case 'line': return Object.keys(LINES).filter(k => SAVE.owned[k]);
    case 'hook': return Object.keys(HOOKS).filter(k => SAVE.inv[k] > 0);
    case 'bait': return Object.keys(BAITS).filter(k => SAVE.inv[k] > 0);
    case 'lure': return Object.keys(LURES).filter(k => SAVE.inv[k] > 0);
    case 'gb': return Object.keys(GROUNDBAITS).filter(k => SAVE.inv[k] > 0);
  }
  return [];
}
function renderTackle() {
  document.querySelectorAll('#tackleTabs .tab').forEach(b => b.classList.toggle('on', b.dataset.rig === UI.tackleRig));
  const rig = UI.tackleRig;
  const r = SAVE.rigs[rig];
  const slots = $('tkSlots');
  slots.innerHTML = '';
  for (const [slot, label] of SLOT_DEFS[rig]) {
    const id = r[slot];
    const has = id && (slot === 'rod' || slot === 'reel' || slot === 'line' ? SAVE.owned[id] : SAVE.inv[id] > 0);
    const b = el('button', 'slot' + (UI.tackleSlot === slot ? ' on' : '') + (!has && slot !== 'gb' ? ' miss' : ''), '<img alt=""><div class="sl"><small></small><b></b></div>' + icon('swap'));
    b.querySelector('small').textContent = label;
    let nm = has ? itemName(id) : (slot === 'gb' ? 'Без прикормки' : 'Не выбрано');
    if (has && (slot === 'hook' || slot === 'bait' || slot === 'lure' || slot === 'gb')) nm += ' · ' + SAVE.inv[id];
    if (has && slot === 'rod' && SAVE.broken[id]) nm += ' (сломано)';
    b.querySelector('b').textContent = nm;
    const im = b.querySelector('img');
    if (has) im.src = imgSrc(itemIcon(id)); else im.style.visibility = 'hidden';
    b.addEventListener('click', () => { sfxClick(); UI.tackleSlot = slot; renderTackle(); });
    slots.appendChild(b);
  }
  // сводка
  const st = { rod: RODS[r.rod], reel: REELS[r.reel], line: LINES[r.line] };
  const sum = $('tkSum');
  let h = '';
  h += '<div>Заброс<b>' + (st.rod ? st.rod.cast + ' м' : '—') + '</b></div>';
  h += '<div>Прочность лески<b>' + (st.line ? st.line.str + ' кг' : '—') + '</b></div>';
  h += '<div>Фрикцион до<b>' + (st.reel ? st.reel.drag + ' кг' : '—') + '</b></div>';
  h += '<div>Нагрузка удилища<b>' + (st.rod ? st.rod.power + ' кг' : '—') + '</b></div>';
  h += '<div>Подмотка<b>' + (st.reel ? st.reel.speed.toFixed(1).replace('.', ',') + ' м/с' : '—') + '</b></div>';
  h += '<div>Лескоёмкость<b>' + (st.reel ? st.reel.cap + ' м' : '—') + '</b></div>';
  const err = rigReady(rig);
  if (err) h += '<div class="warn">' + icon('warn') + err + '</div>';
  else if (st.line && st.rod && st.line.str > st.rod.power * 1.3) h += '<div class="warn">' + icon('warn') + 'Леска сильнее удилища — не перегружай его!</div>';
  sum.innerHTML = h;
  // выбор
  const pick = $('tkPick');
  pick.innerHTML = '';
  const slot = UI.tackleSlot;
  const opts = slotOptions(rig, slot);
  const head = el('h4'); head.textContent = 'Выбери: ' + SLOT_DEFS[rig].find(s => s[0] === slot)[1].toLowerCase();
  pick.appendChild(head);
  if (slot === 'gb') {
    const o = el('button', 'opt' + (!r.gb ? ' on' : ''), '<span>Без прикормки</span>');
    o.addEventListener('click', () => { r.gb = null; sfxClick(); persistSoon(); renderTackle(); });
    pick.appendChild(o);
  }
  if (!opts.length) {
    const e = el('div', 'empty', 'Ничего подходящего нет. ');
    const b = el('button', 'btn btn-main', 'В магазин');
    b.style.minHeight = '36px';
    const tabFor = { rod: 'rods', reel: 'reels', line: 'lines', hook: 'hooks', bait: 'baits', lure: 'lures', gb: 'gb' }[slot];
    b.addEventListener('click', () => { UI.tackleRig = rig; openShop(tabFor, 'tackle'); });
    e.appendChild(b);
    pick.appendChild(e);
  }
  for (const id of opts) {
    const o = el('button', 'opt' + (r[slot] === id ? ' on' : ''), '<img alt=""><span></span>');
    o.querySelector('img').src = imgSrc(itemIcon(id));
    const sp = o.querySelector('span');
    sp.append(itemName(id));
    const sm = el('small');
    if (slot === 'rod') sm.textContent = RODS[id].cast + ' м · ' + RODS[id].power + ' кг' + (SAVE.broken[id] ? ' · сломано' : '');
    else if (slot === 'reel') sm.textContent = 'фрикцион ' + REELS[id].drag + ' кг';
    else if (slot === 'line') sm.textContent = 'разрыв ' + LINES[id].str + ' кг';
    else sm.textContent = SAVE.inv[id] + ' шт.';
    sp.appendChild(sm);
    o.addEventListener('click', () => {
      sfxClick();
      r[slot] = id;
      persistSoon();
      renderTackle();
    });
    pick.appendChild(o);
  }
  makeScroll(pick); makeScroll(slots);
}
function tackleBack() {
  sfxClick();
  if (UI.tackleFrom === 'fish') {
    showScreen('fish');
    G.paused = false; lastTs = performance.now();
    if (G.phase === 'idle') { const err = rigReady(UI.tackleRig); if (!err || !rigReady(G.rigType)) {} }
    if (G.phase === 'idle' && !rigReady(UI.tackleRig)) G.rigType = UI.tackleRig;
    const st = rigStats();
    if (st.reel) G.drag = Math.min(G.drag, st.reel.drag);
    hudInit();
    refreshMusic(true);
  } else { renderMenu(); showScreen('menu'); refreshMusic(); }
}

/* ---------------------------------------------------------------- задания */
function questPool() {
  const locs = LOCATION_ORDER.filter(k => LOCATIONS[k].level <= SAVE.level);
  const sp = new Set();
  for (const l of locs) for (const f in LOCATIONS[l].fish) if (!SPECIES[f].legend && !SPECIES[f].protect) sp.add(f);
  return { locs, sp: Array.from(sp) };
}
function genQuest() {
  const { locs, sp } = questPool();
  const lvl = SAVE.level;
  const mult = 1 + lvl * 0.25;
  const t = Math.random();
  let q;
  if (t < 0.32) {
    const id = pick(sp);
    const n = randi(3, 7);
    q = { type: 'species', sp: id, n, text: 'Поймать: ' + SPECIES[id].name.toLowerCase() + ' × ' + n };
  } else if (t < 0.5) {
    const id = pick(sp.filter(k => SPECIES[k].max > 0.5).length ? sp.filter(k => SPECIES[k].max > 0.5) : sp);
    const s = SPECIES[id];
    let maxW = s.max;
    for (const l of locs) { const L = LOCATIONS[l]; if (L.fish[id] && L.sizeMul && L.sizeMul[id] != null) maxW = Math.min(maxW, s.min + (s.max - s.min) * L.sizeMul[id]); }
    const w = Math.round((s.min + (maxW - s.min) * rand(0.25, 0.4)) * 10) / 10;
    q = { type: 'weight', sp: id, w: Math.max(0.1, w), n: 1, text: SPECIES[id].name + ' весом от ' + fmtKg(Math.max(0.1, w)) };
  } else if (t < 0.64) {
    const kg = Math.round(rand(3, 8) * mult);
    q = { type: 'trip', kg, n: kg, text: 'Наловить ' + kg + ' кг за одну поездку' };
  } else if (t < 0.78) {
    const rigs = ['float', 'feeder', 'spin'].filter(r => SAVE.rigs[r].rod);
    const rg = pick(rigs.length ? rigs : ['float']);
    const n = randi(5, 12);
    q = { type: 'rig', rig: rg, n, text: 'Поймать ' + n + ' ' + plural(n, 'рыбу', 'рыбы', 'рыб') + ' на ' + { float: 'поплавок', feeder: 'фидер', spin: 'спиннинг' }[rg] };
  } else if (t < 0.88) {
    const n = randi(3, 8);
    q = { type: 'night', n, text: 'Поймать ' + n + ' ' + plural(n, 'рыбу', 'рыбы', 'рыб') + ' ночью' };
  } else {
    const l = pick(locs);
    const n = randi(6, 14);
    q = { type: 'loc', loc: l, n, text: 'Поймать ' + n + ' ' + plural(n, 'рыбу', 'рыбы', 'рыб') + ' на месте «' + LOCATIONS[l].short + '»' };
  }
  q.p = 0; q.done = false; q.claimed = false;
  q.money = Math.round((150 + q.n * 30) * mult / 10) * 10;
  q.xp = Math.round((40 + q.n * 10) * mult);
  if (q.type === 'weight') { q.money *= 3; q.xp *= 2; }
  if (q.type === 'trip') { q.money = Math.round(q.kg * 60 * mult / 10) * 10; q.xp = Math.round(q.kg * 12 * mult); }
  return q;
}
function questKey(q) { return q.type + ':' + (q.sp || q.rig || q.loc || ''); }
function ensureQuests() {
  SAVE.quests = SAVE.quests.filter(q => !q.claimed);
  let guard = 0;
  while (SAVE.quests.length < 3 && guard++ < 50) {
    const q = genQuest();
    if (SAVE.quests.some(o => questKey(o) === questKey(q))) continue;
    SAVE.quests.push(q);
  }
}
function questEvent(e) {
  let changed = false;
  for (const q of SAVE.quests) {
    if (q.done) continue;
    let inc = 0;
    if (e.type === 'catch') {
      if (q.type === 'species' && e.id === q.sp) inc = 1;
      if (q.type === 'weight' && e.id === q.sp && e.w >= q.w) inc = 1;
      if (q.type === 'rig' && e.rig === q.rig) inc = 1;
      if (q.type === 'night' && e.night) inc = 1;
      if (q.type === 'loc' && e.loc === q.loc) inc = 1;
    }
    if (e.type === 'trip' && q.type === 'trip') { q.p = Math.max(q.p, Math.floor(e.kg)); changed = true; }
    if (inc) { q.p += inc; changed = true; }
    if (q.p >= q.n && !q.done) {
      q.done = true; q.p = q.n;
      queuePopup(() => { toast('Задание выполнено: ' + q.text, 'gold'); AUD.jingle('j_quest'); });
    }
  }
  if (changed) persistSoon();
}
function renderQuests() {
  ensureQuests();
  const list = $('qList');
  list.innerHTML = '';
  for (const q of SAVE.quests) {
    const row = el('div', 'q' + (q.done ? ' done' : ''), '<div class="qi"></div><div class="qb"><div class="qt"></div><div class="qp"><i></i></div><div class="qr"></div></div>');
    let ic = itemPath('tacklebox');
    if (q.sp) ic = fishPath(q.sp);
    else if (q.type === 'rig') ic = itemPath(SAVE.rigs[q.rig].rod || 'rod_float_1');
    else if (q.type === 'night') ic = itemPath('thermos');
    else if (q.type === 'trip') ic = itemPath('keepnet_2');
    else if (q.type === 'loc') ic = itemPath('sonar');
    row.querySelector('.qi').style.backgroundImage = 'url(' + imgSrc(ic) + ')';
    row.querySelector('.qt').textContent = q.text;
    row.querySelector('.qp i').style.width = clamp(q.p / q.n * 100, 0, 100) + '%';
    row.querySelector('.qr').innerHTML = '<span>' + (q.type === 'trip' ? fmt(q.p) + ' / ' + q.n + ' кг' : q.p + ' / ' + q.n) + '</span><span>Награда: <b>' + fmtMoney(q.money) + '</b> и <b>' + q.xp + '</b> опыта</span>';
    if (q.done) {
      const b = el('button', 'btn btn-main', 'Забрать');
      b.addEventListener('click', () => {
        q.claimed = true; SAVE.questDone++;
        addMoney(q.money, APPW / UIK / 2, APPH / UIK / 2 - 20);
        addXp(q.xp, APPW / UIK / 2, APPH / UIK / 2 + 10);
        AUD.jingle('j_quest');
        ensureQuests(); persist(); renderQuests(); renderMenu();
      });
      row.appendChild(b);
    } else {
      const b = el('button', 'btn plank', 'Заменить');
      b.title = 'Заменить за 100 ₽';
      b.addEventListener('click', () => {
        if (SAVE.money < 100) { AUD.error(); toast('Замена стоит 100 ₽'); return; }
        SAVE.money -= 100;
        const i = SAVE.quests.indexOf(q);
        let nq = genQuest(), guard = 0;
        while (guard++ < 30 && SAVE.quests.some(o => questKey(o) === questKey(nq))) nq = genQuest();
        SAVE.quests[i] = nq;
        sfxClick(); persist(); renderQuests(); renderMenu();
      });
      row.appendChild(b);
    }
    list.appendChild(row);
  }
  $('qFoot').textContent = 'Выполнено заданий: ' + SAVE.questDone + ' · замена задания — 100 ₽';
  openOverlay('ov-quests');
}

/* ---------------------------------------------------------------- атлас */
function renderAtlas() {
  const list = $('atList');
  list.innerHTML = '';
  const ids = Object.keys(SPECIES);
  setText('atCount', Object.keys(SAVE.species).length + ' / ' + ids.length);
  for (const id of ids) {
    const s = SPECIES[id];
    const got = SAVE.species[id];
    const a = el('button', 'at' + (got ? '' : ' un') + (s.legend ? ' legend' : ''), '<img alt=""><span></span><small></small>');
    a.querySelector('img').src = imgSrc(fishPath(id));
    a.querySelector('span').textContent = got ? s.name : '???';
    a.querySelector('small').textContent = got ? fmtKg(got.best) + ' · ' + got.n + ' шт.' : (s.legend ? 'легенда' : 'не поймана');
    a.addEventListener('click', () => { sfxClick(); if (got) openFishInfo(id); else toast('Поймай эту рыбу, чтобы узнать о ней'); });
    list.appendChild(a);
  }
  openOverlay('ov-atlas');
  makeScroll(list);
}
function openFishInfo(id) {
  const s = SPECIES[id];
  const got = SAVE.species[id];
  $('fiImg').src = imgSrc(fishPath(id));
  setText('fiName', s.name);
  setText('fiDesc', s.desc);
  const where = LOCATION_ORDER.filter(l => LOCATIONS[l].fish[id]).map(l => LOCATIONS[l].short).join(', ');
  const baits = Object.keys(s.baits).sort((a, b) => s.baits[b] - s.baits[a]).slice(0, 4).map(b => BAITS[b].name.toLowerCase());
  const lures = Object.keys(s.lures).sort((a, b) => s.lures[b] - s.lures[a]).slice(0, 3).map(b => LURES[b].name.toLowerCase());
  const best = Object.entries(s.tod).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [
    ['Где ловится', where],
    ['Вес', fmtKg(s.min) + ' — ' + fmtKg(s.max)],
    ['Трофей от', fmtKg(s.trophy)],
    ['Цена', s.protect ? 'охраняется' : s.fixed ? fmtMoney(s.fixed) : fmtMoney(s.price) + ' за кг'],
    ['Держится', LAYER_NAMES[s.layer] + ', ' + s.depth[0] + '–' + s.depth[1] + ' м'],
    ['Лучшее время', TOD_NAMES[best].toLowerCase()],
  ];
  if (baits.length) rows.push(['Насадки', baits.join(', ')]);
  if (lures.length) rows.push(['Приманки', lures.join(', ')]);
  if (got) rows.push(['Твой рекорд', fmtKg(got.best) + ' (поймано ' + got.n + ')']);
  const t = $('fiTbl');
  t.innerHTML = '';
  for (const [k, v] of rows) { const a = el('span'); a.textContent = k; const b = el('b'); b.textContent = v; t.appendChild(a); t.appendChild(b); }
  openOverlay('ov-fishinfo');
  makeScroll(document.querySelector('.fi-text'));
}

/* ---------------------------------------------------------------- достижения */
function checkAch() {
  for (const a of ACHIEVEMENTS) {
    if (SAVE.ach[a.id]) continue;
    let ok = false;
    try { ok = !!a.test(SAVE); } catch (e) { ok = false; }
    if (ok) {
      SAVE.ach[a.id] = 1;
      SAVE.money += a.reward; SAVE.stats.earned += a.reward;
      queuePopup(() => { toast('Достижение: «' + a.name + '» +' + fmtMoney(a.reward), 'gold'); AUD.jingle('j_unlock', AUD.win); haptic('success'); });
      persistSoon();
    }
  }
}
function renderAch() {
  const list = $('achList');
  list.innerHTML = '';
  let n = 0;
  for (const a of ACHIEVEMENTS) {
    const ok = !!SAVE.ach[a.id];
    if (ok) n++;
    const r = el('div', 'ach' + (ok ? ' ok' : ''), icon(ok ? 'trophy' : 'lock') + '<div><b></b><small></small></div>');
    r.querySelector('b').textContent = a.name;
    r.querySelector('small').textContent = a.desc + ' · ' + fmtMoney(a.reward);
    list.appendChild(r);
  }
  setText('achCount', n + ' / ' + ACHIEVEMENTS.length);
  const st = SAVE.stats;
  const big = st.biggest ? SPECIES[st.biggest.id].name + ' ' + fmtKg(st.biggest.w) : '—';
  $('achStats').innerHTML = '<div>Поймано<b>' + fmt(st.caught) + '</b></div><div>Общий вес<b>' + fmtKg(st.weightG / 1000) + '</b></div><div>Трофеев<b>' + st.trophies + '</b></div><div>Видов<b>' + Object.keys(SAVE.species).length + '</b></div>';
  $('achStats').title = 'Самая крупная: ' + big;
  openOverlay('ov-ach');
  makeScroll(list);
}

/* ---------------------------------------------------------------- уровень */
function showLevelUp(lv) {
  setText('lvNum', lv);
  setText('lvRank', rankOf(lv));
  const box = $('lvUnl');
  box.innerHTML = '';
  const add = (img, text) => { const d = el('div', '', '<img alt=""><span></span>'); d.querySelector('img').src = imgSrc(img); d.querySelector('span').textContent = text; box.appendChild(d); };
  for (const id of LOCATION_ORDER) if (LOCATIONS[id].level === lv) add(itemPath('sonar'), 'Водоём: ' + LOCATIONS[id].name);
  const cats = [RODS, REELS, LINES, HOOKS, BAITS, LURES, GROUNDBAITS, GEAR];
  for (const c of cats) for (const id in c) if (c[id].level === lv) add(itemIcon(id), c[id].name);
  if (!box.childElementCount) { const d = el('div'); d.textContent = 'Рыба уважает тебя всё больше!'; box.appendChild(d); }
  AUD.jingle('j_levelup', AUD.win);
  haptic('success');
  openOverlay('ov-level');
  renderMenu();
}

/* ---------------------------------------------------------------- подарок дня */
let dailyGift = null;
function openDaily() {
  if (SAVE.daily === todayStr()) { toast('Подарок уже получен — приходи завтра!'); return; }
  const y = new Date(); y.setDate(y.getDate() - 1);
  const ys = y.getFullYear() + '-' + (y.getMonth() + 1) + '-' + y.getDate();
  const streak = SAVE.daily === ys ? SAVE.streak + 1 : 1;
  const money = Math.min(2000, 150 + streak * 75 + SAVE.level * 25);
  const pool = Object.keys(BAITS).filter(k => BAITS[k].level <= SAVE.level);
  const items = [];
  for (let i = 0; i < 2 + Math.min(3, Math.floor(streak / 2)); i++) {
    const id = pick(pool);
    items.push([id, Math.ceil(BAITS[id].pack / 2)]);
  }
  if (streak % 3 === 0) items.push(['thermos', 1]);
  if (SAVE.level >= 2 && Math.random() < 0.5) items.push([pick(Object.keys(GROUNDBAITS).filter(k => GROUNDBAITS[k].level <= SAVE.level)) || 'gb_universal', 3]);
  dailyGift = { streak, money, items };
  $('dlImg').src = imgSrc(itemPath('tacklebox'));
  setText('dlText', 'День ' + streak + ' подряд! Внутри ' + fmtMoney(money) + ' и снасти:');
  const box = $('dlItems');
  box.innerHTML = '';
  for (const [id, n] of items) {
    const d = el('div', '', '<img alt=""><span></span>');
    d.querySelector('img').src = imgSrc(itemIcon(id));
    d.querySelector('span').textContent = itemName(id) + ' ×' + n;
    box.appendChild(d);
  }
  openOverlay('ov-daily');
}
function claimDaily() {
  if (!dailyGift) return;
  SAVE.daily = todayStr();
  SAVE.streak = dailyGift.streak;
  for (const [id, n] of dailyGift.items) SAVE.inv[id] = (SAVE.inv[id] || 0) + n;
  addMoney(dailyGift.money, APPW / UIK / 2, APPH / UIK / 2);
  dailyGift = null;
  AUD.jingle('j_unlock');
  persist();
  closeOv('ov-daily');
  renderMenu();
}

/* ---------------------------------------------------------------- помощь */
const HELP = [
  ['map', 'Выбери водоём', 'На карте семь мест рыбалки. Новые открываются с ростом уровня. Путёвка оплачивается за каждую поездку.'],
  ['cast', 'Заброс', 'Коснись воды, чтобы выбрать направление. Зажми «Заброс» — шкала силы поползёт вверх-вниз. Отпусти на нужной силе.'],
  ['float', 'Поплавок', 'Настрой спуск — глубину насадки. У дна клюют лещ, карась и линь, в толще — плотва и окунь. Поплавок дрожит — жди, утонул — подсекай!'],
  ['feeder', 'Фидер', 'Дальний донный заброс. Кидай в одну точку с прикормкой — рыба соберётся. Поклёвку покажет кончик удилища и колокольчик.'],
  ['spin', 'Спиннинг', 'Зажимай «Подмотка», чтобы вести приманку. Делай паузы — джиг на дне особенно уловист. При ударе хищника подсекай.'],
  ['reel', 'Вываживание', 'Держи «Тянуть». Если натяжение выше фрикциона — катушка стравливает леску. Ставь фрикцион примерно на 3/4 прочности лески: выше — риск обрыва на рывках.'],
  ['net', 'Утоми рыбу', 'Свежая рыба у берега снова уходит в рывок. Следи за полоской сил: когда она почти пуста — рыбу можно брать подсаком.'],
  ['arrow-l', 'Наклон удилища', 'Стрелкой показан ход рыбы. Наклоняй удилище в противоположную сторону — рыба быстрее устанет.'],
  ['keepnet', 'Садок и продажа', 'Улов копится в садке. Продай его скупщику или уезжай — рыбу купят автоматически. Отпущенная рыба даёт больше опыта.'],
  ['sun', 'Погода и время', 'Утро и вечер — лучший клёв. Ночью активны сом, налим и судак. Падение давления перед дождём будит рыбу.'],
  ['star', 'Активные точки', 'Пузыри, всплески хищника и чайки над водой выдают рыбу. Кидай туда — поклёвок станет в разы больше!'],
  ['hook', 'Крючок и леска', 'Крупный крючок отпугивает мелочь, мелкий — плохо держит трофей. Толстая леска надёжнее, но осторожная рыба её видит.'],
  ['trophy', 'Рейтинг', 'В рейтинг идёт общий вес всей пойманной рыбы. Ловите больше и крупнее!'],
];
function renderHelp() {
  const list = $('helpList');
  if (!list.childElementCount) {
    for (const [ic, t, p] of HELP) {
      const d = el('div', 'hp', icon(ic) + '<div><b></b><p></p></div>');
      d.querySelector('b').textContent = t;
      d.querySelector('p').textContent = p;
      list.appendChild(d);
    }
  }
  openOverlay('ov-help');
  makeScroll(list);
}
