"""Shared helpers for procedural asset generation (numpy + Pillow)."""
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

def rng(seed):
    return np.random.default_rng(seed)

def value_noise(w, h, cells_x, cells_y, r):
    """Smooth value noise in [0,1] via bicubic upscaling of a random grid."""
    g = r.random((max(2, cells_y), max(2, cells_x))).astype(np.float32)
    im = Image.fromarray((g * 255).astype(np.uint8), 'L').resize((w, h), Image.BICUBIC)
    return np.asarray(im, dtype=np.float32) / 255.0

def fbm(w, h, base, octaves, r, persistence=0.5, aspect=1.0):
    acc = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    cx = base
    for _ in range(octaves):
        cy = max(2, int(cx * h / w * aspect))
        acc += value_noise(w, h, int(cx), cy, r) * amp
        tot += amp
        amp *= persistence
        cx *= 2
    return acc / tot

def fbm1d(n, base, octaves, r, persistence=0.5):
    acc = np.zeros(n, np.float32)
    amp, tot, c = 1.0, 0.0, base
    for _ in range(octaves):
        pts = r.random(int(c) + 2).astype(np.float32)
        xs = np.linspace(0, int(c) + 1, n)
        i = np.floor(xs).astype(int)
        f = xs - i
        f = f * f * (3 - 2 * f)
        i = np.clip(i, 0, len(pts) - 2)
        acc += (pts[i] * (1 - f) + pts[i + 1] * f) * amp
        tot += amp
        amp *= persistence
        c *= 2
    return acc / tot

def lerp(a, b, t):
    return a + (b - a) * t

def col(hexs):
    hexs = hexs.lstrip('#')
    if len(hexs) == 3:
        hexs = ''.join(ch * 2 for ch in hexs)
    return np.array([int(hexs[i:i + 2], 16) for i in (0, 2, 4)], np.float32)

def vgrad(h, w, stops):
    """stops: list of (pos 0..1, color array). returns HxWx3."""
    ys = np.linspace(0, 1, h)
    out = np.zeros((h, 3), np.float32)
    for c in range(3):
        out[:, c] = np.interp(ys, [s[0] for s in stops], [s[1][c] for s in stops])
    return np.repeat(out[:, None, :], w, axis=1)

def blend(base, color, alpha):
    """alpha HxW (0..1), color HxWx3 or 3."""
    a = alpha[..., None]
    return base * (1 - a) + color * a

def to_img(arr):
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGB')

def to_rgba(arr):
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')

def blur(arr, radius):
    if arr.ndim == 2:
        im = Image.fromarray(np.clip(arr * 255, 0, 255).astype(np.uint8), 'L').filter(ImageFilter.GaussianBlur(radius))
        return np.asarray(im, np.float32) / 255.0
    im = to_img(arr).filter(ImageFilter.GaussianBlur(radius))
    return np.asarray(im, np.float32)

def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)

def mask_from_draw(w, h, fn, ss=2):
    """Draw with PIL at ss x supersampling and return float mask."""
    im = Image.new('L', (w * ss, h * ss), 0)
    d = ImageDraw.Draw(im)
    fn(d, ss)
    im = im.resize((w, h), Image.LANCZOS)
    return np.asarray(im, np.float32) / 255.0
