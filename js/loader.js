'use strict';
/* =====================================================================
   Загрузчик: качает ВСЕ ресурсы игры с полосой прогресса по байтам.
   Пока всё не загружено, игра не запускается.
   ===================================================================== */

const ASSETS = (() => {
  const urls = {};      // путь -> blob: URL (или исходный путь при работе с file://)
  const imgs = {};      // путь -> Image
  let ready = false;
  const TIPS = [
    'Лещ любит глубину и прикормку — попробуй фидер на закате.',
    'Чем тоньше леска, тем смелее клюёт осторожная рыба.',
    'Наклоняй удилище против хода рыбы, чтобы быстрее её утомить.',
    'Не затягивай фрикцион сильнее прочности лески!',
    'Пузыри на воде выдают кормящегося карпа.',
    'Ночью просыпаются сом, налим и судак.',
    'Падающее давление перед дождём — лучший клёв.',
    'Краснокнижную рыбу нужно отпускать — рыбнадзор выдаст премию.',
    'Каждый день в ящике рыбака ждёт подарок.',
    'Говорят, в деревенском пруду живёт золотая рыбка…',
  ];

  function url(p) { return urls[p] || null; }
  function img(p) {
    if (imgs[p]) return imgs[p];
    const u = urls[p] || p;
    const im = new Image();
    im.decoding = 'async';
    im.src = u;
    imgs[p] = im;
    return im;
  }
  function ensure(paths) {
    return Promise.all(paths.map(p => {
      const im = img(p);
      if (im.complete && im.naturalWidth) return Promise.resolve(im);
      return new Promise(res => {
        const done = () => res(im);
        im.addEventListener('load', done, { once: true });
        im.addEventListener('error', done, { once: true });
        setTimeout(done, 6000);
      });
    }));
  }

  function xhr(path, type, onProgress) {
    return new Promise((res, rej) => {
      try {
        const x = new XMLHttpRequest();
        x.open('GET', path, true);
        x.responseType = type;
        x.onprogress = e => onProgress(e.loaded);
        x.onload = () => {
          if ((x.status === 200 || x.status === 0) && x.response) res(x.response);
          else rej(new Error('status ' + x.status));
        };
        x.onerror = () => rej(new Error('net'));
        x.ontimeout = () => rej(new Error('timeout'));
        x.timeout = 60000;
        x.send();
      } catch (e) { rej(e); }
    });
  }

  function loadAll(onProgress) {
    const list = MANIFEST.slice();
    const total = list.reduce((a, f) => a + f.s, 0);
    const got = new Array(list.length).fill(0);
    let done = 0, failed = 0;
    const report = (label) => {
      let sum = 0; for (let i = 0; i < got.length; i++) sum += got[i];
      onProgress(Math.min(1, sum / total), sum, total, done, list.length, label);
    };
    const labels = { img: 'Рисуем водоёмы', fish: 'Выпускаем рыбу', icon: 'Раскладываем снасти', media: 'Настраиваем музыку', sfx: 'Записываем звуки', font: 'Подписываем таблички' };

    async function one(i, attempt) {
      const f = list[i];
      const kind = f.t;
      const label = labels[kind] || 'Загрузка';
      try {
        if (kind === 'font') {
          const resp = await xhr(f.p, 'arraybuffer', l => { got[i] = Math.min(l, f.s); report(label); });
          try {
            const ff = new FontFace(f.family, resp, { weight: f.weight || 'normal', unicodeRange: f.range || undefined });
            await ff.load(); document.fonts.add(ff);
          } catch (e) {}
        } else if (kind === 'sfx') {
          const resp = await xhr(f.p, 'arraybuffer', l => { got[i] = Math.min(l, f.s); report(label); });
          await AUD.decode(f.name, resp);
        } else {
          const resp = await xhr(f.p, 'blob', l => { got[i] = Math.min(l, f.s); report(label); });
          urls[f.p] = URL.createObjectURL(resp);
          if (kind === 'icon') await ensure([f.p]);
        }
      } catch (e) {
        if (attempt < 1) return one(i, attempt + 1);
        // запасной путь (например, при открытии через file://): ссылка на сам файл
        failed++;
        if (kind === 'font') {
          try { const ff = new FontFace(f.family, 'url(' + f.p + ')', { weight: f.weight || 'normal' }); await ff.load(); document.fonts.add(ff); } catch (e2) {}
        } else if (kind !== 'sfx') {
          urls[f.p] = f.p;
          if (kind === 'icon' || kind === 'img') await ensure([f.p]);
        }
      }
      got[i] = f.s; done++;
      report(label);
    }

    return new Promise(resolve => {
      let next = 0, active = 0;
      const CONC = 6;
      const pump = () => {
        while (active < CONC && next < list.length) {
          const i = next++;
          active++;
          one(i, 0).then(() => {
            active--;
            if (done >= list.length) { ready = true; resolve(failed); }
            else pump();
          });
        }
      };
      // сначала шрифты и иконки — они нужны интерфейсу
      list.sort((a, b) => (order(a.t) - order(b.t)));
      pump();
    });
  }
  function order(t) { return { font: 0, icon: 1, sfx: 2, fish: 3, img: 4, media: 5 }[t] || 9; }

  return { url, img, ensure, loadAll, TIPS, get ready() { return ready; } };
})();

/* ---------- экран загрузки ---------- */
function runLoader(onDone) {
  const bar = $('ld-fill'), pct = $('ld-pct'), info = $('ld-info'), tip = $('ld-tip'), lbl = $('ld-label');
  let tipI = Math.floor(Math.random() * ASSETS.TIPS.length);
  tip.textContent = ASSETS.TIPS[tipI];
  const tipTimer = setInterval(() => {
    tipI = (tipI + 1) % ASSETS.TIPS.length;
    tip.classList.remove('in'); void tip.offsetWidth;
    tip.textContent = ASSETS.TIPS[tipI]; tip.classList.add('in');
  }, 3200);
  let shown = 0, target = 0;
  const anim = () => {
    shown += (target - shown) * 0.15;
    bar.style.width = (shown * 100).toFixed(2) + '%';
    $('ld-float').style.left = (shown * 100).toFixed(2) + '%';
    pct.textContent = Math.floor(shown * 100) + '%';
    if (!ASSETS.ready || shown < 0.995) requestAnimationFrame(anim);
    else { bar.style.width = '100%'; pct.textContent = '100%'; }
  };
  requestAnimationFrame(anim);
  ASSETS.loadAll((p, b, tot, d, n, label) => {
    target = p;
    info.textContent = (b / 1048576).toFixed(1).replace('.', ',') + ' из ' + (tot / 1048576).toFixed(1).replace('.', ',') + ' МБ · файлов ' + d + '/' + n;
    lbl.textContent = label + '…';
  }).then(failed => {
    target = 1;
    clearInterval(tipTimer);
    setTimeout(() => {
      lbl.textContent = failed ? 'Готово (часть файлов взята напрямую)' : 'Всё готово — рыба ждёт!';
      $('ld-start').classList.add('show');
      $('ld-bar').classList.add('done');
      onDone();
    }, 500);
  });
}
