"""Detailed item icons: rods, reels, lines, hooks, baits, lures, groundbait, gear, junk.
Output: assets/items/<id>.png 192x192 RGBA (junk also 384x384)."""
import os, math, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from common import *

S = 192
K = 4
N = S * K
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'items')
os.makedirs(OUT, exist_ok=True)


class Canvas:
    def __init__(self, n=N):
        self.n = n
        self.rgb = np.zeros((n, n, 3), np.float32)
        self.a = np.zeros((n, n), np.float32)
        self.X = np.arange(n)[None, :].astype(np.float32)
        self.Y = np.arange(n)[:, None].astype(np.float32)

    def mask(self, fn):
        im = Image.new('L', (self.n, self.n), 0)
        fn(ImageDraw.Draw(im))
        return np.asarray(im, np.float32) / 255.0

    def put(self, m, color, alpha=1.0):
        if isinstance(color, str):
            color = col(color)
        m = np.clip(m * alpha, 0, 1)
        self.rgb = blend(self.rgb, color, m)
        self.a = np.maximum(self.a, m)

    def lin(self, c1, c2, x0, y0, x1, y1):
        dx, dy = x1 - x0, y1 - y0
        L2 = dx * dx + dy * dy
        t = np.clip(((self.X - x0) * dx + (self.Y - y0) * dy) / L2, 0, 1)
        return lerp(col(c1), col(c2), t[..., None])

    def rad(self, c1, c2, cx, cy, r):
        d = np.sqrt((self.X - cx) ** 2 + (self.Y - cy) ** 2) / r
        return lerp(col(c1), col(c2), np.clip(d, 0, 1)[..., None])

    def poly(self, pts, color, alpha=1.0):
        m = self.mask(lambda d: d.polygon([(x * K, y * K) for x, y in pts], fill=255))
        self.put(m, color, alpha)
        return m

    def ell(self, x0, y0, x1, y1, color, alpha=1.0):
        m = self.mask(lambda d: d.ellipse([x0 * K, y0 * K, x1 * K, y1 * K], fill=255))
        self.put(m, color, alpha)
        return m

    def line(self, pts, w, color, alpha=1.0, joint='curve'):
        m = self.mask(lambda d: d.line([(x * K, y * K) for x, y in pts], fill=255, width=int(w * K), joint=joint))
        self.put(m, color, alpha)
        return m

    def rrect(self, x0, y0, x1, y1, r, color, alpha=1.0):
        m = self.mask(lambda d: d.rounded_rectangle([x0 * K, y0 * K, x1 * K, y1 * K], r * K, fill=255))
        self.put(m, color, alpha)
        return m

    def save(self, name, size=S, shadow=True):
        rgb, a = self.rgb, self.a
        if shadow:
            sh = blur(np.roll(a, (6 * K, 4 * K), axis=(0, 1)), 5 * K) * 0.45
            out_a = np.maximum(a, sh)
            rgb = np.where(a[..., None] > 0.001, rgb, 0)
            comp = rgb * a[..., None] / np.maximum(out_a[..., None], 1e-4)
            a = out_a
            rgb = comp
        # edge darkening for definition
        im = Image.fromarray(np.dstack([np.clip(rgb, 0, 255), np.clip(a * 255, 0, 255)]).astype(np.uint8), 'RGBA')
        im = im.resize((size, size), Image.LANCZOS)
        im.save(os.path.join(OUT, name + '.png'), optimize=True)


def shade_cyl(c, m, x0, y0, x1, y1, base, dark, light):
    """Fill mask with a cylindrical shading across direction perpendicular to (x0,y0)->(x1,y1)."""
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy)
    nx, ny = -dy / L, dx / L
    d = (c.X / K - x0) * nx + (c.Y / K - y0) * ny
    w = np.abs(d).max() if False else None
    return d


def stick(c, x0, y0, x1, y1, w0, w1, c_dark, c_mid, c_light):
    """Tapered shaded cylinder from (x0,y0) w0 to (x1,y1) w1."""
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy)
    ux, uy = dx / L, dy / L
    nx, ny = -uy, ux
    pts = [(x0 + nx * w0 / 2, y0 + ny * w0 / 2), (x1 + nx * w1 / 2, y1 + ny * w1 / 2), (x1 - nx * w1 / 2, y1 - ny * w1 / 2), (x0 - nx * w0 / 2, y0 - ny * w0 / 2)]
    m = c.mask(lambda d: d.polygon([(x * K, y * K) for x, y in pts], fill=255))
    t = np.clip(((c.X / K - x0) * ux + (c.Y / K - y0) * uy) / L, 0, 1)
    wloc = w0 + (w1 - w0) * t
    s = ((c.X / K - x0) * nx + (c.Y / K - y0) * ny) / np.maximum(wloc / 2, 0.01)
    s = np.clip(s, -1, 1)
    cd, cm, cl = col(c_dark), col(c_mid), col(c_light)
    colr = np.where(s[..., None] < -0.2, lerp(cl, cm, ((s + 1) / 0.8)[..., None]), lerp(cm, cd, ((s + 0.2) / 1.2)[..., None]))
    spec = np.exp(-((s + 0.55) / 0.12) ** 2)[..., None] * 90
    c.put(m, colr + spec)
    return m


# ---------------------------------------------------------------- rods
def rod(name, kind, blank, handle, accent, tier):
    c = Canvas()
    x0, y0, x1, y1 = 30, 172, 178, 14
    # blank
    stick(c, 70, 128, x1, y1, 11, 3.5, '#101010', blank, '#ffffff')
    # guides
    for i, t in enumerate([0.18, 0.36, 0.52, 0.66, 0.78, 0.88, 0.96]):
        gx = 70 + (x1 - 70) * t
        gy = 128 + (y1 - 128) * t
        rr = 7 - t * 3.5
        c.ell(gx - rr + 3, gy - rr + 3, gx + rr + 3, gy + rr + 3, '#c9ccd2')
        c.ell(gx - rr * 0.55 + 3, gy - rr * 0.55 + 3, gx + rr * 0.55 + 3, gy + rr * 0.55 + 3, '#2b2e33')
    # tip colour (feeder quiver)
    if kind == 'feeder':
        stick(c, 70 + (x1 - 70) * 0.86, 128 + (y1 - 128) * 0.86, x1, y1, 3, 2, '#601010', accent, '#ffe0d0')
    # handle
    hcol = {'cork': ('#6b4a24', '#c89a5a', '#f2d29a'), 'eva': ('#101010', '#3a3a3a', '#8a8a8a'), 'wood': ('#3a2010', '#8a5a2a', '#d2a060')}[handle]
    stick(c, x0, y0, 72, 126, 19, 15, *hcol)
    if handle == 'cork':
        for t in np.linspace(0.05, 0.95, 9):
            px, py = x0 + (72 - x0) * t, y0 + (126 - y0) * t
            c.line([(px - 5, py - 4), (px + 5, py + 4)], 1.0, '#8a6030', 0.6)
    # reel seat
    stick(c, 50, 150, 68, 131, 18, 18, '#202020', accent, '#ffffff')
    # butt cap
    c.ell(x0 - 8, y0 - 8, x0 + 8, y0 + 8, '#1a1a1a')
    c.ell(x0 - 5, y0 - 6, x0 + 3, y0 + 1, '#5a5a5a')
    # winding rings
    for t in (0.0, 0.07):
        gx = 70 + (x1 - 70) * t
        gy = 128 + (y1 - 128) * t
        c.line([(gx - 6, gy - 5), (gx + 6, gy + 5)], 2.5, accent)
    if kind == 'float':
        # float hanging from tip
        c.line([(x1, y1), (x1 + 2, 70)], 0.8, '#e8e8e8', 0.8)
        c.ell(x1 - 3, 70, x1 + 7, 98, '#f2f2f2')
        c.ell(x1 - 3, 70, x1 + 7, 82, '#e83a2a')
        c.line([(x1 + 2, 62), (x1 + 2, 72)], 2, '#e83a2a')
    if kind == 'spin':
        c.line([(x1, y1), (x1 - 4, 60)], 0.8, '#e8e8e8', 0.8)
        lure_spoon(c, x1 - 14, 58, 0.55)
    # tier stars
    for i in range(tier):
        sx, sy = 16 + i * 20, 20
        star(c, sx, sy, 9, '#ffd04a')
    c.save(name)


def star(c, x, y, r, color):
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * 0.45
        pts.append((x + math.cos(a) * rr, y + math.sin(a) * rr))
    c.poly([(px + 1, py + 1.5) for px, py in pts], '#5a3a00', 0.6)
    c.poly(pts, color)
    c.poly([(x + (px - x) * 0.5, y + (py - y) * 0.5 - 1) for px, py in pts], '#fff4c0', 0.6)


# ---------------------------------------------------------------- reels
def reel(name, body, spool, accent, tier, size=1.0):
    c = Canvas()
    cx, cy = 96, 100
    s = size
    # foot
    c.rrect(cx - 10, 26, cx + 10, 60, 5, '#2a2a2a')
    c.rrect(cx - 34, 20, cx + 34, 32, 5, '#3a3a3a')
    c.rrect(cx - 30, 22, cx + 30, 27, 3, '#7a7a7a', 0.7)
    # body
    m = c.ell(cx - 46 * s, cy - 44 * s, cx + 46 * s, cy + 44 * s, '#000')
    c.put(m, c.rad('#ffffff', body, cx - 20, cy - 25, 30) * 0 + c.lin('#ffffff', body, cx - 50, cy - 50, cx, cy) * 0.0 + c.rad(body, '#111111', cx - 15, cy - 20, 95))
    c.ell(cx - 34 * s, cy - 32 * s, cx + 34 * s, cy + 32 * s, '#111', 0.5)
    m2 = c.ell(cx - 30 * s, cy - 28 * s, cx + 30 * s, cy + 28 * s, '#000')
    c.put(m2, c.rad('#ffffff', spool, cx - 10, cy - 12, 50))
    # line wraps
    for i in range(10):
        r = 26 * s - i * 1.6
        c.mask(lambda d: None)
    ring = c.ell(cx - 22 * s, cy - 20 * s, cx + 22 * s, cy + 20 * s, accent)
    c.ell(cx - 10 * s, cy - 9 * s, cx + 10 * s, cy + 9 * s, '#d8d8d8')
    c.ell(cx - 5 * s, cy - 5 * s, cx + 3 * s, cy + 2 * s, '#ffffff', 0.8)
    # handle arm
    c.line([(cx, cy), (cx + 52, cy + 40)], 8, '#2a2a2a')
    c.line([(cx, cy), (cx + 52, cy + 40)], 3, '#8a8a8a', 0.8)
    c.rrect(cx + 44, cy + 32, cx + 72, cy + 58, 10, accent)
    c.rrect(cx + 48, cy + 35, cx + 60, cy + 44, 5, '#ffffff', 0.4)
    # drag knob top
    c.rrect(cx - 16, cy - 64 * s, cx + 16, cy - 40 * s, 4, '#1a1a1a')
    for i in range(6):
        c.line([(cx - 13 + i * 5.2, cy - 62 * s), (cx - 13 + i * 5.2, cy - 42 * s)], 1.2, '#555555')
    for i in range(tier):
        star(c, 16 + i * 16, 176, 7, '#ffd04a')
    c.save(name)


# ---------------------------------------------------------------- lines
def line_spool(name, linec, rimc, braid, label):
    c = Canvas()
    cx, cy = 96, 96
    m = c.ell(cx - 80, cy - 80, cx + 80, cy + 80, '#000')
    c.put(m, c.rad(rimc, '#101010', cx - 30, cy - 30, 150))
    c.ell(cx - 70, cy - 70, cx + 70, cy + 70, '#000', 0.35)
    m = c.ell(cx - 66, cy - 66, cx + 66, cy + 66, '#000')
    c.put(m, c.rad('#ffffff', linec, cx - 25, cy - 25, 110))
    # windings
    for i in range(18):
        r = 64 - i * 1.9
        a0 = i * 0.7
        pts = [(cx + math.cos(a) * r, cy + math.sin(a) * r) for a in np.linspace(a0, a0 + 4.5, 40)]
        c.line(pts, 1.2 if not braid else 1.8, '#000000' if i % 2 else '#ffffff', 0.08 if not braid else 0.16)
    if braid:
        for i in range(60):
            a = i / 60 * math.tau
            c.line([(cx + math.cos(a) * 34, cy + math.sin(a) * 34), (cx + math.cos(a + 0.1) * 64, cy + math.sin(a + 0.1) * 64)], 1, '#000000', 0.12)
    m = c.ell(cx - 30, cy - 30, cx + 30, cy + 30, '#000')
    c.put(m, c.rad('#ffffff', rimc, cx - 10, cy - 10, 45))
    c.ell(cx - 10, cy - 10, cx + 10, cy + 10, '#202020')
    c.ell(cx - 22, cy - 26, cx + 2, cy - 14, '#ffffff', 0.45)
    # loose end
    c.line([(cx + 60, cy + 30), (cx + 80, cy + 60), (cx + 70, cy + 84)], 1.5, linec)
    c.save(name)


# ---------------------------------------------------------------- hooks
def hook(name, size, colr, count):
    c = Canvas()
    for k in range(count):
        ox = (k - (count - 1) / 2) * 34
        sc = size
        cx, cy = 96 + ox, 96
        top = cy - 62 * sc
        pts = [(cx + 16 * sc, top + 6 * sc)]
        pts += [(cx + 16 * sc, cy + 20 * sc)]
        pts += [(cx + 16 * sc * math.cos(a), cy + 20 * sc + 22 * sc * math.sin(a)) for a in np.linspace(0, math.pi, 16)]
        pts += [(cx - 16 * sc, cy + 2 * sc)]
        c.line(pts, 5.5 * sc, '#1a1a1a')
        c.line(pts, 3.2 * sc, colr)
        c.line([(p[0] - 1, p[1] - 1) for p in pts[:3]], 1.2 * sc, '#ffffff', 0.6)
        # barb and point
        c.poly([(cx - 16 * sc - 2, cy + 6 * sc), (cx - 16 * sc, cy - 10 * sc), (cx - 16 * sc + 3, cy + 6 * sc)], colr)
        c.poly([(cx - 16 * sc, cy + 2 * sc), (cx - 10 * sc, cy + 12 * sc), (cx - 14 * sc, cy + 10 * sc)], '#1a1a1a')
        # eye
        c.ell(cx + 9 * sc, top - 8 * sc, cx + 23 * sc, top + 6 * sc, '#1a1a1a')
        c.ell(cx + 12 * sc, top - 5 * sc, cx + 20 * sc, top + 3 * sc, '#000', 0)
        m = c.ell(cx + 12.5 * sc, top - 4.5 * sc, cx + 19.5 * sc, top + 2.5 * sc, '#000')
        c.a = np.where(m > 0.5, 0, c.a)
    c.save(name)


# ---------------------------------------------------------------- baits
def bait_worm(name, colr='#b84a4a', segs=True, thin=1.0):
    c = Canvas()
    pts = [(40 + i * 3.2, 96 + math.sin(i * 0.35) * 36 * math.sin(i * 0.05 + 0.5)) for i in range(38)]
    c.line([(x + 3, y + 4) for x, y in pts], 20 * thin, '#000', 0.25)
    c.line(pts, 20 * thin, colr)
    c.line([(x - 1, y - 4 * thin) for x, y in pts], 6 * thin, '#ffffff', 0.25)
    if segs:
        for i in range(2, 36, 2):
            x, y = pts[i]
            c.ell(x - 1, y - 9 * thin, x + 1, y + 9 * thin, '#000', 0.18)
    x, y = pts[12]
    c.ell(x - 12, y - 12 * thin, x + 12, y + 12 * thin, '#e08a7a', 0.8)
    c.save(name)


def bait_maggot(name, colr='#f4ecd0', count=5, small=False):
    c = Canvas()
    r = rng(len(name))
    for k in range(count):
        cx, cy = 50 + r.random() * 90, 50 + r.random() * 90
        ang = r.random() * math.pi
        L = 46 if not small else 24
        w = 18 if not small else 7
        x0, y0 = cx - math.cos(ang) * L / 2, cy - math.sin(ang) * L / 2
        x1, y1 = cx + math.cos(ang) * L / 2, cy + math.sin(ang) * L / 2
        stick(c, x0, y0, x1, y1, w, w * 0.6, '#8a7a5a' if not small else '#5a0a0a', colr, '#ffffff')
        for t in np.linspace(0.15, 0.85, 6 if not small else 4):
            px, py = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            nx, ny = -math.sin(ang), math.cos(ang)
            c.line([(px + nx * w * 0.45, py + ny * w * 0.45), (px - nx * w * 0.45, py - ny * w * 0.45)], 1.0, '#000', 0.15)
        c.ell(x0 - 2, y0 - 2, x0 + 2, y0 + 2, '#202020', 0.8)
    c.save(name)


def bait_round(name, c1, c2, count, rr, spots=None, mark=None):
    c = Canvas()
    r = rng(len(name) + 3)
    pos = [(96, 96)] if count == 1 else [(60 + r.random() * 72, 60 + r.random() * 72) for _ in range(count)]
    for (x, y) in pos:
        m = c.ell(x - rr, y - rr * 0.92, x + rr, y + rr * 0.92, '#000')
        c.put(m, c.rad(c1, c2, x - rr * 0.35, y - rr * 0.35, rr * 1.6))
        if spots:
            for _ in range(int(rr / 2)):
                a = r.random() * math.tau; d = r.random() * rr * 0.8
                c.ell(x + math.cos(a) * d - 2, y + math.sin(a) * d - 2, x + math.cos(a) * d + 2, y + math.sin(a) * d + 2, spots, 0.6)
        if mark == 'corn':
            c.poly([(x - rr * 0.3, y + rr * 0.9), (x, y + rr * 0.3), (x + rr * 0.3, y + rr * 0.9)], '#f8f0c0', 0.8)
        if mark == 'barley':
            c.line([(x, y - rr * 0.7), (x, y + rr * 0.7)], 1.5, '#7a6040', 0.6)
        c.ell(x - rr * 0.55, y - rr * 0.6, x - rr * 0.1, y - rr * 0.25, '#ffffff', 0.55)
    c.save(name)


def bait_bread(name):
    c = Canvas()
    m = c.rrect(30, 50, 162, 150, 30, '#000')
    c.put(m, c.lin('#f2d29a', '#a8682a', 30, 50, 162, 150))
    m = c.rrect(42, 62, 150, 140, 22, '#000')
    tex = fbm(N, N, 40, 3, rng(4))
    c.put(m, lerp(col('#fff4d8'), col('#e8d0a0'), tex[..., None]))
    for i in range(40):
        r = rng(i)
        x, y = 50 + r.random() * 92, 70 + r.random() * 62
        c.ell(x - 2, y - 1.5, x + 2, y + 1.5, '#c8a870', 0.7)
    c.save(name)


def bait_dough(name):
    c = Canvas()
    m = c.ell(30, 60, 162, 160, '#000')
    c.put(m, c.rad('#fff0d0', '#d8b070', 70, 80, 110))
    c.line([(60, 100), (90, 92), (120, 104), (140, 96)], 3, '#c09050', 0.5)
    c.line([(54, 124), (100, 118), (134, 128)], 3, '#c09050', 0.5)
    c.ell(60, 72, 90, 88, '#ffffff', 0.5)
    c.save(name)


def bait_grasshopper(name):
    c = Canvas()
    stick(c, 40, 110, 150, 86, 26, 16, '#2a4a10', '#7ab030', '#e0ffb0')
    c.ell(132, 72, 166, 102, '#5a9020')
    c.ell(148, 80, 156, 88, '#101010')
    c.line([(160, 76), (182, 40)], 2, '#3a5a10')
    c.line([(156, 74), (170, 34)], 2, '#3a5a10')
    c.line([(80, 100), (60, 50), (30, 130)], 6, '#4a7a18')
    c.line([(100, 100), (90, 140)], 4, '#4a7a18')
    c.line([(120, 96), (126, 140)], 4, '#4a7a18')
    c.poly([(50, 96), (130, 84), (100, 100)], '#5a8a20', 0.8)
    c.save(name)


def bait_caddis(name):
    c = Canvas()
    stick(c, 40, 120, 150, 70, 34, 30, '#3a2a14', '#8a6a3a', '#c8a878')
    r = rng(9)
    for i in range(40):
        x = 46 + r.random() * 100; y = 120 - (x - 40) * 0.45 + (r.random() - 0.5) * 24
        c.ell(x - 4, y - 3, x + 4, y + 3, r.choice(['#6a5a4a', '#a89070', '#504030']), 0.9)
    c.ell(142, 58, 172, 84, '#e8e0b0')
    c.ell(160, 62, 172, 74, '#3a2a10')
    c.save(name)


def bait_livebait(name):
    c = Canvas()
    fish = Image.open(os.path.join(os.path.dirname(__file__), '..', 'assets', 'fish', 'uklejka.png')).resize((N, N // 2), Image.LANCZOS)
    fa = np.asarray(fish, np.float32)
    rgb = np.zeros((N, N, 3), np.float32); a = np.zeros((N, N), np.float32)
    rgb[N // 4:N // 4 + N // 2] = fa[..., :3]
    a[N // 4:N // 4 + N // 2] = fa[..., 3] / 255
    c.put(a, rgb)
    c.save(name)


def bait_crayfish(name):
    c = Canvas()
    stick(c, 40, 96, 140, 96, 34, 22, '#3a1a08', '#8a4a20', '#e0a070')
    for i in range(6):
        x = 70 + i * 12
        c.line([(x, 80), (x, 112)], 1.5, '#4a2008', 0.6)
    c.poly([(140, 86), (176, 70), (178, 122), (140, 106)], '#7a3a18')
    c.line([(46, 88), (20, 50), (12, 40)], 4, '#7a3a18')
    c.line([(46, 104), (20, 140), (12, 152)], 4, '#7a3a18')
    c.ell(4, 22, 34, 50, '#9a4a20')
    c.ell(4, 142, 34, 170, '#9a4a20')
    c.line([(40, 90), (8, 70)], 1, '#3a1a08')
    c.ell(38, 86, 46, 92, '#101010')
    c.save(name)


def bait_shell(name):
    c = Canvas()
    m = c.ell(28, 50, 164, 140, '#000')
    c.put(m, c.lin('#5a6a3a', '#20301a', 28, 50, 164, 140))
    for i in range(6):
        c.ell(40 + i * 8, 58 + i * 6, 152 - i * 4, 134 - i * 2, '#000', 0)
        c.line([(36 + i * 12, 100 - i * 4), (100, 60 + i * 3)], 1, '#a0a070', 0.3)
    c.ell(56, 66, 110, 92, '#ffffff', 0.25)
    c.ell(70, 96, 140, 124, '#f0d0b0')
    c.save(name)


def bait_frog(name):
    c = Canvas()
    c.ell(46, 70, 150, 140, '#4a8a2a')
    c.ell(56, 76, 130, 120, '#7ac040', 0.8)
    c.ell(60, 60, 84, 86, '#4a8a2a'); c.ell(110, 60, 134, 86, '#4a8a2a')
    c.ell(64, 64, 80, 80, '#f0e060'); c.ell(114, 64, 130, 80, '#f0e060')
    c.ell(68, 68, 76, 78, '#101010'); c.ell(118, 68, 126, 78, '#101010')
    c.line([(50, 130), (20, 150), (30, 170)], 8, '#3a7a20')
    c.line([(146, 130), (176, 150), (166, 170)], 8, '#3a7a20')
    for i in range(10):
        r = rng(i + 50)
        x, y = 70 + r.random() * 60, 90 + r.random() * 40
        c.ell(x - 4, y - 3, x + 4, y + 3, '#2a5a18', 0.7)
    c.save(name)


# ---------------------------------------------------------------- lures
def lure_spoon(c, x, y, s, c1='#d8dce0', c2='#7a8088'):
    m = c.ell(x - 14 * s, y, x + 14 * s, y + 46 * s, '#000')
    c.put(m, c.lin('#ffffff', c2, x - 14 * s, y, x + 14 * s, y + 46 * s))
    c.ell(x - 6 * s, y + 8 * s, x + 2 * s, y + 24 * s, '#ffffff', 0.7)


def lure(name, kind, c1, c2, c3='#202020'):
    c = Canvas()
    if kind in ('spinner', 'spinner_big'):
        s = 1.2 if kind == 'spinner_big' else 1.0
        c.line([(30, 96), (170, 96)], 3, '#b0b0b0')
        m = c.ell(46, 66 - 10 * s, 104 + 10 * s, 126 + 10 * s, '#000')
        c.put(m, c.lin('#ffffff', c1, 46, 60, 110, 130))
        c.ell(60, 80, 80, 100, '#ffffff', 0.5)
        c.ell(70, 90, 86, 102, c3, 0.6)
        for i in range(3):
            c.ell(108 + i * 12, 88, 120 + i * 12, 104, c2)
        # treble hook with tuft
        c.line([(150, 96), (170, 96)], 3, '#3a3a3a')
        for dy in (-12, 0, 12):
            c.line([(170, 96), (180, 96 + dy), (172, 100 + dy)], 2.5, '#2a2a2a')
        for i in range(10):
            c.line([(150, 96), (184, 80 + i * 3.4)], 1.4, c3 if i % 2 else c2, 0.7)
        c.ell(22, 90, 34, 102, '#888888')
    elif kind == 'spoon':
        m = c.poly([(40, 96), (70, 56), (140, 60), (172, 96), (140, 132), (70, 136)], '#000')
        c.put(m, c.lin(c1, c2, 40, 56, 172, 136))
        c.poly([(60, 96), (80, 70), (130, 72), (150, 96)], '#ffffff', 0.35)
        c.line([(70, 110), (140, 110)], 3, c3, 0.6)
        c.ell(28, 90, 40, 102, '#888888')
        c.line([(172, 96), (182, 96)], 2.5, '#2a2a2a')
        for dy in (-10, 0, 10):
            c.line([(182, 96), (188, 104 + dy), (180, 108 + dy)], 2.5, '#2a2a2a')
    elif kind in ('wobbler', 'crank', 'popper'):
        if kind == 'wobbler':
            body = [(36, 96), (60, 72), (130, 70), (166, 90), (160, 104), (130, 120), (60, 118)]
        elif kind == 'crank':
            body = [(44, 96), (70, 54), (120, 50), (156, 80), (156, 112), (120, 138), (70, 136)]
        else:
            body = [(40, 76), (130, 70), (166, 92), (130, 116), (40, 116)]
        m = c.poly(body, '#000')
        c.put(m, c.lin(c1, c2, 0, 50, 0, 140))
        tex = np.sin(c.X / K * 0.8) * np.sin(c.Y / K * 0.8)
        c.put(m * (tex > 0.6), '#000000', 0.12)
        c.poly([(60, 82), (130, 78), (150, 90)], '#ffffff', 0.4)
        c.ell(48, 84, 66, 102, '#f0f0f0'); c.ell(52, 88, 62, 98, '#101010')
        if kind != 'popper':
            c.poly([(40, 100), (14, 120), (20, 126), (48, 108)], '#e8f4f8', 0.75)
        else:
            c.ell(34, 78, 46, 114, '#300808', 0.6)
        for hx in (84, 140):
            c.line([(hx, 118), (hx, 132)], 2, '#2a2a2a')
            for dx in (-7, 0, 7):
                c.line([(hx, 132), (hx + dx, 146), (hx + dx - 3, 140)], 2.2, '#2a2a2a')
        c.line([(150, 120), (176, 132)], 0, c3, 0)
    elif kind in ('twister', 'vibro'):
        stick(c, 40, 96, 110, 96, 26, 20, c2, c1, '#ffffff')
        for i in range(8):
            c.line([(48 + i * 8, 84), (48 + i * 8, 108)], 1.4, '#000', 0.2)
        if kind == 'twister':
            pts = [(110 + math.cos(a) * (20 + a * 6) * 0.9, 96 + math.sin(a) * (20 + a * 6) * 0.7) for a in np.linspace(0, 4.5, 30)]
            c.line(pts, 12, c1)
        else:
            stick(c, 108, 96, 140, 96, 18, 10, c2, c1, '#ffffff')
            c.ell(138, 72, 162, 120, c1)
        # jig head
        m = c.ell(22, 78, 56, 114, '#000')
        c.put(m, c.rad('#ffffff', c3, 30, 86, 40))
        c.ell(30, 88, 38, 96, '#f0e040'); c.ell(32, 90, 36, 94, '#101010')
        c.line([(40, 78), (80, 70), (84, 82)], 3, '#555555')
    elif kind == 'fly':
        c.line([(40, 120), (140, 120), (150, 100)], 3, '#2a2a2a')
        c.poly([(60, 116), (150, 60), (160, 70), (80, 120)], c1, 0.9)
        c.poly([(60, 116), (140, 46), (150, 54), (80, 118)], c2, 0.8)
        stick(c, 50, 120, 120, 118, 12, 8, '#2a1a0a', c3, '#c0a070')
        for i in range(12):
            c.line([(120, 118), (120 + math.cos(i * 0.5) * 22, 118 + math.sin(i * 0.5) * 22)], 1, '#a07040', 0.7)
        # bombarda float
        c.ell(150, 120, 182, 170, '#e8f4ff', 0.6)
    c.save(name)


# ---------------------------------------------------------------- groundbait bag
def groundbait(name, bagc, label_c, crumb):
    c = Canvas()
    m = c.poly([(40, 40), (152, 40), (162, 170), (30, 170)], '#000')
    c.put(m, c.lin('#ffffff', bagc, 0, 0, 192, 192) * 0.35 + c.lin(bagc, bagc, 0, 0, 1, 1) * 0.65)
    c.poly([(40, 40), (152, 40), (148, 54), (44, 54)], '#000', 0.25)
    for i in range(5):
        c.line([(48 + i * 24, 40), (46 + i * 24, 30)], 3, bagc)
    c.rrect(54, 76, 138, 136, 10, label_c)
    c.rrect(60, 82, 132, 130, 8, '#ffffff', 0.3)
    m = c.ell(70, 92, 122, 120, '#000')
    c.put(m, c.rad(crumb, '#3a2a14', 90, 100, 40))
    r = rng(len(name))
    for i in range(30):
        x, y = 36 + r.random() * 130, 164 + r.random() * 18
        c.ell(x - 3, y - 3, x + 3, y + 3, crumb, 0.9)
    c.save(name)


# ---------------------------------------------------------------- misc gear
def keepnet(name, rings, colr):
    c = Canvas()
    for i in range(rings):
        y = 40 + i * (120 / rings)
        w = 70 - i * 3
        c.ell(96 - w, y - 12, 96 + w, y + 12, '#000', 0)
        c.line([(96 - w + 4 * math.cos(a), y + 12 * math.sin(a)) for a in []] or [(96 - w, y), (96 + w, y)], 0, '#000', 0)
        pts = [(96 + w * math.cos(a), y + 12 * math.sin(a)) for a in np.linspace(0, math.tau, 40)]
        c.line(pts, 3, '#7a7a7a')
    for i in range(18):
        a = i / 18 * math.tau
        c.line([(96 + 70 * math.cos(a), 40 + 12 * math.sin(a)), (96 + (70 - rings * 3) * math.cos(a), 160 + 12 * math.sin(a))], 1.2, colr, 0.8)
    for j in range(10):
        y = 46 + j * 12
        pts = [(96 + (70 - j) * math.cos(a), y + 12 * math.sin(a)) for a in np.linspace(0, math.pi, 30)]
        c.line(pts, 1, colr, 0.6)
    c.save(name)


def landing_net(name, colr):
    c = Canvas()
    stick(c, 30, 176, 110, 96, 9, 7, '#202020', '#5a5a5a', '#c0c0c0')
    pts = [(130 + 46 * math.cos(a), 66 + 46 * math.sin(a)) for a in np.linspace(0, math.tau, 50)]
    c.line(pts, 5, '#3a3a3a')
    for i in range(14):
        a = i / 14 * math.tau
        c.line([(130 + 46 * math.cos(a), 66 + 46 * math.sin(a)), (140 + 10 * math.cos(a), 140)], 1.2, colr, 0.7)
    for j in range(5):
        pts = [(130 + 3 * j + (40 - j * 6) * math.cos(a), 80 + j * 13 + (36 - j * 5) * math.sin(a)) for a in np.linspace(0, math.pi, 30)]
        c.line(pts, 1, colr, 0.6)
    c.save(name)


def sonar(name):
    c = Canvas()
    m = c.rrect(30, 30, 162, 150, 16, '#000')
    c.put(m, c.lin('#3a3a3a', '#101010', 0, 30, 0, 150))
    m = c.rrect(42, 42, 150, 128, 8, '#000')
    c.put(m, c.lin('#0a2a4a', '#04101e', 0, 42, 0, 128))
    pts = [(42 + i * 4, 100 + math.sin(i * 0.4) * 10 + i * 0.3) for i in range(28)]
    c.poly(pts + [(150, 128), (42, 128)], '#c08030', 0.9)
    for (x, y) in [(70, 70), (100, 80), (124, 64)]:
        c.poly([(x, y), (x + 10, y - 5), (x + 16, y), (x + 10, y + 5)], '#f0e040')
    c.rrect(64, 136, 128, 146, 4, '#2a6a2a')
    c.rrect(80, 150, 112, 176, 4, '#1a1a1a')
    c.save(name)


def charm(name):
    c = Canvas()
    c.line([(96, 20), (96, 60)], 2, '#c0a040')
    m = c.ell(46, 56, 146, 156, '#000')
    c.put(m, c.rad('#fff4b0', '#b07a10', 80, 80, 90))
    c.ell(56, 66, 136, 146, '#000', 0.15)
    star(c, 96, 106, 30, '#ffe060')
    c.ell(66, 70, 96, 90, '#ffffff', 0.5)
    c.save(name)


def thermos(name):
    c = Canvas()
    stick(c, 96, 30, 96, 176, 64, 64, '#103a20', '#2a7a40', '#a0e0b0')
    c.rrect(62, 20, 130, 46, 6, '#202020')
    c.rrect(68, 60, 124, 100, 6, '#e8e0c0')
    c.line([(76, 72), (116, 72)], 3, '#7a4a20')
    c.line([(76, 84), (110, 84)], 3, '#7a4a20')
    for i in range(3):
        c.line([(80 + i * 16, 18), (86 + i * 16, 4)], 3, '#ffffff', 0.4)
    c.save(name)


def tackle_box(name):
    c = Canvas()
    m = c.rrect(26, 70, 166, 168, 10, '#000')
    c.put(m, c.lin('#3a8a4a', '#1a4a24', 0, 70, 0, 168))
    m = c.rrect(22, 52, 170, 92, 10, '#000')
    c.put(m, c.lin('#5aaa6a', '#2a6a34', 0, 52, 0, 92))
    c.rrect(70, 30, 122, 56, 8, '#2a2a2a')
    c.rrect(78, 38, 114, 52, 4, '#000', 1)
    c.rrect(84, 84, 108, 104, 4, '#e0c040')
    c.rrect(40, 110, 152, 116, 3, '#000', 0.25)
    star(c, 150, 40, 18, '#ffd04a')
    c.save(name)


def coin(name):
    c = Canvas()
    m = c.ell(30, 30, 162, 162, '#000')
    c.put(m, c.rad('#fff2a0', '#b07800', 70, 60, 130))
    c.ell(44, 44, 148, 148, '#8a5a00', 0.35)
    m = c.ell(50, 50, 142, 142, '#000')
    c.put(m, c.rad('#ffe680', '#c89010', 80, 70, 90))
    # ruble sign
    c.line([(84, 62), (84, 130)], 10, '#8a5a00')
    c.line([(84, 66), (108, 66), (118, 76), (118, 88), (108, 98), (84, 98)], 9, '#8a5a00', joint='curve')
    c.line([(70, 112), (110, 112)], 8, '#8a5a00')
    c.ell(56, 52, 90, 74, '#ffffff', 0.5)
    c.save(name)


def xp_badge(name):
    c = Canvas()
    star(c, 96, 96, 80, '#6ab0ff')
    star(c, 96, 96, 50, '#c8e4ff')
    c.save(name)


def junk_boot(name):
    c = Canvas()
    m = c.poly([(60, 20), (110, 20), (112, 120), (170, 130), (176, 166), (40, 166), (46, 110)], '#000')
    c.put(m, c.lin('#5a4a3a', '#2a2018', 40, 20, 176, 166))
    c.rrect(36, 158, 180, 176, 6, '#1a1410')
    c.line([(60, 26), (108, 26)], 4, '#3a2a1a')
    for i in range(5):
        c.line([(72, 50 + i * 12), (100, 50 + i * 12)], 2, '#b0a080', 0.8)
    c.poly([(120, 130), (150, 120), (170, 134)], '#6a8a3a', 0.8)
    c.ell(50, 100, 80, 120, '#3a6a2a', 0.6)
    c.save(name, 384)


def junk_can(name):
    c = Canvas()
    stick(c, 50, 60, 150, 140, 70, 70, '#3a3a3a', '#a8a8b0', '#ffffff')
    c.ell(122, 100, 182, 170, '#8a8a90')
    c.ell(130, 108, 174, 162, '#5a5a60')
    c.poly([(70, 66), (120, 116), (100, 136), (52, 88)], '#c83a2a', 0.85)
    m = c.ell(40, 140, 90, 170, '#6a4a2a', 0.5)
    c.save(name, 384)


def junk_snag(name):
    c = Canvas()
    stick(c, 20, 150, 170, 60, 30, 16, '#2a1a0a', '#6a4a2a', '#a07a4a')
    stick(c, 90, 108, 130, 30, 14, 6, '#2a1a0a', '#6a4a2a', '#a07a4a')
    stick(c, 60, 126, 40, 70, 12, 5, '#2a1a0a', '#6a4a2a', '#a07a4a')
    for i in range(8):
        c.line([(30 + i * 18, 142 - i * 10), (36 + i * 18, 150 - i * 10)], 2, '#1a0a00', 0.5)
    c.ell(120, 70, 150, 90, '#4a7a2a', 0.7)
    c.save(name, 384)


def junk_chest(name):
    c = Canvas()
    m = c.rrect(24, 80, 168, 168, 8, '#000')
    c.put(m, c.lin('#8a5a2a', '#4a2a10', 0, 80, 0, 168))
    m = c.poly([(24, 84)] + [(96 + 72 * math.cos(a), 84 - 40 * math.sin(a)) for a in np.linspace(math.pi, 0, 20)] + [(168, 84)], '#000')
    c.put(m, c.lin('#a06a32', '#5a3414', 0, 44, 0, 84))
    for x in (40, 152):
        c.rrect(x - 6, 50, x + 6, 168, 2, '#c8a040')
    c.rrect(24, 80, 168, 90, 2, '#c8a040')
    c.rrect(84, 90, 108, 116, 4, '#e0c050')
    c.ell(92, 98, 100, 106, '#2a1a00')
    for i in range(14):
        r = rng(i + 7)
        x, y = 40 + r.random() * 110, 70 + r.random() * 16
        c.ell(x - 8, y - 6, x + 8, y + 6, '#ffd84a')
    c.ell(60, 60, 80, 70, '#ffffff', 0.6)
    c.save(name, 384)


def junk_bottle(name):
    c = Canvas()
    stick(c, 40, 150, 120, 70, 50, 50, '#0a3a1a', '#2a8a4a', '#c0ffd0')
    stick(c, 116, 74, 158, 32, 20, 16, '#0a3a1a', '#2a8a4a', '#c0ffd0')
    c.rrect(150, 18, 172, 40, 4, '#8a5a2a')
    c.poly([(60, 110), (96, 80), (110, 96), (74, 126)], '#f0e0b0', 0.85)
    c.line([(70, 106), (98, 86)], 1.5, '#5a3a1a', 0.8)
    c.save(name, 384)


if __name__ == '__main__':
    # rods
    rod('rod_float_1', 'float', '#6a8a3a', 'wood', '#c8a050', 1)
    rod('rod_float_2', 'float', '#2a5a8a', 'cork', '#e0e0e0', 2)
    rod('rod_float_3', 'float', '#7a2a2a', 'cork', '#ffd04a', 3)
    rod('rod_float_4', 'float', '#1a1a1a', 'eva', '#ff8a2a', 4)
    rod('rod_feeder_1', 'feeder', '#3a4a5a', 'eva', '#ff4040', 1)
    rod('rod_feeder_2', 'feeder', '#2a3a2a', 'eva', '#ffe040', 2)
    rod('rod_feeder_3', 'feeder', '#4a2a5a', 'cork', '#40ff80', 3)
    rod('rod_feeder_4', 'feeder', '#101010', 'eva', '#ff60c0', 4)
    rod('rod_spin_1', 'spin', '#5a5a5a', 'eva', '#40a0ff', 1)
    rod('rod_spin_2', 'spin', '#1a3a6a', 'cork', '#e0e0e0', 2)
    rod('rod_spin_3', 'spin', '#6a1a1a', 'eva', '#ffd04a', 3)
    rod('rod_spin_4', 'spin', '#0a0a0a', 'cork', '#ff3a2a', 4)
    # reels
    reel('reel_1', '#5a6a5a', '#a0a8a0', '#c8c8c8', 1, 0.9)
    reel('reel_2', '#2a4a7a', '#b0c0d0', '#e0e0e0', 2, 0.95)
    reel('reel_3', '#7a2a2a', '#d0b0a0', '#ffd04a', 3, 1.0)
    reel('reel_4', '#1a1a1a', '#c0c0c0', '#ff8a2a', 4, 1.0)
    reel('reel_5', '#c8a040', '#fff0c0', '#202020', 5, 1.05)
    # lines
    line_spool('line_1', '#d8e8e0', '#4a7a5a', False, '0.16')
    line_spool('line_2', '#c8e0f0', '#2a5a8a', False, '0.22')
    line_spool('line_3', '#f0f0f8', '#8a2a2a', False, 'fluoro')
    line_spool('line_4', '#3a8a3a', '#2a2a2a', True, 'braid')
    line_spool('line_5', '#f0d040', '#1a1a1a', True, 'braid+')
    line_spool('line_6', '#e85a2a', '#101010', True, 'pro')
    # hooks
    hook('hook_16', 0.55, '#c8c8c8', 3)
    hook('hook_12', 0.7, '#d0a040', 2)
    hook('hook_8', 0.9, '#8a8a8a', 2)
    hook('hook_4', 1.15, '#2a2a2a', 1)
    hook('hook_1', 1.4, '#3a2a5a', 1)
    # baits
    bait_worm('bait_worm')
    bait_worm('bait_redworm', '#d0402a', True, 0.7)
    bait_maggot('bait_maggot')
    bait_maggot('bait_bloodworm', '#c01818', 12, True)
    bait_bread('bait_bread')
    bait_dough('bait_dough')
    bait_round('bait_corn', '#fff080', '#e0a010', 6, 18, mark='corn')
    bait_round('bait_barley', '#fff6e0', '#d8c090', 9, 11, mark='barley')
    bait_round('bait_pea', '#d8e890', '#7a9a30', 7, 16)
    bait_round('bait_boilie', '#ffb080', '#c04a20', 3, 30, spots='#7a2a10')
    bait_grasshopper('bait_grasshopper')
    bait_caddis('bait_caddis')
    bait_livebait('bait_livebait')
    bait_crayfish('bait_crayfish')
    bait_shell('bait_shell')
    bait_frog('bait_frog')
    # lures
    lure('lure_spinner_s', 'spinner', '#e0e0e0', '#c83a2a', '#e83a2a')
    lure('lure_spinner_l', 'spinner_big', '#ffd04a', '#202020', '#202020')
    lure('lure_spoon', 'spoon', '#ffe080', '#c08010', '#c83a2a')
    lure('lure_spoon_silver', 'spoon', '#ffffff', '#6a7a8a', '#2a6ad0')
    lure('lure_wobbler', 'wobbler', '#2a6a3a', '#f0f0d0', '#202020')
    lure('lure_crank', 'crank', '#e83a2a', '#ffe040', '#202020')
    lure('lure_popper', 'popper', '#202020', '#f0f0f0', '#e83a2a')
    lure('lure_twister', 'twister', '#f0e040', '#a0a020', '#d03a2a')
    lure('lure_vibro', 'vibro', '#7ad040', '#2a6a1a', '#f0f0f0')
    lure('lure_vibro_big', 'vibro', '#e0e0f0', '#5a5a7a', '#ff5020')
    lure('lure_fly', 'fly', '#c08a4a', '#7a5a3a', '#4a3a2a')
    # groundbait
    groundbait('gb_universal', '#c85a2a', '#f0e0b0', '#9a7040')
    groundbait('gb_roach', '#2a6ac8', '#e0f0ff', '#c0a070')
    groundbait('gb_bream', '#8a5ac8', '#f0e0ff', '#7a5a30')
    groundbait('gb_carp', '#c8a020', '#fff0b0', '#e08020')
    groundbait('gb_river', '#3a7a3a', '#e0ffe0', '#5a4a2a')
    groundbait('gb_night', '#1a2a4a', '#a0c0ff', '#3a2a14')
    # gear
    keepnet('keepnet_1', 3, '#5a7a4a')
    keepnet('keepnet_2', 5, '#3a6a8a')
    keepnet('keepnet_3', 7, '#8a5a2a')
    landing_net('net', '#c0c0c0')
    sonar('sonar')
    charm('charm')
    thermos('thermos')
    tackle_box('tacklebox')
    coin('coin')
    xp_badge('xp')
    junk_boot('junk_boot')
    junk_can('junk_can')
    junk_snag('junk_snag')
    junk_chest('junk_chest')
    junk_bottle('junk_bottle')
    print('done', len(os.listdir(OUT)))
