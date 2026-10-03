"""Procedural painted backgrounds for every fishing location in three times of day.
Output: assets/bg/<loc>_<tod>.jpg (1920x1080)."""
import os, math, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from common import *

W, H = 1920, 1080
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'bg')
os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- lighting
TODS = {
    'day': dict(sky=[(0, '#2f6fb8'), (0.55, '#79b3df'), (1, '#d7ebf3')], light=1.0, tint='#fff6e8',
                amb=0.30, sun=(0.80, 0.16), sunc='#fffbe8', sunr=46, glow=0.35, haze='#c7dcea', star=0),
    'evening': dict(sky=[(0, '#26285a'), (0.35, '#6b4a86'), (0.7, '#e0796a'), (1, '#ffc27a')], light=0.62,
                    tint='#ffb27a', amb=0.22, sun=(0.70, 0.86), sunc='#fff0b0', sunr=58, glow=0.9,
                    haze='#f2a57a', star=0.15),
    'night': dict(sky=[(0, '#030716'), (0.6, '#0b1a36'), (1, '#1e3352')], light=0.20, tint='#9fb6ff',
                  amb=0.16, sun=(0.24, 0.18), sunc='#f4f1dc', sunr=34, glow=0.4, haze='#22385a', star=1.0),
}

LOCS = {
    'pond': dict(hz=0.50, seed=11, water='#3e6e5c', far='hills', farc='#5f8a52', trees=['mixed', 'mixed'],
                 treec='#3f6b34', house=True, fg='reeds', lilies=0.6, clouds=0.55),
    'river': dict(hz=0.47, seed=23, water='#3b6672', far='forest', farc='#4d7357', trees=['pine', 'pine'],
                  treec='#2c4f35', fg='grass', clouds=0.45, current=True),
    'lake': dict(hz=0.52, seed=37, water='#3a6d8c', far='blue', farc='#6f8fae', trees=['birch', 'mixed'],
                 treec='#4b7a3d', islands=True, fg='grass', clouds=0.6, boat=True),
    'swamp': dict(hz=0.54, seed=41, water='#3f5640', far='none', farc='#56664f', trees=['dead', 'mixed'],
                  treec='#3e5233', fg='cattails', lilies=1.0, fog=0.75, clouds=0.75),
    'mountain': dict(hz=0.57, seed=53, water='#4d8a8f', far='peaks', farc='#7c8a9e', trees=['pine', 'pine'],
                     treec='#2d4a37', fg='rocks', rocks=True, rapids=True, clouds=0.4),
    'volga': dict(hz=0.50, seed=67, water='#4f6f7c', far='cliffs', farc='#c9a46f', trees=['poplar', 'mixed'],
                  treec='#4f7438', church=True, fg='sand', clouds=0.5, wide=True),
    'north': dict(hz=0.53, seed=79, water='#2f5468', far='granite', farc='#7d8790', trees=['pine', 'pine'],
                  treec='#26432f', fg='granite', aurora=True, clouds=0.35, granite_isles=True),
}


def light_color(base, tod, haze_amt=0.0, shade=1.0):
    t = TODS[tod]
    c = col(base) / 255.0
    tint = col(t['tint']) / 255.0
    lit = c * (t['light'] * shade) * (0.6 + 0.4 * tint) + c * t['amb'] * 0.35
    hz = col(t['haze']) / 255.0
    lit = lit * (1 - haze_amt) + hz * haze_amt * (0.9 if tod != 'night' else 0.7)
    return lit * 255.0


# ------------------------------------------------------------- shapes
def pine_poly(x, base, h, w, r):
    pts_l, pts_r = [], []
    tiers = int(6 + h / 40)
    for i in range(tiers + 1):
        t = i / tiers
        y = base - h + t * h * 0.92
        ww = w * (0.08 + 0.92 * t) * (0.75 + 0.25 * ((i % 2) == 0)) * (0.9 + 0.2 * r.random())
        pts_l.append((x - ww / 2, y))
        pts_r.append((x + ww / 2, y))
        if i < tiers:
            yy = y + h * 0.92 / tiers * 0.65
            ww2 = ww * 0.55
            pts_l.append((x - ww2 / 2, yy))
            pts_r.append((x + ww2 / 2, yy))
    return [(x, base - h - h * 0.04)] + pts_r + [(x + w * 0.05, base), (x - w * 0.05, base)] + pts_l[::-1]


def draw_tree(d, kind, x, base, h, r, ss, fill=255):
    x *= ss; base *= ss; h *= ss
    if kind == 'pine':
        w = h * (0.32 + 0.1 * r.random())
        d.polygon(pine_poly(x, base, h, w, r), fill=fill)
    elif kind in ('mixed', 'birch'):
        trunk = h * 0.06
        d.rectangle([x - trunk / 2, base - h * 0.5, x + trunk / 2, base], fill=fill)
        n = 7 + int(r.random() * 6)
        for _ in range(n):
            cx = x + (r.random() - 0.5) * h * 0.55
            cy = base - h * 0.55 - (r.random() - 0.3) * h * 0.35
            rr = h * (0.13 + 0.12 * r.random())
            d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr * 0.9], fill=fill)
    elif kind == 'poplar':
        trunk = h * 0.04
        d.rectangle([x - trunk / 2, base - h * 0.3, x + trunk / 2, base], fill=fill)
        for _ in range(9):
            cx = x + (r.random() - 0.5) * h * 0.14
            cy = base - h * (0.25 + 0.65 * r.random())
            rr = h * (0.08 + 0.05 * r.random())
            d.ellipse([cx - rr * 0.8, cy - rr * 1.6, cx + rr * 0.8, cy + rr * 1.6], fill=fill)
    elif kind == 'dead':
        def branch(x0, y0, ang, ln, wd, depth):
            x1 = x0 + math.cos(ang) * ln
            y1 = y0 - math.sin(ang) * ln
            d.line([(x0, y0), (x1, y1)], fill=fill, width=max(1, int(wd)))
            if depth > 0:
                for k in range(2):
                    branch(x1, y1, ang + (r.random() - 0.5) * 1.3, ln * (0.55 + 0.2 * r.random()), wd * 0.6, depth - 1)
        branch(x, base, math.pi / 2 + (r.random() - 0.5) * 0.3, h * 0.45, h * 0.05, 4)


def treeline_mask(kind, ybase, count, hmin, hmax, r, jitter=10, ss=2, x0=-40, x1=W + 40, gaps=None):
    def fn(d, s):
        xs = np.sort(r.uniform(x0, x1, count))
        for x in xs:
            if gaps and any(a < x < b for a, b in gaps):
                continue
            k = kind
            if kind == 'birch' and r.random() < 0.4:
                k = 'mixed'
            if kind == 'mixed' and r.random() < 0.25:
                k = 'pine'
            hh = r.uniform(hmin, hmax)
            draw_tree(d, k, x, ybase(x) + r.uniform(0, jitter), hh, r, s)
        # ground strip under trees
        pts = [(x * s, (ybase(x) + jitter) * s) for x in range(-10, W + 20, 20)]
        pts += [(W * s + 20, H * s), (-20, H * s)]
        d.polygon(pts, fill=255)
    return mask_from_draw(W, H, fn, ss)


# ------------------------------------------------------------- render
def render(loc, tod):
    L = LOCS[loc]
    T = TODS[tod]
    r = rng(L['seed'])
    hz = int(H * L['hz'])
    ys = np.linspace(0, 1, H)[:, None]
    xs = np.linspace(0, 1, W)[None, :]

    # sky (only above horizon matters; render full)
    stops = [(p * L['hz'], col(c)) for p, c in T['sky']]
    stops.append((1.0, col(T['sky'][-1][1])))
    img = vgrad(H, W, stops)

    # stars & milky way
    if T['star'] > 0:
        rs = rng(L['seed'] + 999)
        mw = fbm(W, H, 6, 5, rs) * np.exp(-((ys * 1.6 - xs * 0.9 - 0.05) ** 2) / 0.02)
        img += (mw[..., None] * np.array([90, 95, 130]) * T['star'] * 0.9)
        n = int(2400 * T['star'])
        sx = rs.integers(0, W, n); sy = (rs.random(n) ** 1.5 * hz * 0.95).astype(int)
        br = rs.random(n) ** 3
        for x, y, b in zip(sx, sy, br):
            v = 120 + 135 * b
            img[y, x] = np.maximum(img[y, x], [v, v, v * 1.05])
            if b > 0.75 and 1 < x < W - 2 and 1 < y < H - 2:
                img[y - 1:y + 2, x] = np.maximum(img[y - 1:y + 2, x], v * 0.6)
                img[y, x - 1:x + 2] = np.maximum(img[y, x - 1:x + 2], v * 0.6)

    # aurora
    if L.get('aurora') and tod == 'night':
        ra = rng(5)
        band = fbm1d(W, 4, 4, ra) * 0.25 + 0.12
        curtain = fbm(W, H, 40, 3, ra, aspect=0.02)
        yy = ys * H * np.ones((1, W))
        top = band[None, :] * H
        a = np.exp(-((yy - top - 120) / 120) ** 2) * (yy > top) * curtain ** 1.5
        a += np.exp(-((yy - top) / 30) ** 2) * 0.5 * curtain
        a = np.clip(a * 1.6, 0, 1) * (yy < hz)
        green = np.array([60, 255, 160]); pink = np.array([200, 90, 220])
        img = img + a[..., None] * (green * 0.85) + (a * np.clip((top - yy + 200) / 200, 0, 1))[..., None] * pink * 0.3

    # sun / moon glow
    sx, sy = T['sun']
    sxp, syp = sx * W, sy * hz
    d2 = np.sqrt((xs * W - sxp) ** 2 + (ys * H - syp) ** 2)
    glow = np.exp(-d2 / (220 + 260 * (tod == 'evening'))) * T['glow']
    img = img + glow[..., None] * col(T['sunc']) * 0.8
    disc = smoothstep(T['sunr'] + 1.5, T['sunr'] - 1.5, d2)
    sunc = col(T['sunc'])
    if tod == 'night':
        crater = fbm(W, H, 60, 3, rng(3))
        sunc_arr = sunc[None, None, :] * (0.8 + 0.25 * crater[..., None])
        img = blend(img, sunc_arr, disc)
    else:
        img = blend(img, sunc, disc * (1.0 if tod == 'day' else 0.95))

    # clouds
    rc = rng(L['seed'] + 5)
    cn = fbm(W, H, 4, 6, rc, aspect=2.6)
    cdens = L.get('clouds', 0.5)
    cm = smoothstep(0.62 - cdens * 0.18, 0.8 - cdens * 0.1, cn) * (ys < L['hz']) * smoothstep(L['hz'] * 1.0, L['hz'] * 0.55, ys)
    cshade = fbm(W, H, 4, 6, rng(L['seed'] + 5), aspect=2.6)  # same noise
    cn2 = np.roll(cshade, -10, axis=0)
    lit = np.clip((cn - cn2) * 6 + 0.6, 0, 1)
    if tod == 'day':
        ccol = lerp(col('#9aa9bd'), col('#ffffff'), lit[..., None])
    elif tod == 'evening':
        ccol = lerp(col('#5d3d63'), col('#ffb38a'), lit[..., None])
    else:
        ccol = lerp(col('#0d1424'), col('#3a4a6a'), lit[..., None])
    img = blend(img, ccol, cm * 0.92)

    horizon_col = col(T['sky'][-1][1])

    # far layer
    far = L['far']
    if far != 'none':
        rf = rng(L['seed'] + 7)
        if far == 'peaks':
            ridge = fbm1d(W, 5, 6, rf, 0.55)
            ridge = 1 - np.abs(ridge * 2 - 1)
            top = hz - 120 - ridge * 380
        elif far == 'blue':
            top = hz - 30 - fbm1d(W, 3, 5, rf) * 150
        elif far == 'cliffs':
            top = hz - 30 - fbm1d(W, 4, 5, rf) * 40 - smoothstep(0.1, 0.4, np.linspace(0, 1, W)) * 25
        elif far == 'granite':
            top = hz - 20 - fbm1d(W, 4, 6, rf) * 110
        elif far == 'forest':
            top = hz - 50 - fbm1d(W, 3, 5, rf) * 120
        else:  # hills
            top = hz - 30 - fbm1d(W, 2, 5, rf) * 120
        yy = ys * H * np.ones((1, W))
        m = smoothstep(top[None, :] - 1.2, top[None, :] + 1.2, yy) * (yy < hz + 4)
        tex = fbm(W, H, 30, 5, rf)
        slope = np.gradient(top)[None, :]
        ks = 41
        slope = np.convolve(np.gradient(top), np.ones(ks) / ks, mode='same')[None, :]
        depth_fade = np.exp(-np.clip(yy - top[None, :], 0, None) / 160)
        shade = np.clip(0.8 + slope * 0.25 * (1 if sx > 0.5 else -1) * depth_fade + (tex - 0.5) * 0.45, 0.35, 1.25)
        shade = blur(np.clip(shade / 1.3, 0, 1), 3) * 1.3
        base = light_color(L['farc'], tod, 0.45 if far in ('peaks', 'blue') else 0.3)
        layer = base[None, None, :] * shade[..., None]
        if far == 'peaks':
            snow = (yy < top[None, :] + 60 + tex * 90) & (top[None, :] < hz - 230)
            snowc = light_color('#f4f7fb', tod, 0.25)
            layer = np.where(snow[..., None], snowc * np.clip(shade[..., None] * 1.1, 0.5, 1.15), layer)
            # second lower ridge
        if far == 'cliffs':
            strata = 0.85 + 0.15 * np.sin(yy * 0.25 + tex * 6)
            layer = layer * strata[..., None]
            grass_top = yy < top[None, :] + 8
            layer = np.where(grass_top[..., None], light_color('#7c9a4a', tod, 0.2), layer)
        if far == 'forest':
            layer = light_color(L['farc'], tod, 0.35) * (0.7 + 0.5 * fbm(W, H, 80, 3, rf))[..., None]
        # haze toward horizon
        hzf = smoothstep(top[None, :], hz, yy) * 0.25
        layer = lerp(layer, horizon_col, hzf[..., None])
        img = blend(img, layer, m)
        if far == 'peaks':  # nearer ridge
            ridge2 = fbm1d(W, 7, 6, rf)
            top2 = hz - 40 - ridge2 * 200
            m2 = smoothstep(top2[None, :] - 1.2, top2[None, :] + 1.2, yy) * (yy < hz + 4)
            c2 = light_color('#4c5c58', tod, 0.2)
            layer2 = c2[None, None, :] * (0.7 + 0.5 * fbm(W, H, 40, 5, rf))[..., None]
            img = blend(img, layer2, m2)

    # treelines (two rows: far darker hazy, nearer)
    rt = rng(L['seed'] + 13)
    hz_line = lambda x: hz - 6 + 4 * math.sin(x * 0.01)
    gaps = [(W * 0.35, W * 0.62)] if L.get('wide') else None
    if L['far'] != 'peaks':
        m1 = treeline_mask(L['trees'][0], lambda x: hz - 4, 260, 25, 70, rt, 6, gaps=gaps)
    else:
        m1 = treeline_mask('pine', lambda x: hz - 4, 220, 30, 90, rt, 6)
    tex = fbm(W, H, 120, 4, rt)
    c1 = light_color(L['treec'], tod, 0.35)
    layer = c1[None, None, :] * (0.75 + 0.5 * tex[..., None])
    img = blend(img, layer, m1)

    # side forests (bigger, closer, on edges)
    def side_base(x):
        if x < W * 0.22:
            return hz + 18 - x * 0.06
        if x > W * 0.78:
            return hz + 18 - (W - x) * 0.06
        return hz + 300
    m2 = treeline_mask(L['trees'][1], side_base, 45, 90, 230, rt, 8, x0=-80, x1=W * 0.2)
    m3 = treeline_mask(L['trees'][1], side_base, 45, 90, 230, rt, 8, x0=W * 0.8, x1=W + 80)
    m2 = np.maximum(m2, m3) * (ys * H < hz + 40)
    c2 = light_color(L['treec'], tod, 0.08)
    tex2 = fbm(W, H, 200, 4, rt)
    # light from the sun side
    side_light = 0.85 + 0.3 * (xs - 0.5) * (1 if sx > 0.5 else -1)
    layer = c2[None, None, :] * (0.6 + 0.6 * tex2[..., None]) * side_light[..., None]
    if 'birch' in L['trees']:
        trunks = (np.sin(xs * W * 0.9 + tex2 * 30) > 0.97) * (ys * H > hz - 140)
        layer = np.where(trunks[..., None], light_color('#e9e6dc', tod, 0.05), layer)
    sh = 10 if sx > 0.5 else -10
    rim = np.clip(m2 - np.roll(blur(m2, 5), (8, sh), axis=(0, 1)), 0, 1)
    layer = layer * (1 + rim[..., None] * 0.9)
    inner = blur(m2, 14)
    layer = layer * (0.75 + 0.25 * (1 - inner[..., None]) + 0.1)
    img = blend(img, layer, m2)

    # house / church / boat
    struct = Image.new('RGBA', (W * 2, H * 2), (0, 0, 0, 0))
    sd = ImageDraw.Draw(struct)
    def C(hexc, haze=0.15, mul=1.0):
        c = light_color(hexc, tod, haze) * mul
        return tuple(int(v) for v in np.clip(c, 0, 255)) + (255,)
    lamp = (255, 210, 120, 255) if tod != 'day' else None
    if L.get('house'):
        bx, by = int(W * 0.66) * 2, (hz - 2) * 2
        sd.rectangle([bx, by - 70, bx + 130, by], fill=C('#8a5a3a'))
        for i in range(7):
            sd.line([bx, by - 70 + i * 10, bx + 130, by - 70 + i * 10], fill=C('#5e3b24'), width=2)
        sd.polygon([(bx - 14, by - 70), (bx + 65, by - 128), (bx + 144, by - 70)], fill=C('#6b2e2a'))
        sd.rectangle([bx + 92, by - 120, bx + 104, by - 96], fill=C('#5a4a44'))
        wc = lamp or C('#a8c4d6')
        sd.rectangle([bx + 22, by - 52, bx + 46, by - 30], fill=wc)
        sd.rectangle([bx + 80, by - 52, bx + 104, by - 30], fill=wc)
        sd.line([bx + 34, by - 52, bx + 34, by - 30], fill=C('#3b2618'), width=3)
        sd.line([bx + 92, by - 52, bx + 92, by - 30], fill=C('#3b2618'), width=3)
        # fence & pier
        for i in range(12):
            sd.line([bx - 120 + i * 18, by, bx - 120 + i * 18, by - 22], fill=C('#6d5032'), width=3)
        sd.line([bx - 122, by - 14, bx + 80, by - 14], fill=C('#6d5032'), width=3)
        sd.rectangle([bx + 150, by - 6, bx + 260, by + 4], fill=C('#7a5a3a'))
        for i in range(4):
            sd.line([bx + 160 + i * 30, by, bx + 160 + i * 30, by + 18], fill=C('#4a3420'), width=4)
    if L.get('church'):
        bx, by = int(W * 0.30) * 2, (hz - 32) * 2
        sd.rectangle([bx, by - 90, bx + 70, by], fill=C('#efe8dc', 0.35))
        sd.rectangle([bx + 18, by - 150, bx + 52, by - 90], fill=C('#efe8dc', 0.35))
        sd.ellipse([bx + 10, by - 190, bx + 60, by - 140], fill=C('#d9b24a', 0.25))
        sd.line([bx + 35, by - 214, bx + 35, by - 188], fill=C('#d9b24a', 0.2), width=4)
        sd.line([bx + 26, by - 205, bx + 44, by - 205], fill=C('#d9b24a', 0.2), width=4)
        sd.rectangle([bx + 28, by - 120, bx + 42, by - 100], fill=lamp or C('#59606a', 0.3))
        sd.rectangle([bx + 80, by - 50, bx + 170, by], fill=C('#cfc6b5', 0.35))
        sd.polygon([(bx + 74, by - 50), (bx + 125, by - 78), (bx + 176, by - 50)], fill=C('#7a4a3a', 0.35))
    if L.get('boat'):
        bx, by = int(W * 0.40) * 2, (hz + 46) * 2
        sd.polygon([(bx, by), (bx + 150, by), (bx + 130, by + 26), (bx + 20, by + 26)], fill=C('#6e3f2a', 0.2))
        sd.line([bx + 4, by + 4, bx + 146, by + 4], fill=C('#d7c09a', 0.2), width=4)
        sd.ellipse([bx + 60, by - 46, bx + 82, by - 24], fill=C('#2f3a4a', 0.2))
        sd.polygon([(bx + 56, by), (bx + 86, by), (bx + 80, by - 28), (bx + 62, by - 28)], fill=C('#3c5a7a', 0.2))
        sd.line([bx + 80, by - 22, bx + 200, by - 90], fill=C('#2a2018', 0.2), width=3)
    struct = struct.resize((W, H), Image.LANCZOS)
    sa = np.asarray(struct, np.float32)
    img = blend(img, sa[..., :3], sa[..., 3] / 255.0)

    # islands
    if L.get('islands') or L.get('granite_isles'):
        ri = rng(L['seed'] + 3)
        for (ix, iw, ih) in ([(0.18, 180, 70), (0.55, 120, 50)] if L.get('islands') else [(0.35, 160, 40), (0.62, 90, 26)]):
            def fn(d, s, ix=ix, iw=iw, ih=ih):
                cx = ix * W * s
                cy = (hz + 26) * s
                if L.get('granite_isles'):
                    d.ellipse([cx - iw * s, cy - ih * s * 0.6, cx + iw * s, cy + 10 * s], fill=255)
                    for k in range(10):
                        draw_tree(d, 'pine', ix * W + ri.uniform(-iw * 0.7, iw * 0.5), hz + 26 - ih * 0.3, ri.uniform(50, 110), ri, s)
                else:
                    d.ellipse([cx - iw * s, cy - 14 * s, cx + iw * s, cy + 10 * s], fill=255)
                    for k in range(14):
                        draw_tree(d, 'mixed' if k % 3 else 'pine', ix * W + ri.uniform(-iw * 0.8, iw * 0.8), hz + 24, ri.uniform(ih * 0.8, ih * 1.6), ri, s)
            mi = mask_from_draw(W, H, fn)
            ci = light_color(L['treec'] if not L.get('granite_isles') else '#5b6066', tod, 0.12)
            ti = fbm(W, H, 150, 4, ri)
            layer = ci[None, None, :] * (0.65 + 0.6 * ti[..., None])
            img = blend(img, layer, mi)

    # ---------------- water
    yy = np.arange(H)[:, None] * np.ones((1, W))
    dist = np.clip((yy - hz) / (H - hz), 0, 1)  # 0 at horizon, 1 at viewer
    rw = rng(L['seed'] + 17)
    wn = fbm(W, H, 12, 5, rw, aspect=6)
    amp = 2 + dist * 26 * (1.8 if L.get('rapids') else 1)
    dx = (np.sin(yy * (0.9 - dist * 0.6) + wn * 8) * amp + (wn - 0.5) * amp * 2).astype(np.int32)
    src_y = np.clip(2 * hz - yy - (dist * 6).astype(int), 0, hz - 1).astype(np.int32)
    src_x = np.clip(np.arange(W)[None, :] + dx, 0, W - 1)
    refl = img[src_y, src_x]
    refl = blur(refl, 2.2)
    wcol = light_color(L['water'], tod, 0.0)
    deep = wcol * 0.55
    wbase = lerp(wcol[None, None, :], deep[None, None, :], dist[..., None])
    fres = 0.85 - dist * 0.55
    if L.get('rapids'):
        fres = fres * 0.7
    water = lerp(wbase, refl * (0.75 + 0.2 * (tod == 'night')), fres[..., None])
    # wave streaks
    streak = fbm(W, H, 6, 5, rw, aspect=14)
    sl = smoothstep(0.62, 0.8, streak) * (0.15 + dist * 0.25)
    sky_top = col(T['sky'][-1][1]) if tod != 'night' else col('#3a5378')
    water = lerp(water, sky_top[None, None, :], sl[..., None] * 0.6)
    dark = smoothstep(0.2, 0.05, streak) * dist * 0.35
    water = water * (1 - dark[..., None])
    # sun / moon path glitter
    pathw = 60 + dist * 320
    pathm = np.exp(-((np.arange(W)[None, :] - sxp) / pathw) ** 2)
    glit = fbm(W, H, 40, 4, rng(L['seed'] + 31), aspect=12)
    gmask = pathm * smoothstep(0.55, 0.75, glit) * (1.0 if tod != 'day' else 0.55)
    if tod == 'day' and sy < 0.3:
        gmask *= 0.6
    water = lerp(water, col(T['sunc'])[None, None, :], np.clip(gmask, 0, 1)[..., None] * 0.9)
    # current lines for rivers
    if L.get('current') or L.get('rapids'):
        cl = fbm(W, H, 5, 4, rng(91), aspect=16)
        cur = smoothstep(0.66, 0.7, cl) * smoothstep(0.74, 0.7, cl) * (0.3 + dist)
        water = lerp(water, col('#e6f2f2') * (T['light'] * 0.8 + 0.15), np.clip(cur, 0, 1)[..., None] * 0.4)
    if L.get('rapids'):
        foam = fbm(W, H, 8, 5, rng(92), aspect=14)
        fm = smoothstep(0.6, 0.66, foam) * smoothstep(0.74, 0.68, foam) * (dist > 0.02) * 0.7
        water = lerp(water, col('#eef6f4') * (T['light'] * 0.85 + 0.12), fm[..., None])
    wmask = (yy >= hz).astype(np.float32)
    shore = smoothstep(hz, hz + 3, yy)
    img = blend(img, water, wmask * shore + (yy >= hz) * (1 - shore) * 0.6)

    # far-shore reflection line
    edge = np.exp(-((yy - hz - 1) / 1.6) ** 2) * 0.35
    img = img * (1 - edge[..., None] * 0.6)

    # rocks in water (mountain)
    if L.get('rocks'):
        rr = rng(L['seed'] + 41)
        lay = Image.new('RGBA', (W * 2, H * 2), (0, 0, 0, 0))
        ld = ImageDraw.Draw(lay)
        for k in range(16):
            dd = rr.uniform(0.08, 0.7)
            cx = rr.uniform(0.05, 0.95) * W * 2
            cy = (hz + dd * (H - hz)) * 2
            s = (14 + dd * 120) * 2
            pts = [(cx + math.cos(a) * s * rr.uniform(0.6, 1.0), cy - abs(math.sin(a)) * s * rr.uniform(0.4, 0.8) if math.sin(a) > 0 else cy + 4)
                   for a in np.linspace(0, 2 * math.pi, 12)]
            ld.polygon(pts, fill=C('#6d6a66', 0.1 * (1 - dd)))
            ld.ellipse([cx - s * 0.6, cy - s * 0.55, cx + s * 0.1, cy - s * 0.25], fill=C('#8e8a84', 0.1 * (1 - dd)))
            ld.ellipse([cx - s * 1.1, cy - 4, cx + s * 1.1, cy + 10], fill=C('#f0f6f4', 0.1, 0.9))
        lay = lay.resize((W, H), Image.LANCZOS)
        la = np.asarray(lay, np.float32)
        img = blend(img, la[..., :3], la[..., 3] / 255.0)

    # lily pads
    if L.get('lilies'):
        rl = rng(L['seed'] + 43)
        lay = Image.new('RGBA', (W * 2, H * 2), (0, 0, 0, 0))
        ld = ImageDraw.Draw(lay)
        n = int(60 * L['lilies'])
        for k in range(n):
            side = rl.random() < 0.5
            x = (rl.uniform(0.0, 0.3) if side else rl.uniform(0.7, 1.0)) * W
            dd = rl.uniform(0.05, 0.9) ** 1.3
            y = hz + dd * (H - hz)
            s = (6 + dd * 60)
            x2, y2, s2 = x * 2, y * 2, s * 2
            ld.ellipse([x2 - s2, y2 - s2 * 0.35, x2 + s2, y2 + s2 * 0.35], fill=C('#3f7a35', 0.1))
            ld.pieslice([x2 - s2, y2 - s2 * 0.35, x2 + s2, y2 + s2 * 0.35], 80, 100, fill=(0, 0, 0, 0))
            ld.ellipse([x2 - s2 * 0.7, y2 - s2 * 0.25, x2 + s2 * 0.3, y2 + s2 * 0.05], fill=C('#5f9a48', 0.1))
            if rl.random() < 0.25:
                ld.ellipse([x2 - s2 * 0.3, y2 - s2 * 0.5, x2 + s2 * 0.3, y2 - s2 * 0.05], fill=C('#f4f0f4', 0.05) if rl.random() < 0.6 else C('#f2c94c', 0.05))
        lay = lay.resize((W, H), Image.LANCZOS)
        la = np.asarray(lay, np.float32)
        img = blend(img, la[..., :3], la[..., 3] / 255.0)

    # fog
    if L.get('fog'):
        fgn = fbm(W, H, 4, 5, rng(77), aspect=0.3)
        fy = np.exp(-((yy - hz) / 90) ** 2)
        fm = np.clip(fy * (0.4 + fgn) * L['fog'], 0, 0.9)
        fc = light_color('#dfe6df', tod, 0.2) * (1.0 if tod != 'night' else 1.6)
        img = blend(img, fc, fm)

    # ---------------- foreground banks
    rfg = rng(L['seed'] + 101)
    fg = L['fg']
    lay = Image.new('RGBA', (W * 2, H * 2), (0, 0, 0, 0))
    ld = ImageDraw.Draw(lay)
    def bank(left):
        sgn = 1 if left else -1
        x0 = 0 if left else W * 2
        pts = [(x0, H * 2 - 360), (x0 + sgn * 120, H * 2 - 300), (x0 + sgn * 300, H * 2 - 170), (x0 + sgn * 470, H * 2 - 60), (x0 + sgn * 560, H * 2), (x0, H * 2)]
        groundc = {'reeds': '#4a5e2c', 'grass': '#4f6b2d', 'cattails': '#4b5631', 'rocks': '#6a6762', 'sand': '#c8ab78', 'granite': '#6f6f70'}[fg]
        ld.polygon(pts, fill=C(groundc, 0.0, 0.9))
        if fg in ('rocks', 'granite', 'sand'):
            for k in range(12):
                rx = x0 + sgn * rfg.uniform(20, 480)
                ry = H * 2 - rfg.uniform(0, 260)
                rs = rfg.uniform(30, 110)
                ld.ellipse([rx - rs, ry - rs * 0.6, rx + rs, ry + rs * 0.4], fill=C('#77736c' if fg != 'granite' else '#8a7f7a', 0.0, rfg.uniform(0.7, 1.1)))
                ld.ellipse([rx - rs * 0.6, ry - rs * 0.55, rx + rs * 0.2, ry - rs * 0.2], fill=C('#a9a49a' if fg != 'granite' else '#b39a8f', 0.0, 0.9))
        n = 160 if fg in ('reeds', 'cattails', 'grass') else 60
        for k in range(n):
            bx = x0 + sgn * rfg.uniform(0, 520) ** 1.0
            by = H * 2 - rfg.uniform(0, 280) * (1 - abs(bx - x0) / 600)
            hgt = rfg.uniform(80, 420) * (1.4 if fg in ('reeds', 'cattails') else 0.7)
            lean = rfg.uniform(-0.25, 0.25) + sgn * 0.08
            c = C(rfg.choice(['#5b7a2e', '#6d8a34', '#4a6626', '#7c8f3a']), 0.0, rfg.uniform(0.7, 1.05))
            tipx = bx + lean * hgt
            ld.polygon([(bx - 5, by), (bx + 5, by), (tipx, by - hgt)], fill=c)
            if fg == 'cattails' and k % 4 == 0:
                ld.rounded_rectangle([tipx - 9, by - hgt * 0.95, tipx + 9, by - hgt * 0.72], 8, fill=C('#5a3a22', 0.0))
            if fg == 'reeds' and k % 6 == 0:
                for j in range(6):
                    ld.line([tipx, by - hgt, tipx + rfg.uniform(-30, 30), by - hgt - rfg.uniform(10, 40)], fill=C('#b49a6a', 0.0), width=3)
    bank(True)
    bank(False)
    lay = lay.resize((W, H), Image.LANCZOS)
    la = np.asarray(lay, np.float32)
    img = blend(img, la[..., :3], la[..., 3] / 255.0)

    # lit windows glow at night/evening, fireflies
    # grading + vignette
    vg = ((xs - 0.5) ** 2 * 1.2 + (ys - 0.5) ** 2 * 1.6)
    img = img * (1 - np.clip(vg * (0.55 if tod == 'night' else 0.4), 0, 0.6))[..., None]
    grain = (rng(L['seed'] + 7).random((H, W)) - 0.5) * 6
    img = img + grain[..., None]
    return to_img(img), hz


if __name__ == '__main__':
    only = sys.argv[1:] or list(LOCS)
    for loc in only:
        for tod in TODS:
            im, hz = render(loc, tod)
            p = os.path.join(OUT, f'{loc}_{tod}.jpg')
            im.save(p, quality=90, optimize=True, progressive=True)
            print(p, os.path.getsize(p) // 1024, 'KB', 'hz', hz)
