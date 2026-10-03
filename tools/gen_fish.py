"""Procedural detailed fish sprites (side view, head to the left).
Output: assets/fish/<id>.png 768x384 RGBA."""
import os, math, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from common import *

FW, FH = 768, 384
SS = 2
W, H = FW * SS, FH * SS
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'fish')
os.makedirs(OUT, exist_ok=True)

# body: length (fraction of width), hmax (fraction of height), pa/pb profile powers, up (share above centerline)
# blunt (0 = pointed snout), ped (peduncle thickness rel hmax), arch (centerline arch)
# tail: forked / round / straight / hetero / eel / sail
# fins: list of (kind, x0, x1, height, shape)
SPEC = {
    'karas':      dict(back='#5d4a1c', side='#c99a2e', belly='#f2dc96', fin='#9a6a2a', eye='#d9a43a', hmax=0.62, pa=1.0, pb=1.3, up=0.56, blunt=0.18, ped=0.32, tail='straight', scales=1.0, dorsal=('long', 0.36, 0.72, 0.16), anal=(0.62, 0.74, 0.12), pattern=None),
    'serkaras':   dict(back='#4a5560', side='#aab7bf', belly='#e9eef0', fin='#7a8288', eye='#c9b98a', hmax=0.56, pa=1.0, pb=1.3, up=0.56, blunt=0.16, ped=0.3, tail='forked', scales=1.0, dorsal=('long', 0.38, 0.72, 0.15), anal=(0.62, 0.74, 0.12), pattern=None),
    'rotan':      dict(back='#2c2a20', side='#5a5434', belly='#a39a72', fin='#3a3626', eye='#b0a050', hmax=0.38, pa=0.8, pb=1.5, up=0.5, blunt=0.35, ped=0.42, tail='round', scales=0.6, dorsal=('two_round', 0.36, 0.74, 0.14), anal=(0.6, 0.76, 0.11), pattern='mottled', bighead=True),
    'plotva':     dict(back='#2f4a52', side='#b9c6cc', belly='#eef2f2', fin='#d0532e', eye='#e04a2a', hmax=0.38, pa=1.1, pb=1.5, up=0.55, blunt=0.1, ped=0.27, tail='forked', scales=1.0, dorsal=('tri', 0.4, 0.55, 0.16), anal=(0.6, 0.72, 0.1), pattern=None),
    'krasnoperka':dict(back='#4a5130', side='#cfb560', belly='#f3e6b0', fin='#e33a22', eye='#e0a020', hmax=0.4, pa=1.1, pb=1.4, up=0.56, blunt=0.1, ped=0.27, tail='forked', scales=1.0, dorsal=('tri', 0.48, 0.6, 0.15), anal=(0.6, 0.73, 0.11), pattern=None),
    'okun':       dict(back='#2f4a24', side='#8fa64a', belly='#e8e2b0', fin='#e2582a', eye='#e0b030', hmax=0.42, pa=0.9, pb=1.6, up=0.6, blunt=0.14, ped=0.25, tail='forked', scales=0.8, dorsal=('spiny_soft', 0.24, 0.66, 0.2), anal=(0.6, 0.7, 0.12), pattern='bars', barc='#1e2a14', spot_dorsal=True),
    'lin':        dict(back='#2e3a1a', side='#6b7a32', belly='#c9b860', fin='#3c4422', eye='#d8402a', hmax=0.36, pa=1.0, pb=1.4, up=0.52, blunt=0.25, ped=0.42, tail='round', scales=0.35, dorsal=('round', 0.42, 0.58, 0.14), anal=(0.58, 0.7, 0.11), pattern=None, barbel=0.03),
    'karp':       dict(back='#4b3a1a', side='#b88a36', belly='#ecd28a', fin='#8a5a2a', eye='#d8a540', hmax=0.42, pa=1.0, pb=1.4, up=0.58, blunt=0.22, ped=0.3, tail='forked', scales=1.4, dorsal=('long', 0.36, 0.7, 0.14), anal=(0.62, 0.72, 0.11), pattern=None, barbel=0.05),
    'zolotaya':   dict(back='#d84a0a', side='#ffb020', belly='#fff0a0', fin='#ff7a1a', eye='#202020', hmax=0.5, pa=1.0, pb=1.2, up=0.56, blunt=0.25, ped=0.3, tail='veil', scales=1.0, dorsal=('sail', 0.36, 0.62, 0.22), anal=(0.6, 0.72, 0.14), pattern=None, crown=True),
    'golavl':     dict(back='#2c3438', side='#a8b2b0', belly='#eeeeea', fin='#7a5a4a', eye='#d0a040', hmax=0.32, pa=0.9, pb=1.5, up=0.52, blunt=0.3, ped=0.3, tail='forked', scales=1.3, dorsal=('tri', 0.44, 0.56, 0.14), anal=(0.6, 0.72, 0.12), pattern='scaleedge', fin2='#d06a3a'),
    'yaz':        dict(back='#3a4640', side='#b8b8a0', belly='#ecebe0', fin='#c86a3a', eye='#e0b040', hmax=0.38, pa=1.0, pb=1.5, up=0.55, blunt=0.18, ped=0.28, tail='forked', scales=1.1, dorsal=('tri', 0.44, 0.56, 0.15), anal=(0.6, 0.72, 0.12), pattern=None),
    'shchuka':    dict(back='#334224', side='#7f9a4a', belly='#e6e4c4', fin='#9a6a32', eye='#d8b040', hmax=0.22, pa=0.7, pb=0.9, up=0.5, blunt=0.0, ped=0.45, tail='forked_small', scales=0.5, dorsal=('round', 0.64, 0.76, 0.13), anal=(0.64, 0.76, 0.11), pattern='spots_light', snout='duck', length=0.98),
    'leshch':     dict(back='#3e3420', side='#a88c50', belly='#e0cfa0', fin='#5a4a32', eye='#c8a050', hmax=0.7, pa=1.0, pb=1.0, up=0.52, blunt=0.08, ped=0.2, tail='forked', scales=1.0, dorsal=('tri', 0.44, 0.54, 0.18), anal=(0.46, 0.76, 0.12), pattern=None, compressed=True),
    'peskar':     dict(back='#4a4a3a', side='#a8a490', belly='#e8e4d0', fin='#8a8670', eye='#c0b080', hmax=0.24, pa=0.8, pb=1.5, up=0.48, blunt=0.3, ped=0.35, tail='forked', scales=0.7, dorsal=('tri', 0.36, 0.48, 0.14), anal=(0.6, 0.7, 0.09), pattern='spots_dark_line', barbel=0.03),
    'uklejka':    dict(back='#3a5866', side='#d4dde2', belly='#f6f8f8', fin='#a8b4ba', eye='#c8c8c0', hmax=0.24, pa=1.0, pb=1.4, up=0.45, blunt=0.05, ped=0.24, tail='forked', scales=0.6, dorsal=('tri', 0.5, 0.6, 0.12), anal=(0.56, 0.72, 0.09), pattern=None, upmouth=True),
    'ersh':       dict(back='#4a4428', side='#9a8e5a', belly='#e0d8b0', fin='#8a7a4a', eye='#7080b0', hmax=0.34, pa=0.8, pb=1.6, up=0.56, blunt=0.25, ped=0.3, tail='forked', scales=0.6, dorsal=('spiny_soft', 0.3, 0.72, 0.17), anal=(0.6, 0.7, 0.1), pattern='spots_dark', spot_dorsal=True),
    'nalim':      dict(back='#2e2a1c', side='#6a6038', belly='#c8c098', fin='#4a4428', eye='#a09060', hmax=0.22, pa=0.6, pb=1.0, up=0.5, blunt=0.4, ped=0.5, tail='eel', scales=0.0, dorsal=('long_low', 0.42, 0.88, 0.08), anal=(0.5, 0.88, 0.07), pattern='mottled', barbel=0.04, chin=True),
    'gustera':    dict(back='#4a5056', side='#c0c8cc', belly='#eef0f0', fin='#d06a50', eye='#d0c0a0', hmax=0.6, pa=1.0, pb=1.1, up=0.52, blunt=0.1, ped=0.22, tail='forked', scales=1.0, dorsal=('tri', 0.44, 0.54, 0.18), anal=(0.5, 0.74, 0.11), pattern=None, compressed=True),
    'sudak':      dict(back='#3a4646', side='#a0aaa4', belly='#ecece4', fin='#8a8a80', eye='#e8e0c0', hmax=0.25, pa=0.8, pb=1.1, up=0.52, blunt=0.05, ped=0.32, tail='forked', scales=0.6, dorsal=('two_spiny', 0.26, 0.7, 0.15), anal=(0.6, 0.72, 0.1), pattern='bars', barc='#2a3230', spot_dorsal=True, fangs=True, length=0.96),
    'amur':       dict(back='#3a4430', side='#9aa078', belly='#e0e0c8', fin='#6a6a4a', eye='#c0b060', hmax=0.28, pa=1.0, pb=1.2, up=0.5, blunt=0.3, ped=0.36, tail='forked', scales=1.4, dorsal=('tri', 0.44, 0.56, 0.13), anal=(0.62, 0.72, 0.1), pattern='scaleedge'),
    'vyun':       dict(back='#3a2e1c', side='#9a7a4a', belly='#e0c890', fin='#7a6040', eye='#e0c060', hmax=0.13, pa=0.5, pb=0.6, up=0.5, blunt=0.5, ped=0.6, tail='round', scales=0.0, dorsal=('round', 0.55, 0.65, 0.07), anal=(0.66, 0.74, 0.06), pattern='stripes_long', barbel=0.04),
    'forel':      dict(back='#4a4428', side='#b89a5a', belly='#f0e2b0', fin='#9a8050', eye='#d0a040', hmax=0.3, pa=0.9, pb=1.3, up=0.52, blunt=0.15, ped=0.34, tail='straight', scales=0.4, dorsal=('tri', 0.4, 0.54, 0.14), anal=(0.6, 0.72, 0.11), pattern='spots_red', adipose=True),
    'raduzhka':   dict(back='#3a5040', side='#b8c0b0', belly='#f0f0e8', fin='#8a9080', eye='#d0b060', hmax=0.32, pa=0.9, pb=1.3, up=0.52, blunt=0.15, ped=0.34, tail='straight', scales=0.4, dorsal=('tri', 0.4, 0.54, 0.14), anal=(0.6, 0.72, 0.11), pattern='rainbow', adipose=True),
    'harius':     dict(back='#3a3e48', side='#9aa0a8', belly='#e8e4e0', fin='#6a5a7a', eye='#d0a060', hmax=0.28, pa=0.9, pb=1.3, up=0.52, blunt=0.15, ped=0.3, tail='forked', scales=1.0, dorsal=('sail', 0.3, 0.62, 0.3), anal=(0.62, 0.72, 0.1), pattern='spots_dark', adipose=True, spot_dorsal=True, dorsal_col='#7a4a8a'),
    'lenok':      dict(back='#4a3a2a', side='#a08a6a', belly='#ead8c0', fin='#8a6a4a', eye='#c09050', hmax=0.29, pa=0.9, pb=1.3, up=0.52, blunt=0.12, ped=0.32, tail='forked', scales=0.5, dorsal=('tri', 0.4, 0.54, 0.14), anal=(0.6, 0.72, 0.1), pattern='spots_dark', adipose=True, flush='#c86040'),
    'taimen':     dict(back='#3a3a30', side='#9a7a5a', belly='#e8d8c0', fin='#c04a2a', eye='#c09050', hmax=0.24, pa=0.8, pb=1.1, up=0.5, blunt=0.08, ped=0.36, tail='straight', scales=0.5, dorsal=('tri', 0.42, 0.54, 0.13), anal=(0.62, 0.72, 0.1), pattern='spots_x', adipose=True, length=0.97, tailc='#d04020'),
    'som':        dict(back='#24261e', side='#4e5240', belly='#c8c4a8', fin='#2e3026', eye='#a09060', hmax=0.24, pa=0.5, pb=1.0, up=0.48, blunt=0.55, ped=0.45, tail='eel', scales=0.0, dorsal=('tiny', 0.26, 0.32, 0.06), anal=(0.36, 0.9, 0.09), pattern='mottled', barbel=0.18, bighead=True, length=0.98),
    'sazan':      dict(back='#3a3018', side='#a07a30', belly='#e8cc80', fin='#7a4a20', eye='#d8a540', hmax=0.36, pa=1.0, pb=1.4, up=0.56, blunt=0.2, ped=0.3, tail='forked', scales=1.4, dorsal=('long', 0.36, 0.7, 0.14), anal=(0.62, 0.72, 0.11), pattern='scaleedge', barbel=0.05, fin2='#b04a2a'),
    'zherekh':    dict(back='#2c3c48', side='#b4c0c8', belly='#f2f4f4', fin='#a8a8a0', eye='#e0d0a0', hmax=0.28, pa=0.9, pb=1.3, up=0.5, blunt=0.06, ped=0.28, tail='forked', scales=0.9, dorsal=('tri', 0.44, 0.56, 0.16), anal=(0.58, 0.74, 0.11), pattern=None, fin2='#c06050'),
    'sterlyad':   dict(back='#4a4030', side='#8a7a5a', belly='#e8dcc0', fin='#6a5a40', eye='#b0a080', hmax=0.17, pa=0.7, pb=0.9, up=0.5, blunt=0.0, ped=0.4, tail='hetero', scales=0.0, dorsal=('tri', 0.66, 0.74, 0.1), anal=(0.66, 0.74, 0.08), pattern='scutes', snout='sturgeon', barbel=0.04, length=0.97),
    'beluga':     dict(back='#4a5058', side='#8a9298', belly='#e8eaea', fin='#5a6068', eye='#9a9080', hmax=0.3, pa=0.7, pb=0.9, up=0.5, blunt=0.15, ped=0.38, tail='hetero', scales=0.0, dorsal=('tri', 0.66, 0.74, 0.1), anal=(0.66, 0.74, 0.08), pattern='scutes', snout='beluga', barbel=0.05, length=0.98, bighead=True),
    'palia':      dict(back='#2a3a4a', side='#8a9aa0', belly='#f08040', fin='#e06030', eye='#d0b080', hmax=0.28, pa=0.9, pb=1.3, up=0.52, blunt=0.15, ped=0.34, tail='forked', scales=0.3, dorsal=('tri', 0.4, 0.54, 0.14), anal=(0.6, 0.72, 0.11), pattern='spots_light_pink', adipose=True, finedge=True),
    'sig':        dict(back='#2e4050', side='#c8d0d4', belly='#f6f8f8', fin='#9aa4aa', eye='#c8c8c0', hmax=0.3, pa=1.0, pb=1.3, up=0.54, blunt=0.2, ped=0.28, tail='forked', scales=1.0, dorsal=('tri', 0.38, 0.52, 0.15), anal=(0.6, 0.72, 0.1), pattern=None, adipose=True, smallmouth=True),
    'ryapushka':  dict(back='#2a4a5a', side='#c8d4da', belly='#f8f8f8', fin='#a0aab0', eye='#c8c8c0', hmax=0.24, pa=1.0, pb=1.3, up=0.5, blunt=0.05, ped=0.26, tail='forked', scales=0.8, dorsal=('tri', 0.4, 0.52, 0.14), anal=(0.6, 0.72, 0.09), pattern=None, adipose=True, upmouth=True),
    'losos':      dict(back='#2c4050', side='#c4ccd0', belly='#f4f4f0', fin='#7a8890', eye='#d0c0a0', hmax=0.28, pa=0.9, pb=1.2, up=0.52, blunt=0.1, ped=0.3, tail='straight', scales=0.6, dorsal=('tri', 0.4, 0.54, 0.14), anal=(0.62, 0.72, 0.1), pattern='spots_x_small', adipose=True, length=0.97),
}


def C(h):
    return col(h)


def render_fish(fid, sp):
    r = rng(abs(hash(fid)) % (2 ** 31))
    length = sp.get('length', 0.94)
    xn0 = (1 - length) / 2 + 0.01           # nose
    xt = xn0 + length                         # tail tip
    xp = xn0 + length * (0.80 if sp['tail'] not in ('eel',) else 0.86)  # peduncle
    cy = 0.5
    hmax = sp['hmax'] * 0.5                   # half height max as fraction of canvas H
    X = (np.arange(W) + 0.5) / W
    Y = (np.arange(H) + 0.5) / H
    n = np.clip((X - xn0) / (xp - xn0), 0, 1)
    pa, pb = sp['pa'], sp['pb']
    peak = sp.get('peak', 0.22 + 0.4 * pa / (pa + pb))
    h0 = 0.1 + sp['blunt'] * 0.85
    ped = sp['ped']
    kk = sp.get('k', 0.9 + pb * 0.35)
    front = h0 + (1 - h0) * np.sin(np.pi / 2 * np.clip(n / peak, 0, 1)) ** 0.75
    back_ = ped + (1 - ped) * np.cos(np.pi / 2 * np.clip((n - peak) / (1 - peak), 0, 1)) ** kk
    prof = np.where(n < peak, front, back_)
    prof = np.where((X < xn0) | (X > xp + 0.005), 0, prof)
    # rounded nose cap
    nose_len = 0.012 + sp['blunt'] * 0.05
    capx = np.clip((X - xn0) / nose_len, 0, 1)
    prof *= np.sqrt(1 - (1 - capx) ** 2)
    th = prof * hmax
    aspect = W / H
    up = sp['up'] * 2
    top = cy - th * up
    bot = cy + th * (2 - up)
    if sp.get('snout') == 'sturgeon':
        top = np.where(n < 0.12, cy - th * up + (0.12 - n) * 0.0, top)
    yy = Y[:, None]
    body = smoothstep(top[None, :] - 0.002, top[None, :] + 0.002, yy) * smoothstep(bot[None, :] + 0.002, bot[None, :] - 0.002, yy)
    body *= (th[None, :] > 0.0005)

    # ---- fins via PIL masks
    def poly_mask(fn):
        im = Image.new('L', (W, H), 0)
        fn(ImageDraw.Draw(im))
        return np.asarray(im, np.float32) / 255.0

    def P(x, y):
        return (x * W, y * H)

    def th_at(x):
        i = int(np.clip(x * W, 0, W - 1))
        return top[i], bot[i]

    fins_back = np.zeros((H, W), np.float32)   # behind body
    fins_front = np.zeros((H, W), np.float32)  # over body (pectoral/pelvic)
    fin_rays = np.zeros((H, W), np.float32)
    dorsal_mask = np.zeros((H, W), np.float32)
    tailx = xp
    pt_top, pt_bot = th_at(xp - 0.003)
    ph = (pt_bot - pt_top) / 2
    tail_h = max(hmax * 0.9, ph * 2.6)
    kind = sp['tail']

    def tail(d):
        x0 = xp - 0.01
        if kind == 'forked' or kind == 'forked_small':
            th2 = tail_h * (0.75 if kind == 'forked_small' else 1)
            d.polygon([P(x0, cy - ph), P(xt - 0.01, cy - th2 - 0.02), P(xt, cy - th2), P(xt - (xt - xp) * 0.55, cy), P(xt, cy + th2), P(xt - 0.01, cy + th2 + 0.02), P(x0, cy + ph)], fill=255)
        elif kind == 'straight':
            d.polygon([P(x0, cy - ph), P(xt - 0.005, cy - tail_h * 0.95), P(xt, cy - tail_h * 0.8), P(xt - 0.012, cy), P(xt, cy + tail_h * 0.8), P(xt - 0.005, cy + tail_h * 0.95), P(x0, cy + ph)], fill=255)
        elif kind == 'round':
            d.polygon([P(x0, cy - ph)] + [P(xp + (xt - xp) * (0.55 + 0.45 * math.cos(a)), cy + tail_h * 0.85 * math.sin(a)) for a in np.linspace(-1.4, 1.4, 20)] + [P(x0, cy + ph)], fill=255)
        elif kind == 'eel':
            d.polygon([P(x0 - 0.05, cy - ph)] + [P(xp + (xt - xp) * (0.4 + 0.6 * math.cos(a)), cy + ph * 1.8 * math.sin(a)) for a in np.linspace(-1.5, 1.5, 20)] + [P(x0 - 0.05, cy + ph)], fill=255)
        elif kind == 'hetero':
            d.polygon([P(x0, cy - ph), P(xt, cy - tail_h * 1.1), P(xt - 0.02, cy - tail_h * 0.9), P(xp + 0.05, cy + 0.0), P(xt - 0.06, cy + tail_h * 0.7), P(x0, cy + ph)], fill=255)
        elif kind == 'veil':
            pts = [P(x0, cy - ph)]
            for a in np.linspace(-1.5, 1.5, 30):
                rr = 1.0 + 0.12 * math.sin(a * 9)
                pts.append(P(xp + (xt - xp) * (0.2 + 0.8 * math.cos(a) * rr) + 0.02, cy + tail_h * 1.25 * math.sin(a)))
            pts.append(P(x0, cy + ph))
            d.polygon(pts, fill=255)
    tm = poly_mask(tail)
    fins_back = np.maximum(fins_back, tm)

    # dorsal
    dk, dx0, dx1, dh = sp['dorsal']
    t0, _ = th_at(dx0)
    t1, _ = th_at(dx1)
    def dorsal(d):
        if dk == 'tri':
            d.polygon([P(dx0, t0 + 0.02), P(dx0 + (dx1 - dx0) * 0.25, t0 - dh), P(dx0 + (dx1 - dx0) * 0.45, t0 - dh * 0.95), P(dx1, t1 - 0.005), P(dx1, t1 + 0.02)], fill=255)
        elif dk == 'long':
            d.polygon([P(dx0, t0 + 0.02), P(dx0 + 0.04, t0 - dh), P(dx0 + 0.08, t0 - dh * 0.75), P(dx1, t1 - dh * 0.25), P(dx1 + 0.01, t1 + 0.01)], fill=255)
        elif dk == 'round':
            d.polygon([P(dx0, t0 + 0.02)] + [P(dx0 + (dx1 - dx0) * (0.5 - 0.5 * math.cos(a)), min(t0, t1) - dh * math.sin(a)) for a in np.linspace(0.2, math.pi, 16)] + [P(dx1, t1 + 0.02)], fill=255)
        elif dk == 'sail':
            d.polygon([P(dx0, t0 + 0.02), P(dx0 + 0.02, t0 - dh * 0.7), P(dx0 + (dx1 - dx0) * 0.6, t0 - dh), P(dx1 + 0.03, t1 - dh * 0.6), P(dx1, t1 + 0.02)], fill=255)
        elif dk in ('spiny_soft', 'two_spiny', 'two_round'):
            mid = dx0 + (dx1 - dx0) * 0.55
            tm_, _ = th_at(mid)
            if dk == 'two_round':
                d.polygon([P(dx0, t0 + 0.02)] + [P(dx0 + (mid - dx0) * (0.5 - 0.5 * math.cos(a)), t0 - dh * 0.8 * math.sin(a)) for a in np.linspace(0.2, math.pi, 12)] + [P(mid, tm_ + 0.02)], fill=255)
            else:
                pts = [P(dx0, t0 + 0.02)]
                k = 12
                for i in range(k + 1):
                    x = dx0 + (mid - dx0) * i / k
                    tt, _ = th_at(x)
                    hh = dh * (0.6 + 0.4 * math.sin(math.pi * min(1, i / k * 1.3)))
                    pts.append(P(x, tt - hh))
                    if i < k:
                        pts.append(P(x + (mid - dx0) / k * 0.5, tt - hh * 0.72))
                pts.append(P(mid, tm_ + 0.02))
                d.polygon(pts, fill=255)
            g = 0.005 if dk != 'spiny_soft' else -0.01
            d.polygon([P(mid + g, tm_ + 0.02), P(mid + g + 0.02, tm_ - dh * 0.85), P(dx1 - 0.03, t1 - dh * 0.6), P(dx1, t1 + 0.02)], fill=255)
        elif dk == 'long_low':
            d.polygon([P(dx0, t0 + 0.02), P(dx0 + 0.03, t0 - dh), P(dx1 - 0.02, t1 - dh), P(xp + 0.03, cy - ph * 1.6), P(dx1, t1 + 0.02)], fill=255)
        elif dk == 'tiny':
            d.polygon([P(dx0, t0 + 0.02), P(dx0 + 0.015, t0 - dh), P(dx1, t1 + 0.01)], fill=255)
    dm = poly_mask(dorsal)
    dorsal_mask = dm
    fins_back = np.maximum(fins_back, dm)
    # adipose
    if sp.get('adipose'):
        ax = dx1 + (xp - dx1) * 0.6
        ta, _ = th_at(ax)
        fins_back = np.maximum(fins_back, poly_mask(lambda d: d.ellipse([ax * W - 18 * SS, (ta - 0.03) * H, ax * W + 14 * SS, (ta + 0.03) * H], fill=255)))
    # anal
    ax0, ax1, ah = sp['anal']
    _, b0 = th_at(ax0)
    _, b1 = th_at(ax1)
    def anal(d):
        if sp['tail'] == 'eel':
            d.polygon([P(ax0, b0 - 0.02), P(ax0 + 0.02, b0 + ah), P(ax1, b1 + ah * 0.8), P(xp + 0.04, cy + ph * 1.6), P(ax1, b1 - 0.02)], fill=255)
        else:
            d.polygon([P(ax0, b0 - 0.02), P(ax0 + (ax1 - ax0) * 0.3, b0 + ah), P(ax1, b1 + ah * 0.35), P(ax1 + 0.01, b1 - 0.02)], fill=255)
    fins_back = np.maximum(fins_back, poly_mask(anal))
    # pelvic (under belly), pectoral (on body near gill)
    pvx = xn0 + (xp - xn0) * 0.42
    _, bp = th_at(pvx)
    pel = poly_mask(lambda d: d.polygon([P(pvx - 0.03, bp - 0.02), P(pvx + 0.02, bp + 0.09 * hmax * 4), P(pvx + 0.05, bp + 0.05 * hmax * 4), P(pvx + 0.04, bp - 0.02)], fill=255))
    fins_back = np.maximum(fins_back, pel)
    pcx = xn0 + (xp - xn0) * 0.2
    tp, bpc = th_at(pcx)
    pcy = tp + (bpc - tp) * 0.68
    pl = 0.07 + hmax * 0.12
    pec = poly_mask(lambda d: d.polygon([P(pcx, pcy - 0.012)] + [P(pcx + pl * math.cos(a), pcy + pl * 1.6 * math.sin(a)) for a in np.linspace(-0.05, 0.75, 9)] + [P(pcx, pcy + 0.014)], fill=255))
    fins_front = pec

    # ray texture: lines radiating
    ang = np.arctan2((Y[:, None] - cy) * H, (X[None, :] - xp + 0.05) * W)
    rays = 0.78 + 0.22 * np.sin(ang * 90)
    rays2 = 0.8 + 0.2 * np.sin((X[None, :] * W) * 0.35)

    # ---- body colors
    vn = np.clip((yy - top[None, :]) / np.maximum(bot - top, 1e-4)[None, :], 0, 1)  # 0 top..1 bottom
    back = C(sp['back']); side = C(sp['side']); belly = C(sp['belly'])
    colr = np.where(vn[..., None] < 0.45, lerp(back, side, smoothstep(0.0, 0.45, vn)[..., None]), lerp(side, belly, smoothstep(0.45, 0.85, vn)[..., None]))
    # cylindrical shading + spec
    shade = 0.78 + 0.32 * np.sin(np.clip(vn, 0, 1) * math.pi) - 0.12 * smoothstep(0.85, 1.0, vn)
    spec = np.exp(-((vn - 0.3) / 0.07) ** 2) * 0.22
    noise = fbm(W, H, 30, 4, r)
    colr = colr * (shade[..., None] * (0.92 + 0.16 * noise[..., None])) + 255 * spec[..., None]

    # scales
    sc = sp.get('scales', 1.0)
    if sc > 0:
        ssz = (0.018 + 0.006 * sc) * W
        u = (X[None, :] * W) / ssz
        v = (Y[:, None] * H) / (ssz * 0.8)
        row = np.floor(v)
        uu = u + (row % 2) * 0.5
        fu = uu - np.floor(uu)
        fv = v - row
        dd = np.sqrt((fu - 0.15) ** 2 + (fv - 0.5) ** 2 * 1.2)
        edge = smoothstep(0.42, 0.52, dd) * smoothstep(0.66, 0.54, dd)
        inner = smoothstep(0.5, 0.0, dd)
        amt = min(1.0, sc) * (0.16 + 0.2 * (sp.get('pattern') == 'scaleedge'))
        mul = (1 - edge[..., None] * amt) * (1 + inner[..., None] * amt * 0.35)
        if sc > 1.2:
            mul = (1 - edge[..., None] * amt * 1.3) * (1 + inner[..., None] * amt * 0.5)
        colr = colr * mul
    # patterns
    pat = sp.get('pattern')
    bodyx = (X[None, :] - xn0) / (xp - xn0)
    if pat == 'bars':
        bars = 0.5 + 0.5 * np.sin(bodyx * math.pi * 2 * 6.5 + 1.2 + 0.4 * np.sin(vn * 5))
        bm = smoothstep(0.55, 0.8, bars) * smoothstep(0.85, 0.3, vn) * smoothstep(0.08, 0.25, bodyx)
        colr = lerp(colr, C(sp.get('barc', '#202020')) * shade[..., None], bm[..., None] * 0.7)
    if pat in ('spots_light', 'spots_light_pink'):
        sn = fbm(W, H, 40, 3, r, aspect=1.4)
        sm = smoothstep(0.6, 0.66, sn) * smoothstep(0.92, 0.6, vn) * smoothstep(0.1, 0.25, bodyx)
        cc = C('#e8e4b0') if pat == 'spots_light' else C('#f4b0a0')
        colr = lerp(colr, cc * shade[..., None], sm[..., None] * 0.75)
        if pat == 'spots_light':
            stripes = 0.5 + 0.5 * np.sin(bodyx * 70 + vn * 6 + sn * 8)
            colr = colr * (1 - (smoothstep(0.75, 0.95, stripes) * smoothstep(0.8, 0.2, vn) * 0.15))[..., None]
    if pat in ('spots_dark', 'spots_red', 'spots_x', 'spots_x_small', 'spots_dark_line'):
        def dots(n, rmin, rmax, colh, vmax, alpha, ring=None):
            nonlocal colr
            lay = Image.new('L', (W, H), 0)
            dd_ = ImageDraw.Draw(lay)
            ringl = Image.new('L', (W, H), 0)
            rd = ImageDraw.Draw(ringl)
            for _ in range(n):
                bx = r.uniform(xn0 + (xp - xn0) * 0.12, xp - 0.01)
                tt, bb = th_at(bx)
                if bb - tt < 0.01:
                    continue
                by = tt + (bb - tt) * r.uniform(0.05, vmax)
                rr = r.uniform(rmin, rmax) * SS
                if pat.startswith('spots_x'):
                    dd_.line([bx * W - rr, by * H - rr, bx * W + rr, by * H + rr], fill=255, width=int(rr * 0.6))
                    dd_.line([bx * W - rr, by * H + rr, bx * W + rr, by * H - rr], fill=255, width=int(rr * 0.6))
                else:
                    if ring:
                        rd.ellipse([bx * W - rr * 1.6, by * H - rr * 1.6, bx * W + rr * 1.6, by * H + rr * 1.6], fill=255)
                    dd_.ellipse([bx * W - rr, by * H - rr, bx * W + rr, by * H + rr], fill=255)
            if ring:
                rmk = np.asarray(ringl, np.float32) / 255
                colr = lerp(colr, C(ring) * shade[..., None], rmk[..., None] * alpha * 0.7)
            m = np.asarray(lay, np.float32) / 255
            colr = lerp(colr, C(colh) * shade[..., None], m[..., None] * alpha)
        if pat == 'spots_red':
            dots(70, 4, 9, '#2a2018', 0.55, 0.85)
            dots(30, 4, 8, '#d0402a', 0.7, 0.9, ring='#f0e8d0')
        elif pat == 'spots_x':
            dots(90, 6, 12, '#1e1a16', 0.7, 0.85)
        elif pat == 'spots_x_small':
            dots(60, 4, 8, '#1e2830', 0.5, 0.8)
        elif pat == 'spots_dark_line':
            for i in range(8):
                bx = xn0 + (xp - xn0) * (0.2 + i * 0.09)
                tt, bb = th_at(bx)
                cyy = tt + (bb - tt) * 0.5
                m = np.exp(-(((X[None, :] - bx) * W) ** 2 + ((Y[:, None] - cyy) * H) ** 2) / (2 * (9 * SS) ** 2))
                colr = lerp(colr, C('#3a3a2a'), (m * 0.8)[..., None])
            dots(50, 2, 4, '#3a3828', 0.4, 0.7)
        else:
            dots(80, 3, 7, '#25221a', 0.6, 0.75)
    if pat == 'rainbow':
        band = np.exp(-((vn - 0.5) / 0.12) ** 2) * smoothstep(0.05, 0.2, bodyx)
        colr = lerp(colr, C('#e0607a') * shade[..., None], band[..., None] * 0.65)
        sn = fbm(W, H, 60, 2, r)
        sm = smoothstep(0.66, 0.7, sn) * smoothstep(0.75, 0.1, vn)
        colr = lerp(colr, C('#202018'), sm[..., None] * 0.8)
    if pat in ('mottled',):
        mn = fbm(W, H, 18, 5, r)
        mm = smoothstep(0.5, 0.62, mn) * smoothstep(0.95, 0.4, vn)
        colr = lerp(colr, C(sp['back']) * 0.7, mm[..., None] * 0.8)
        mm2 = smoothstep(0.42, 0.34, mn) * smoothstep(0.9, 0.3, vn)
        colr = lerp(colr, C(sp['side']) * 1.25, mm2[..., None] * 0.5)
    if pat == 'stripes_long':
        st = np.exp(-((vn - 0.42) / 0.06) ** 2) + 0.6 * np.exp(-((vn - 0.22) / 0.04) ** 2)
        colr = lerp(colr, C('#2a2014'), np.clip(st, 0, 1)[..., None] * 0.75)
    if pat == 'scutes':
        for row_v, cnt, sz in ((0.08, 13, 10), (0.5, 30, 6), (0.86, 12, 6)):
            for i in range(cnt):
                bx = xn0 + (xp - xn0) * (0.22 + 0.76 * i / cnt)
                tt, bb = th_at(bx)
                by = tt + (bb - tt) * row_v
                m = np.exp(-(((X[None, :] - bx) * W) ** 2 + ((Y[:, None] - by) * H) ** 2 * 1.4) / (2 * (sz * SS) ** 2))
                colr = lerp(colr, C('#f0eadc') * shade[..., None] * 1.1, (m * 0.85)[..., None])
    if sp.get('flush'):
        fl = np.exp(-((vn - 0.55) / 0.2) ** 2) * smoothstep(0.3, 0.8, bodyx)
        colr = lerp(colr, C(sp['flush']) * shade[..., None], fl[..., None] * 0.35)
    if fid == 'zolotaya':
        sparkle = smoothstep(0.78, 0.82, fbm(W, H, 120, 2, r))
        colr = colr + sparkle[..., None] * 120

    # lateral line
    lat_y = top + (bot - top) * 0.36
    lat = np.exp(-((yy - lat_y[None, :]) * H / (1.2 * SS)) ** 2) * smoothstep(0.18, 0.3, bodyx) * smoothstep(1.0, 0.9, bodyx)
    colr = colr * (1 - lat[..., None] * 0.35)

    # gill cover
    gx = xn0 + (xp - xn0) * 0.2 * (1.3 if sp.get('bighead') else 1)
    gt, gb = th_at(gx)
    gill = np.zeros((H, W), np.float32)
    for k, off in enumerate((0, 0.012)):
        cxg = gx - 0.05 - off
        rr = (gb - gt) * 0.5
        dd = np.sqrt(((X[None, :] - cxg) * W / H / 0.55) ** 2 + (Y[:, None] - (gt + gb) / 2) ** 2)
        ring = np.exp(-((dd - rr * 0.95) * H / (2.2 * SS)) ** 2) * (X[None, :] > cxg)
        gill += ring * (0.5 if k == 0 else 0.25)
    colr = colr * (1 - np.clip(gill, 0, 0.6)[..., None])
    headdark = smoothstep(gx + 0.02, xn0, X[None, :]) * 0.12
    colr = colr * (1 - headdark[..., None])

    # ---- fins coloring
    finc = C(sp['fin'])
    fins_col = finc * rays[..., None] * (0.85 + 0.25 * noise[..., None])
    if sp.get('fin2'):
        lower = (Y[:, None] > cy) * np.ones((1, W))
        fins_col = np.where(lower[..., None] > 0, C(sp['fin2']) * rays[..., None], fins_col)
    if sp.get('tailc'):
        tz = (X[None, :] > xp) * np.ones((H, 1))
        fins_col = np.where(tz[..., None] > 0, C(sp['tailc']) * rays[..., None], fins_col)
    if sp.get('dorsal_col'):
        fins_col = lerp(fins_col, C(sp['dorsal_col']) * rays[..., None], dorsal_mask[..., None] * 0.8)
    if sp.get('spot_dorsal'):
        sn2 = fbm(W, H, 50, 2, r)
        spm = smoothstep(0.62, 0.68, sn2) * dorsal_mask
        if fid == 'okun':
            spm = dorsal_mask * np.exp(-((X[None, :] - (dx0 + (dx1 - dx0) * 0.42)) * W / (14 * SS)) ** 2) * (Y[:, None] < cy - hmax * 0.6)
        fins_col = lerp(fins_col, C('#141414'), spm[..., None] * 0.8)
    if sp.get('finedge'):
        er = blur(np.clip(fins_back, 0, 1), 3)
        edge_f = np.clip(fins_back - er * 0.98, 0, 1) * 3
        fins_col = lerp(fins_col, C('#ffffff'), np.clip(edge_f, 0, 1)[..., None])
    fin_alpha = fins_back * 0.88
    fin_alpha *= (0.85 + 0.15 * rays)

    # ---- compose
    out = np.zeros((H, W, 3), np.float32)
    a = np.zeros((H, W), np.float32)
    out = blend(out, fins_col, fin_alpha); a = np.maximum(a, fin_alpha)
    # outline for fins
    out = blend(out, colr, body); a = np.maximum(a, body)
    # pectoral over body
    pec_col = finc * 1.05 * rays[..., None]
    out = blend(out, pec_col, fins_front * 0.6); a = np.maximum(a, fins_front * 0.7)

    # snout features
    lay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ld = ImageDraw.Draw(lay)
    et, eb = th_at(xn0 + (xp - xn0) * 0.09)
    ex = xn0 + (xp - xn0) * (0.085 if not sp.get('snout') else 0.16)
    if sp.get('snout') == 'duck':
        ex = xn0 + (xp - xn0) * 0.14
    et, eb = th_at(ex)
    ey = et + (eb - et) * 0.38
    er_ = hmax * H * (0.15 if not sp.get('bighead') else 0.12)
    er_ = min(max(er_, 7 * SS), 15 * SS)
    if fid in ('som', 'nalim', 'vyun'):
        er_ *= 0.55
    # mouth
    mx0 = xn0
    my = cy + (0.04 if not sp.get('upmouth') else -0.02) * hmax * 2
    mlen = (0.05 if not sp.get('bighead') else 0.09) * (xp - xn0)
    if sp.get('snout') == 'duck':
        mlen = 0.12 * (xp - xn0)
    if sp.get('smallmouth'):
        mlen *= 0.5
    if sp.get('snout') not in ('sturgeon', 'beluga'):
        ld.line([P(mx0 + 0.004, my), P(mx0 + mlen, my + 0.012)], fill=(30, 20, 15, 220), width=3 * SS)
        ld.line([P(mx0 + mlen, my + 0.012), P(mx0 + mlen + 0.006, my + 0.002)], fill=(30, 20, 15, 160), width=2 * SS)
    else:
        mxs = xn0 + (xp - xn0) * 0.13
        _, bmy = th_at(mxs)
        ld.ellipse([mxs * W - 14 * SS, bmy * H - 4 * SS, mxs * W + 14 * SS, bmy * H + 4 * SS], fill=(40, 30, 25, 230))
    if sp.get('fangs'):
        for k in range(3):
            fx = (mx0 + mlen * (0.3 + 0.25 * k)) * W
            ld.polygon([(fx, my * H + 2), (fx + 3 * SS, my * H + 2), (fx + 1.5 * SS, my * H + 9 * SS)], fill=(245, 240, 230, 255))
    if sp.get('barbel'):
        bl = sp['barbel'] * W
        bx0, by0 = (mx0 + mlen * 0.6) * W, (my + 0.012) * H
        if fid == 'som':
            ld.line([(bx0, by0 - 6 * SS), (bx0 - bl * 0.1, by0 + bl * 0.25), (bx0 + bl * 0.3, by0 + bl * 0.55), (bx0 + bl * 0.9, by0 + bl * 0.75)], fill=(40, 38, 30, 255), width=4 * SS, joint='curve')
            ld.line([(bx0 + 10, by0), (bx0 + 20, by0 + bl * 0.15)], fill=(40, 38, 30, 255), width=2 * SS)
        else:
            ld.line([(bx0, by0), (bx0 - bl * 0.2, by0 + bl * 0.6), (bx0 + bl * 0.2, by0 + bl)], fill=(80, 60, 40, 230), width=2 * SS, joint='curve')
            if sp.get('snout') in ('sturgeon', 'beluga'):
                for k in range(4):
                    ld.line([(bx0 - 30 * SS + k * 6 * SS, by0 + 6 * SS), (bx0 - 30 * SS + k * 6 * SS, by0 + bl * 0.5)], fill=(200, 180, 150, 230), width=2 * SS)
    if sp.get('chin'):
        ld.line([((mx0 + mlen * 0.8) * W, (cy + hmax * 0.6) * H), ((mx0 + mlen * 0.6) * W, (cy + hmax * 1.4) * H)], fill=(60, 50, 30, 255), width=3 * SS)
    # eye
    exp_, eyp = ex * W, ey * H
    ld.ellipse([exp_ - er_ * 1.25, eyp - er_ * 1.25, exp_ + er_ * 1.25, eyp + er_ * 1.25], fill=(30, 26, 20, 120))
    ic = tuple(int(v) for v in C(sp['eye'])) + (255,)
    ld.ellipse([exp_ - er_, eyp - er_, exp_ + er_, eyp + er_], fill=ic)
    ld.ellipse([exp_ - er_ * 0.55, eyp - er_ * 0.55, exp_ + er_ * 0.55, eyp + er_ * 0.55], fill=(8, 8, 10, 255))
    ld.ellipse([exp_ - er_ * 0.55, eyp - er_ * 0.7, exp_ - er_ * 0.1, eyp - er_ * 0.25], fill=(255, 255, 255, 230))
    ld.ellipse([exp_ + er_ * 0.2, eyp + er_ * 0.15, exp_ + er_ * 0.4, eyp + er_ * 0.35], fill=(255, 255, 255, 140))
    if sp.get('crown'):
        cx_, cyc = (xn0 + (xp - xn0) * 0.2) * W, (cy - hmax * 1.25) * H
        s = 44 * SS
        ld.polygon([(cx_ - s, cyc), (cx_ - s * 0.9, cyc - s * 0.9), (cx_ - s * 0.45, cyc - s * 0.35), (cx_, cyc - s * 1.1), (cx_ + s * 0.45, cyc - s * 0.35), (cx_ + s * 0.9, cyc - s * 0.9), (cx_ + s, cyc)], fill=(255, 210, 60, 255), outline=(170, 110, 20, 255), width=3 * SS)
        for k in (-0.9, 0, 0.9):
            ld.ellipse([cx_ + k * s - 5 * SS, cyc - (1.1 if k == 0 else 0.9) * s - 5 * SS, cx_ + k * s + 5 * SS, cyc - (1.1 if k == 0 else 0.9) * s + 5 * SS], fill=(230, 40, 60, 255))
    la = np.asarray(lay, np.float32)
    out = blend(out, la[..., :3], la[..., 3] / 255)
    a = np.maximum(a, la[..., 3] / 255)

    # outline
    am = np.clip(a, 0, 1)
    ab = blur(am, 2.0)
    outline = np.clip((ab - am * 0.9), 0, 1) * 1.4
    out = lerp(out, C('#141210'), np.clip(outline, 0, 1)[..., None] * 0.0) * 1.0
    edge = np.clip(am - blur(am, 1.5) + 0.0, 0, 1)
    out = out * (1 - np.clip(edge * 2.5, 0, 0.6)[..., None])
    rgba = np.dstack([np.clip(out, 0, 255), np.clip(am * 255, 0, 255)])
    im = Image.fromarray(rgba.astype(np.uint8), 'RGBA').resize((FW, FH), Image.LANCZOS)
    # trim transparent margins to a fixed canvas, keep centered
    return im


if __name__ == '__main__':
    ids = sys.argv[1:] or list(SPEC)
    for fid in ids:
        im = render_fish(fid, SPEC[fid])
        p = os.path.join(OUT, fid + '.png')
        im.save(p, optimize=True)
        print(fid, os.path.getsize(p) // 1024, 'KB')
