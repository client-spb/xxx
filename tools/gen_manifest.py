"""Builds js/manifest.js — the list of every asset the loader must fetch before the game starts."""
import os, json
ROOT = os.path.join(os.path.dirname(__file__), '..')
CYR = 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116'
LAT = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD'
out = []
def add(path, t, **kw):
    full = os.path.join(ROOT, path)
    d = {'p': path, 's': os.path.getsize(full), 't': t}
    d.update(kw)
    out.append(d)
for f in sorted(os.listdir(os.path.join(ROOT, 'assets/fonts'))):
    fam, sub = f[:-6].split('-')
    add('assets/fonts/' + f, 'font', family=fam, range=CYR if sub == 'cyrillic' else LAT, weight='300 900' if fam == 'Rubik' else 'normal')
for d, t in (('ui', 'icon'), ('items', 'icon'), ('fish', 'fish'), ('bg', 'img'), ('music', 'media'), ('amb', 'media')):
    for f in sorted(os.listdir(os.path.join(ROOT, 'assets', d))):
        add('assets/%s/%s' % (d, f), t)
for f in sorted(os.listdir(os.path.join(ROOT, 'assets/sfx'))):
    add('assets/sfx/' + f, 'sfx', name=f[:-4])
total = sum(x['s'] for x in out)
with open(os.path.join(ROOT, 'js/manifest.js'), 'w') as fh:
    fh.write("'use strict';\n/* Автоматически собранный список ресурсов (tools/gen_manifest.py). Всего: %.1f МБ, файлов: %d */\nconst MANIFEST = [\n" % (total / 1048576, len(out)))
    for x in out:
        fh.write('  ' + json.dumps(x, ensure_ascii=False) + ',\n')
    fh.write('];\n')
print(len(out), 'files', round(total / 1048576, 2), 'MB')
