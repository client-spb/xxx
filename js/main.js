'use strict';
/* =====================================================================
   Запуск: события кнопок, ввод, игровой цикл, скрытие вкладки, SDK.
   ===================================================================== */

let lastTs = 0, rafId = 0, running = false, hudTimer = 0;

function loop(ts) {
  if (!running) return;
  rafId = requestAnimationFrame(loop);
  const dt = Math.min(0.033, (ts - lastTs) / 1000 || 0.016);
  lastTs = ts;
  if (document.hidden) return;
  if (currentScreen === 'fish') {
    if (!G.paused && !anyOverlay() && G.state === 'fish') updateFishing(dt);
    drawFishing(G.paused ? 0 : dt);
    hudTimer -= dt;
    if (hudTimer <= 0) { hudTimer = 0.08; hudRefresh(); }
  } else if (currentScreen === 'menu') {
    drawMenu(dt);
  }
}
function startLoop() { if (running) return; running = true; lastTs = performance.now(); rafId = requestAnimationFrame(loop); }

/* ---------------------------------------------------------------- кнопки */
function on(id, ev, fn) { const e = $(id); if (e) e.addEventListener(ev, fn); }
function bindUi() {
  // загрузка
  on('ld-start', 'click', () => {
    AUD.unlock();
    sfxClick();
    renderMenu();
    showScreen('menu');
    refreshMusic(true);
    if (!SAVE.tut.intro) { SAVE.tut.intro = 1; persist(); setTimeout(renderHelp, 700); }
    else if (SAVE.daily !== todayStr()) setTimeout(openDaily, 900);
  });
  // меню
  on('btnPlay', 'click', () => { sfxClick(); UI.mapSel = SAVE.lastLoc; showScreen('map'); requestAnimationFrame(renderMap); refreshMusic(); });
  on('btnTackle', 'click', () => { sfxClick(); openTackle(null, 'menu'); });
  on('btnShop', 'click', () => { sfxClick(); openShop(null, 'menu'); });
  on('btnQuests', 'click', () => { sfxClick(); renderQuests(); });
  on('btnAtlas', 'click', () => { sfxClick(); renderAtlas(); });
  on('btnAch', 'click', () => { sfxClick(); renderAch(); });
  on('btnLb', 'click', () => { sfxClick(); openLeaderboard(); });
  on('btnSound', 'click', () => toggleSound('sound'));
  on('btnMusic', 'click', () => toggleSound('music'));
  on('btnShare', 'click', () => { sfxClick(); shareText('Мой общий улов в игре «Клёвое место» — ' + fmtKg(totalScore() / 1000) + ', уровень ' + SAVE.level + '. Семь водоёмов, 35 видов рыб!'); });
  on('btnHelp', 'click', () => { sfxClick(); renderHelp(); });
  on('btnSettings', 'click', () => { sfxClick(); syncSoundButtons(); openOverlay('ov-settings'); });
  on('btnPrivacy', 'click', () => { sfxClick(); openPrivacy(); });
  on('btnGift', 'click', () => { sfxClick(); openDaily(); });
  // карта
  on('mapBack', 'click', () => { sfxClick(); renderMenu(); showScreen('menu'); });
  on('mpGo', 'click', () => goFishing(UI.mapSel));
  // HUD
  on('hudPause', 'click', () => { sfxClick(); pauseGame(); });
  on('hudKeep', 'click', () => { if (G.phase === 'fight') return; sfxClick(); openKeep(); });
  on('hudBait', 'click', () => { sfxClick(); openTackleQuick(); });
  on('hudThermos', 'click', () => {
    if (SAVE.thermos > 0) { toast('Чай ещё действует'); return; }
    if (!(SAVE.inv.thermos > 0)) return;
    SAVE.inv.thermos--; SAVE.thermos = 180;
    AUD.play('bubbles', 0.5); toast('Горячий чай! Клёв +30% на 3 минуты', 'gold');
    updateBaitHud(); persistSoon();
  });
  document.querySelectorAll('.rigb').forEach(b => b.addEventListener('click', () => switchRig(b.dataset.rig)));
  holdButton('dragMinus', () => changeDrag(-1));
  holdButton('dragPlus', () => changeDrag(1));
  holdButton('depthMinus', () => changeDepth(-1));
  holdButton('depthPlus', () => changeDepth(1));
  tiltButton('tiltL', -1);
  tiltButton('tiltR', 1);
  const act = $('actBtn');
  let actPid = null;
  act.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (actPid !== null) return;
    actPid = e.pointerId;
    try { act.setPointerCapture(actPid); } catch (_) {}
    actDown();
  });
  const actEnd = e => { if (e.pointerId !== actPid) return; actPid = null; actUp(); };
  act.addEventListener('pointerup', actEnd);
  act.addEventListener('pointercancel', actEnd);
  act.addEventListener('lostpointercapture', actEnd);
  on('secAct', 'click', secAct);
  // прицеливание касанием воды
  $('cv').addEventListener('pointerdown', e => {
    if (currentScreen !== 'fish' || G.paused || G.phase !== 'idle') return;
    const p = toGame(e);
    const hzY = computeView(CW, CH, G.L.hz).hzY;
    if (p.y < hzY + 4) return;
    const k = (p.y - hzY) / ((CH - hzY) * 1.02);
    G.aimX = clamp((p.x - CW / 2) / (CW * 0.052 * Math.max(0.12, k)), -12, 12);
    AUD.tick();
  });
  // пауза
  on('pzResume', 'click', () => { sfxClick(); resumeGame(); });
  on('pzTackle', 'click', () => {
    if (G.phase !== 'idle') { toast('Сначала смотай снасть'); return; }
    sfxClick(); G.paused = true; openTackle(G.rigType, 'fish');
  });
  on('pzKeep', 'click', () => { sfxClick(); closeOverlay('ov-pause'); G.paused = false; lastTs = performance.now(); refreshMusic(true); openKeep(); });
  on('pzHelp', 'click', () => { sfxClick(); closeOverlay('ov-pause'); G.paused = false; lastTs = performance.now(); refreshMusic(true); renderHelp(); });
  on('pzLeave', 'click', () => {
    sfxClick();
    askConfirm('Уехать с водоёма?', 'Улов из садка будет продан скупщику автоматически.', 'Уехать', () => { leaveSession(); });
  });
  on('pzMenu', 'click', () => {
    sfxClick();
    askConfirm('Выйти в меню?', 'Поездка завершится, улов из садка будет продан.', 'Выйти', () => { leaveSession(); });
  });
  on('pzSound', 'click', () => toggleSound('sound'));
  on('pzMusic', 'click', () => toggleSound('music'));
  on('pzAmb', 'click', () => toggleSound('amb'));
  // улов
  on('ctKeep', 'click', () => { sfxClick(); finishCatch('keep'); });
  on('ctRelease', 'click', () => { sfxClick(); finishCatch('release'); });
  on('ctShare', 'click', () => { sfxClick(); shareCatch(UI.catchData); });
  on('kpSell', 'click', () => { sfxClick(); sellKeepnet(false); openKeep(); });
  // итоги
  on('smMenu', 'click', () => { sfxClick(); exitToMenu(); });
  on('smMap', 'click', () => { sfxClick(); stopFishingAudio(); G.state = 'menu'; closeAllOverlays(); showScreen('map'); requestAnimationFrame(renderMap); refreshMusic(true); flushPopups(); });
  on('smShare', 'click', () => { sfxClick(); shareTrip(); });
  // подтверждение
  on('cf-no', 'click', () => { sfxClick(); confirmCb = null; closeOv('ov-confirm'); });
  on('cf-ok', 'click', () => { sfxClick(); const cb = confirmCb; confirmCb = null; closeOverlay('ov-confirm'); if (cb) cb(); flushPopups(); });
  // уровень / подарок
  on('lvOk', 'click', () => { sfxClick(); closeOv('ov-level'); });
  on('dlOk', 'click', () => { sfxClick(); claimDaily(); });
  // настройки
  on('stSound', 'click', () => toggleSound('sound'));
  on('stMusic', 'click', () => toggleSound('music'));
  on('stAmb', 'click', () => toggleSound('amb'));
  on('stPrivacy', 'click', () => { sfxClick(); openPrivacy(); });
  on('stReset', 'click', () => {
    sfxClick();
    askConfirm('Сбросить прогресс?', 'Уровень, деньги, снасти и улов будут удалены безвозвратно.', 'Сбросить', () => {
      const keep = { sound: SAVE.sound, music: SAVE.music, amb: SAVE.amb };
      SAVE = defaultSave();
      Object.assign(SAVE, keep);
      SAVE.tut.intro = 1;
      persist();
      renderMenu();
      toast('Прогресс сброшен');
    });
  });
  // магазин / снасти
  on('shopBack', 'click', shopBack);
  on('tackleBack', 'click', tackleBack);
  on('tackleShop', 'click', () => { sfxClick(); UI.tackleFromSaved = UI.tackleFrom; openShop(null, 'tackle'); });
  document.querySelectorAll('#tackleTabs .tab').forEach(b => b.addEventListener('click', () => { sfxClick(); UI.tackleRig = b.dataset.rig; UI.tackleSlot = 'rod'; renderTackle(); }));
  // закрытие окон
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => { sfxClick(); closeOv(b.dataset.close); if (b.dataset.close === 'ov-quests') renderMenu(); }));
  // прокрутка списков
  ['lb-list', 'kpList', 'atList', 'achList', 'helpList', 'qList', 'lvUnl', 'btList', 'shopList', 'tkPick', 'tkSlots'].forEach(id => makeScroll($(id)));
}
function holdButton(id, fn) {
  const b = $(id);
  let t1 = 0, t2 = 0;
  const stop = () => { clearTimeout(t1); clearInterval(t2); };
  b.addEventListener('pointerdown', e => {
    e.preventDefault();
    fn();
    stop();
    t1 = setTimeout(() => { t2 = setInterval(fn, 90); }, 380);
  });
  b.addEventListener('pointerup', stop);
  b.addEventListener('pointercancel', stop);
  b.addEventListener('pointerleave', stop);
}
function tiltButton(id, dir) {
  const b = $(id);
  let pid = null;
  b.addEventListener('pointerdown', e => {
    e.preventDefault();
    pid = e.pointerId;
    try { b.setPointerCapture(pid); } catch (_) {}
    G.tilt = dir; b.classList.add('on');
  });
  const end = e => { if (e.pointerId !== pid) return; pid = null; if (G.tilt === dir) G.tilt = 0; b.classList.remove('on'); };
  b.addEventListener('pointerup', end);
  b.addEventListener('pointercancel', end);
}

/* ---------------------------------------------------------------- клавиатура */
const keysDown = {};
document.addEventListener('keydown', e => {
  if (currentScreen !== 'fish') return;
  const k = e.code;
  if (keysDown[k]) { if (k === 'Space') e.preventDefault(); return; }
  keysDown[k] = true;
  if (k === 'Escape' || k === 'KeyP') { if (G.paused) resumeGame(); else pauseGame(); return; }
  if (G.paused || anyOverlay()) return;
  if (k === 'Space' || k === 'Enter') { e.preventDefault(); actDown(); }
  else if (k === 'ArrowLeft' || k === 'KeyA') { G.tilt = -1; $('tiltL').classList.add('on'); }
  else if (k === 'ArrowRight' || k === 'KeyD') { G.tilt = 1; $('tiltR').classList.add('on'); }
  else if (k === 'ArrowUp' || k === 'KeyW' || k === 'Equal' || k === 'NumpadAdd') changeDrag(1);
  else if (k === 'ArrowDown' || k === 'KeyS' || k === 'Minus' || k === 'NumpadSubtract') changeDrag(-1);
  else if (k === 'KeyR') secAct();
  else if (k === 'Digit1') switchRig('float');
  else if (k === 'Digit2') switchRig('feeder');
  else if (k === 'Digit3') switchRig('spin');
});
document.addEventListener('keyup', e => {
  const k = e.code;
  keysDown[k] = false;
  if (currentScreen !== 'fish') return;
  if (k === 'Space' || k === 'Enter') actUp();
  else if ((k === 'ArrowLeft' || k === 'KeyA') && G.tilt === -1) { G.tilt = 0; $('tiltL').classList.remove('on'); }
  else if ((k === 'ArrowRight' || k === 'KeyD') && G.tilt === 1) { G.tilt = 0; $('tiltR').classList.remove('on'); }
});

/* ---------------------------------------------------------------- скрытие вкладки */
function onHide() {
  for (const k in keysDown) keysDown[k] = false;
  if (currentScreen === 'fish') pauseGame();
  AUD.suspend();
  persist();
}
function onShow() {
  if (document.hidden) return;
  if (!ASSETS.ready) return;
  AUD.resume();
  lastTs = performance.now();
  if (currentScreen !== 'fish') refreshMusic();
}
document.addEventListener('visibilitychange', () => { if (document.hidden) onHide(); else onShow(); });
window.addEventListener('pagehide', onHide);
window.addEventListener('blur', onHide);
window.addEventListener('focus', onShow);

/* ---------------------------------------------------------------- старт */
loadSave();
layoutApp();
bindUi();
maxInit();
startLoop();
runLoader(() => {
  // текстуры интерфейса из загруженных blob-ссылок
  const rs = document.documentElement.style;
  const set = (v, p) => { const u = ASSETS.url(p); if (u) rs.setProperty(v, 'url(' + u + ')'); };
  set('--wood-img', 'assets/ui/wood.jpg');
  set('--wood-dark-img', 'assets/ui/wood_dark.jpg');
  set('--paper-img', 'assets/ui/paper.jpg');
  set('--map-img', 'assets/ui/map.jpg');
  ASSETS.ensure(['day', 'evening', 'night'].map(t => bgPath('lake', t)));
  ensureQuests();
  checkAch();
  window.onFitHook = () => { if (currentScreen === 'map') renderMap(); };
});
if (window.GameSDK && GameSDK.init) {
  try {
    GameSDK.init(GAME_NAME, function () {
      console.log('[Game] GameSDK инициализирован для игры:', GAME_NAME);
      if (ASSETS.ready) renderMenu();
      submitScore();
    });
  } catch (e) { console.warn('[Game] GameSDK init error:', e); }
}
