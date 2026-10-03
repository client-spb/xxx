'use strict';
/* =====================================================================
   Звук: Web Audio API. Короткие эффекты — декодированные буферы,
   музыка и атмосфера — потоковые <audio> через MediaElementSource,
   интерфейсные щелчки и фанфары — синтез.
   ===================================================================== */

const AUD = (() => {
  let ctx = null, master = null, sfxBus = null, musBus = null, ambBus = null, noiseBuf = null;
  const buffers = {};
  const pendingDecode = {};
  const loops = {};
  const media = { music: null, amb: null };
  let musicName = '', ambName = '';
  let unlocked = false;

  function audio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      master = ctx.createGain(); master.gain.value = 0.95;
      master.connect(comp); comp.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.connect(master);
      musBus = ctx.createGain(); musBus.gain.value = 0.55; musBus.connect(master);
      ambBus = ctx.createGain(); ambBus.gain.value = 0.7; ambBus.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      applyVolumes();
    }
    if (ctx.state === 'suspended' && !document.hidden && unlocked) { try { ctx.resume(); } catch (e) {} }
    return ctx;
  }

  function applyVolumes() {
    if (!ctx) return;
    const t = ctx.currentTime;
    sfxBus.gain.setTargetAtTime(SAVE.sound ? 1 : 0, t, 0.05);
    musBus.gain.setTargetAtTime(SAVE.music ? 0.42 : 0, t, 0.2);
    ambBus.gain.setTargetAtTime(SAVE.amb ? 0.75 : 0, t, 0.2);
    for (const k in media) {
      const m = media[k];
      if (m && !m.node) m.el.volume = (k === 'music' ? (SAVE.music ? 0.5 : 0) : (SAVE.amb ? 0.75 : 0)) * m.vol;
    }
  }

  /* ---------- декодирование буферов из загрузчика ---------- */
  function decode(name, arrayBuf) {
    const ac = audio();
    if (!ac || !arrayBuf) return Promise.resolve(false);
    if (pendingDecode[name]) return pendingDecode[name];
    const p = new Promise(res => {
      try {
        const copy = arrayBuf.slice(0);
        const done = b => { buffers[name] = b; res(true); };
        const fail = () => res(false);
        const r = ac.decodeAudioData(copy, done, fail);
        if (r && r.then) r.then(done, fail);
      } catch (e) { res(false); }
    });
    pendingDecode[name] = p;
    return p;
  }

  function play(name, vol, rate, pan) {
    const ac = audio();
    if (!ac || !SAVE.sound || !buffers[name] || document.hidden) return;
    try {
      const s = ac.createBufferSource();
      s.buffer = buffers[name];
      s.playbackRate.value = rate || 1;
      const g = ac.createGain(); g.gain.value = vol == null ? 1 : vol;
      if (pan && ac.createStereoPanner) {
        const p = ac.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
        s.connect(g); g.connect(p); p.connect(sfxBus);
      } else { s.connect(g); g.connect(sfxBus); }
      s.start();
    } catch (e) {}
  }

  /* постоянные петли: катушка, фрикцион */
  function loop(name, on, vol, rate) {
    const ac = audio();
    if (!ac || !buffers[name]) return;
    let L = loops[name];
    if (on && SAVE.sound && !document.hidden) {
      if (!L) {
        try {
          const s = ac.createBufferSource();
          s.buffer = buffers[name]; s.loop = true;
          const g = ac.createGain(); g.gain.value = 0;
          s.connect(g); g.connect(sfxBus); s.start();
          L = loops[name] = { s, g };
        } catch (e) { return; }
      }
      L.g.gain.setTargetAtTime(vol == null ? 0.6 : vol, ac.currentTime, 0.03);
      if (rate) L.s.playbackRate.setTargetAtTime(rate, ac.currentTime, 0.05);
    } else if (L) {
      L.g.gain.setTargetAtTime(0, ac.currentTime, 0.04);
      const ref = L;
      delete loops[name];
      setTimeout(() => { try { ref.s.stop(); } catch (e) {} }, 300);
    }
  }
  function stopLoops() { for (const k in loops) loop(k, false); }

  /* ---------- синтез ---------- */
  function tone(freq, dur, type, vol, delay, slide) {
    const ac = audio();
    if (!ac || !SAVE.sound || document.hidden) return;
    try {
      const t = ac.currentTime + (delay || 0);
      const osc = ac.createOscillator(), gain = ac.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain); gain.connect(sfxBus);
      osc.start(t); osc.stop(t + dur + 0.05);
    } catch (e) {}
  }
  function noise(dur, vol, cutoff, delay, type) {
    const ac = audio();
    if (!ac || !SAVE.sound || document.hidden) return;
    try {
      const t = ac.currentTime + (delay || 0);
      const s = ac.createBufferSource(); s.buffer = noiseBuf;
      const f = ac.createBiquadFilter(); f.type = type || 'lowpass';
      f.frequency.setValueAtTime(cutoff, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(60, cutoff * 0.25), t + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(sfxBus);
      s.start(t); s.stop(t + dur + 0.05);
    } catch (e) {}
  }

  /* ---------- музыка и атмосфера ---------- */
  function makeMedia(kind, url, vol) {
    const ac = audio();
    const el = new Audio();
    el.src = url; el.loop = true; el.preload = 'auto';
    const m = { el, vol, node: null, gain: null };
    if (ac && ac.createMediaElementSource) {
      try {
        const src = ac.createMediaElementSource(el);
        const g = ac.createGain(); g.gain.value = 0;
        src.connect(g); g.connect(kind === 'music' ? musBus : ambBus);
        m.node = src; m.gain = g;
      } catch (e) { m.node = null; }
    }
    if (!m.node) el.volume = 0;
    return m;
  }
  function fadeOut(m, time) {
    if (!m) return;
    const ac = audio();
    if (m.gain && ac) {
      m.gain.gain.setTargetAtTime(0, ac.currentTime, time / 3);
    } else {
      const start = m.el.volume;
      const t0 = performance.now();
      const step = () => {
        const k = 1 - (performance.now() - t0) / (time * 1000);
        m.el.volume = Math.max(0, start * k);
        if (k > 0) requestAnimationFrame(step);
      };
      step();
    }
    setTimeout(() => { try { m.el.pause(); m.el.src = ''; m.el.removeAttribute('src'); } catch (e) {} }, time * 1000 + 300);
  }
  function fadeIn(kind, m, time) {
    const ac = audio();
    if (m.gain && ac) {
      m.gain.gain.setValueAtTime(0.0001, ac.currentTime);
      m.gain.gain.setTargetAtTime(m.vol, ac.currentTime, time / 3);
    } else {
      const target = () => (kind === 'music' ? (SAVE.music ? 0.5 : 0) : (SAVE.amb ? 0.75 : 0)) * m.vol;
      const t0 = performance.now();
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / (time * 1000));
        m.el.volume = target() * k;
        if (k < 1) requestAnimationFrame(step);
      };
      step();
    }
  }
  function setTrack(kind, name, vol) {
    const cur = kind === 'music' ? musicName : ambName;
    if (cur === name && media[kind] && !media[kind].el.paused) return;
    if (media[kind]) { fadeOut(media[kind], 1.6); media[kind] = null; }
    if (kind === 'music') musicName = name; else ambName = name;
    if (!name) return;
    const url = ASSETS.url(kind === 'music' ? 'assets/music/' + name + '.mp3' : 'assets/amb/' + name + '.mp3');
    if (!url) return;
    const m = makeMedia(kind, url, vol == null ? 1 : vol);
    media[kind] = m;
    if (document.hidden || !unlocked) return;
    const p = m.el.play();
    if (p && p.catch) p.catch(() => {});
    fadeIn(kind, m, 1.8);
  }
  function music(name) { setTrack('music', name, 1); }
  function amb(name) { setTrack('amb', name, 1); }
  function stopMusic() { if (media.music) { fadeOut(media.music, 0.8); media.music = null; } musicName = ''; }
  function stopAmb() { if (media.amb) { fadeOut(media.amb, 0.8); media.amb = null; } ambName = ''; }

  function pauseMedia() {
    for (const k in media) { const m = media[k]; if (m) try { m.el.pause(); } catch (e) {} }
  }
  function resumeMedia() {
    if (document.hidden || !unlocked) return;
    for (const k in media) {
      const m = media[k];
      if (m && m.el.paused) {
        const p = m.el.play(); if (p && p.catch) p.catch(() => {});
        fadeIn(k, m, 1.2);
      }
    }
  }

  return {
    ctx: audio, decode, play, loop, stopLoops, tone, noise, music, amb, stopMusic, stopAmb, applyVolumes,
    hasBuf: name => !!buffers[name],
    unlock() {
      unlocked = true;
      const ac = audio();
      if (ac && ac.state === 'suspended') { try { ac.resume(); } catch (e) {} }
      resumeMedia();
    },
    suspend() {
      stopLoops(); pauseMedia();
      try { if (ctx && ctx.state === 'running') ctx.suspend(); } catch (e) {}
    },
    resume() {
      try { if (ctx && ctx.state === 'suspended' && unlocked) ctx.resume(); } catch (e) {}
      resumeMedia();
    },
    click() { if (buffers.click) play('click', 0.5, rand(0.95, 1.05)); else tone(900, 0.05, 'sine', 0.06); },
    tick() { tone(1500, 0.03, 'triangle', 0.04); },
    error() { if (buffers.error) play('error', 0.5); else tone(160, 0.25, 'square', 0.06); },
    coin() { if (buffers.coin) play('coin', 0.55, rand(0.95, 1.08)); },
    buy() { if (buffers.buy) play('buy', 0.6); else { tone(880, 0.1, 'triangle', 0.1); tone(1320, 0.2, 'triangle', 0.1, 0.08); } },
    win() {
      [523, 659, 784, 1047].forEach((f, i) => { tone(f, 0.22, 'triangle', 0.12, i * 0.11); tone(f / 2, 0.25, 'sine', 0.08, i * 0.11); });
      [523, 659, 784, 1047].forEach(f => tone(f, 1.4, 'sawtooth', 0.025, 0.5));
      tone(65, 1.4, 'sine', 0.2, 0.5); noise(0.5, 0.06, 6000, 0.5);
    },
    lose() {
      [330, 311, 262, 208].forEach((f, i) => { tone(f, 0.3, 'sawtooth', 0.07, i * 0.22); tone(f / 2, 0.35, 'triangle', 0.07, i * 0.22); });
      [131, 156, 196].forEach(f => tone(f, 1.6, 'sawtooth', 0.03, 0.95));
      tone(49, 1.8, 'sine', 0.2, 0.95); noise(0.9, 0.07, 800, 0.95);
    },
    jingle(name, fallback) { if (buffers[name]) play(name, 0.85); else if (fallback) fallback(); },
  };
})();
document.addEventListener('pointerdown', () => { if (ASSETS.ready) AUD.unlock(); }, true);
