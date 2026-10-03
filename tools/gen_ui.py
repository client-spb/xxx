"""UI textures and the illustrated region map.
Output: assets/ui/wood.jpg, paper.jpg, map.jpg, plank.png"""
import os, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from common import *

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'ui')
os.makedirs(OUT, exist_ok=True)

# map marker positions (normalised) — mirrored in js/data.js
MAP_POS = {
    'pond': (0.20, 0.70), 'river': (0.36, 0.48), 'lake': (0.55, 0.62), 'swamp': (0.30, 0.22),
    'mountain': (0.80, 0.24), 'volga': (0.70, 0.84), 'north': (0.58, 0.14),
}


def tileable(arr):
    """Make texture tileable by mirroring blend."""
    h, w = arr.shape[:2]
    a = arr
    b = np.roll(np.roll(arr, w // 2, 1), h // 2, 0)
    yy, xx = np.mgrid[0:h, 0:w]
    m = (np.minimum(xx, w - xx) / (w / 2)) * (np.minimum(yy, h - yy) / (h / 2))
    m = np.clip(m * 2, 0, 1)
    if arr.ndim == 3:
        m = m[..., None]
    return a * m + b * (1 - m)


def wood(w=512, h=512, seed=1, base=('#3a2414', '#6a4426', '#8a5a32')):
    r = rng(seed)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    n = fbm(w, h, 4, 5, r, aspect=8)
    grain = np.sin((yy / h * 40 + n * 12) * math.pi) * 0.5 + 0.5
    fine = fbm(w, h, 64, 3, r, aspect=12)
    t = np.clip(grain * 0.6 + fine * 0.4, 0, 1)
    c1, c2, c3 = col(base[0]), col(base[1]), col(base[2])
    img = np.where(t[..., None] < 0.5, lerp(c1, c2, (t / 0.5)[..., None]), lerp(c2, c3, ((t - 0.5) / 0.5)[..., None]))
    # plank seams
    for k in range(4):
        y0 = int(k * h / 4)
        img[max(0, y0 - 2):y0 + 2] *= 0.45
        img[y0 + 2:y0 + 4] *= 1.15
    # knots
    for _ in range(3):
        cx, cy = r.uniform(0, w), r.uniform(0, h)
        d = np.sqrt(((xx - cx) / 2.2) ** 2 + (yy - cy) ** 2)
        ring = (np.sin(d * 0.8) * 0.5 + 0.5) * np.exp(-d / 18)
        img *= (1 - ring[..., None] * 0.35)
    img += (r.random((h, w, 1)) - 0.5) * 8
    return img


def paper(w=512, h=512, seed=2):
    r = rng(seed)
    n = fbm(w, h, 8, 6, r)
    fib = fbm(w, h, 120, 2, r, aspect=0.3)
    base = lerp(col('#e9dcbc'), col('#f6edd6'), n[..., None])
    base *= (0.97 + 0.06 * fib[..., None])
    spots = smoothstep(0.72, 0.8, fbm(w, h, 6, 4, rng(seed + 1)))
    base = lerp(base, col('#d6bf92'), spots[..., None] * 0.35)
    base += (r.random((h, w, 1)) - 0.5) * 6
    return base


def gen_map(W=1600, H=900):
    r = rng(5)
    img = paper(W, H, 9)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    # land tint regions
    land = fbm(W, H, 3, 5, r)
    green = col('#b8c48e'); brown = col('#d8c08a'); dark = col('#9aae78')
    tint = lerp(green, brown, smoothstep(0.4, 0.7, land)[..., None])
    north_fade = smoothstep(0.35, 0.0, yy / H)
    tint = lerp(tint, col('#c8ccbc'), north_fade[..., None] * 0.6)
    img = lerp(img, tint, 0.45)
    # mountains region (top right)
    lay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)

    def P(nx, ny):
        return (nx * W, ny * H)

    # Volga - big river curving along bottom right
    pts = [P(0.42, 1.02), P(0.5, 0.92), P(0.62, 0.88), P(0.72, 0.86), P(0.84, 0.8), P(0.94, 0.7), P(1.02, 0.66)]
    d.line(pts, fill=(70, 120, 150, 255), width=46, joint='curve')
    d.line(pts, fill=(110, 160, 190, 255), width=30, joint='curve')
    # forest river from swamp to lake to volga
    pts2 = [P(0.30, 0.24), P(0.33, 0.34), P(0.37, 0.46), P(0.42, 0.54), P(0.52, 0.6), P(0.56, 0.7), P(0.6, 0.8), P(0.63, 0.88)]
    d.line(pts2, fill=(70, 120, 150, 255), width=16, joint='curve')
    d.line(pts2, fill=(120, 170, 196, 255), width=9, joint='curve')
    # mountain river
    pts3 = [P(0.84, 0.12), P(0.8, 0.22), P(0.78, 0.36), P(0.74, 0.5), P(0.66, 0.6), P(0.57, 0.63)]
    d.line(pts3, fill=(70, 120, 150, 255), width=12, joint='curve')
    d.line(pts3, fill=(130, 180, 206, 255), width=6, joint='curve')
    # lakes
    for (cx, cy, rx, ry) in ((0.55, 0.62, 0.07, 0.07), (0.20, 0.70, 0.035, 0.04), (0.58, 0.13, 0.09, 0.06), (0.30, 0.22, 0.06, 0.05)):
        poly = []
        for a in np.linspace(0, math.tau, 40):
            k = 1 + 0.18 * math.sin(a * 3 + cx * 10) + 0.1 * math.sin(a * 5 + cy * 7)
            poly.append(P(cx + math.cos(a) * rx * k, cy + math.sin(a) * ry * k * 1.6))
        d.polygon(poly, fill=(70, 120, 150, 255))
        poly2 = [((x - cx * W) * 0.88 + cx * W, (y - cy * H) * 0.88 + cy * H) for x, y in poly]
        d.polygon(poly2, fill=(120, 170, 200, 255))
    # swamp hatching
    for i in range(60):
        x = r.uniform(0.2, 0.42) * W; y = r.uniform(0.14, 0.32) * H
        d.line([(x, y), (x + 14, y)], fill=(80, 110, 80, 180), width=2)
        d.line([(x + 4, y), (x + 6, y - 9)], fill=(80, 110, 80, 180), width=2)
        d.line([(x + 9, y), (x + 11, y - 7)], fill=(80, 110, 80, 180), width=2)
    # mountains
    for i in range(40):
        x = r.uniform(0.68, 0.98) * W; y = r.uniform(0.05, 0.4) * H
        s = r.uniform(26, 60)
        d.polygon([(x - s, y + s * 0.6), (x, y - s * 0.7), (x + s, y + s * 0.6)], fill=(140, 120, 100, 255), outline=(70, 55, 40, 255))
        d.polygon([(x, y - s * 0.7), (x + s, y + s * 0.6), (x + s * 0.2, y + s * 0.6)], fill=(110, 92, 74, 255))
        d.polygon([(x - s * 0.3, y - s * 0.25), (x, y - s * 0.7), (x + s * 0.3, y - s * 0.25)], fill=(250, 250, 245, 255))
    # forests
    def tree(x, y, s, kind):
        if kind == 0:
            d.polygon([(x, y - s), (x - s * 0.5, y), (x + s * 0.5, y)], fill=(60, 100, 60, 255), outline=(30, 60, 30, 255))
            d.polygon([(x, y - s * 1.4), (x - s * 0.38, y - s * 0.5), (x + s * 0.38, y - s * 0.5)], fill=(70, 115, 66, 255), outline=(30, 60, 30, 255))
        else:
            d.ellipse([x - s * 0.5, y - s * 1.2, x + s * 0.5, y - s * 0.2], fill=(96, 140, 70, 255), outline=(40, 70, 30, 255))
        d.line([(x, y), (x, y + s * 0.3)], fill=(80, 50, 30, 255), width=3)
    for i in range(260):
        x = r.uniform(0.02, 0.98); y = r.uniform(0.05, 0.98)
        ok = True
        for (cx, cy) in MAP_POS.values():
            if (x - cx) ** 2 + ((y - cy) * 0.6) ** 2 < 0.006:
                ok = False
        if x > 0.66 and y < 0.42:
            ok = False
        if y > 0.8 and x > 0.42:
            ok = False
        if ok:
            tree(x * W, y * H, r.uniform(14, 24), 0 if y < 0.5 or r.random() < 0.4 else 1)
    # village houses near pond
    for i, (x, y) in enumerate([(0.13, 0.78), (0.155, 0.81), (0.11, 0.84), (0.27, 0.8)]):
        X, Y = x * W, y * H
        d.rectangle([X - 12, Y - 10, X + 12, Y + 8], fill=(180, 120, 80, 255), outline=(80, 50, 30, 255))
        d.polygon([(X - 16, Y - 10), (X, Y - 24), (X + 16, Y - 10)], fill=(150, 60, 50, 255), outline=(80, 30, 20, 255))
    # dashed road path between locations
    order = ['pond', 'river', 'lake', 'swamp', 'north', 'mountain', 'volga']
    path = [P(*MAP_POS[k]) for k in ['pond', 'river', 'swamp', 'north', 'mountain', 'lake', 'volga']]
    for a, b in zip(path, path[1:]):
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        n = int(L / 22)
        for i in range(n):
            t0 = i / n; t1 = (i + 0.5) / n
            d.line([(a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0), (a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1)], fill=(120, 60, 30, 200), width=4)
    # compass rose
    cx, cy, s = 0.08 * W, 0.16 * H, 70
    d.ellipse([cx - s, cy - s, cx + s, cy + s], outline=(90, 60, 30, 255), width=3)
    d.ellipse([cx - s * 0.8, cy - s * 0.8, cx + s * 0.8, cy + s * 0.8], outline=(90, 60, 30, 160), width=2)
    for k in range(8):
        a = k * math.pi / 4 - math.pi / 2
        L = s * (1.0 if k % 2 == 0 else 0.6)
        tip = (cx + math.cos(a) * L, cy + math.sin(a) * L)
        lft = (cx + math.cos(a - 0.25) * L * 0.22, cy + math.sin(a - 0.25) * L * 0.22)
        rgt = (cx + math.cos(a + 0.25) * L * 0.22, cy + math.sin(a + 0.25) * L * 0.22)
        d.polygon([tip, lft, (cx, cy)], fill=(150, 50, 40, 255) if k == 0 else (90, 60, 30, 255))
        d.polygon([tip, rgt, (cx, cy)], fill=(230, 210, 170, 255))
    # sea monster easter egg in the north lake corner
    lay2 = lay.filter(ImageFilter.GaussianBlur(0.6))
    la = np.asarray(lay2, np.float32)
    img = blend(img, la[..., :3], la[..., 3] / 255 * 0.92)
    # water texture lines
    # vignette & burnt edges
    xs = xx / W; ys = yy / H
    edge = np.minimum(np.minimum(xs, 1 - xs), np.minimum(ys, 1 - ys))
    burn = smoothstep(0.06, 0.0, edge + (fbm(W, H, 10, 4, rng(3)) - 0.5) * 0.05)
    img = lerp(img, col('#6a4a2a'), burn[..., None] * 0.8)
    img *= (1 - smoothstep(0.25, 0.0, edge) * 0.25)[..., None]
    return img


if __name__ == '__main__':
    to_img(tileable(wood())).save(os.path.join(OUT, 'wood.jpg'), quality=90)
    to_img(tileable(wood(512, 512, 7, ('#2a1a10', '#4a3020', '#6a4630')))).save(os.path.join(OUT, 'wood_dark.jpg'), quality=90)
    to_img(tileable(paper())).save(os.path.join(OUT, 'paper.jpg'), quality=90)
    to_img(gen_map()).save(os.path.join(OUT, 'map.jpg'), quality=90)
    for f in os.listdir(OUT):
        print(f, os.path.getsize(os.path.join(OUT, f)) // 1024, 'KB')
