"""Synthesised music, ambience loops and sound effects -> MP3 via ffmpeg.
Output: assets/music/*.mp3, assets/amb/*.mp3, assets/sfx/*.mp3"""
import os, sys, math, subprocess
import numpy as np
from multiprocessing import Pool

SR = 44100
ROOT = os.path.join(os.path.dirname(__file__), '..', 'assets')
for d in ('music', 'amb', 'sfx'):
    os.makedirs(os.path.join(ROOT, d), exist_ok=True)

NOTE = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}
SCALES = {'major': [0, 2, 4, 5, 7, 9, 11], 'minor': [0, 2, 3, 5, 7, 8, 10], 'dorian': [0, 2, 3, 5, 7, 9, 10],
          'mixo': [0, 2, 4, 5, 7, 9, 10], 'harm': [0, 2, 3, 5, 7, 8, 11], 'penta': [0, 2, 4, 7, 9]}


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


# ------------------------------------------------------------------ DSP utils
def fft_filter(x, lo=None, hi=None, order=2):
    n = len(x)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    g = np.ones_like(f)
    if hi:
        g *= 1 / np.sqrt(1 + (f / hi) ** (2 * order))
    if lo:
        g *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1e-3)) ** (2 * order))
    return np.fft.irfft(X * g, n)


def peak_filter(x, fc, q):
    n = len(x)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    g = 1 / (1 + ((f - fc) / (fc / q)) ** 2)
    return np.fft.irfft(X * g, n)


def env_adsr(n, a, d, s, r, sr=SR):
    t = np.arange(n) / sr
    dur = n / sr
    e = np.where(t < a, t / max(a, 1e-4), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4)))
    rel = np.clip((dur - t) / max(r, 1e-4), 0, 1)
    return e * rel


def reverb(st, seconds=2.6, mix=0.28, seed=0, damp=4000):
    r = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    out = np.zeros_like(st)
    for ch in range(2):
        ir = r.standard_normal(n) * np.exp(-t * 6.9 / seconds)
        ir = fft_filter(ir, hi=damp, order=1)
        ir[:int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
        ir /= np.sqrt(np.sum(ir ** 2))
        L = len(st) + n
        nfft = 1 << (L - 1).bit_length()
        y = np.fft.irfft(np.fft.rfft(st[:, ch], nfft) * np.fft.rfft(ir, nfft), nfft)[:L]
        # wrap tail for seamless loops
        wet = y[:len(st)].copy()
        wet[:n] += y[len(st):len(st) + n][:len(st)] if n < len(st) else 0
        out[:, ch] = wet
    return st * (1 - mix * 0.5) + out * mix


def normalize(st, peak=0.89):
    m = np.max(np.abs(st)) + 1e-9
    return st * (peak / m)


def soft_clip(x):
    return np.tanh(x * 1.2) / np.tanh(1.2)


def write_mp3(path, st, br='128k', mono=False):
    st = np.clip(st, -1, 1)
    pcm = (st * 32767).astype('<i2')
    ch = 2 if st.ndim == 2 else 1
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', str(SR), '-ac', str(ch), '-i', '-']
    if mono:
        cmd += ['-ac', '1']
    cmd += ['-codec:a', 'libmp3lame', '-b:a', br, path]
    subprocess.run(cmd, input=pcm.tobytes(), check=True)


# ------------------------------------------------------------------ instruments
def pluck(f, dur, bright=1.0, decay=1.0, pos=0.18, inh=0.0002):
    n = int((dur + 0.05) * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    hmax = int(min(40, 9000 / f))
    for h in range(1, hmax + 1):
        fh = f * h * math.sqrt(1 + inh * h * h)
        a = (abs(math.sin(math.pi * h * pos)) + 0.05) / h ** (1.25 - 0.25 * bright)
        d = (1.2 + 0.55 * (h - 1) ** 1.15) / decay
        y += a * np.sin(2 * np.pi * fh * t + h * 0.7) * np.exp(-t * d)
    att = int(0.003 * SR)
    y[:att] *= np.linspace(0, 1, att)
    y[-int(0.04 * SR):] *= np.linspace(1, 0, int(0.04 * SR))
    return y * 0.35


def piano(f, dur, vel=1.0):
    n = int((dur + 0.6) * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for h in range(1, int(min(16, 8000 / f)) + 1):
        fh = f * h * math.sqrt(1 + 0.0004 * h * h)
        a = vel / h ** 1.4
        dd = 0.7 + 0.45 * h
        y += a * (np.sin(2 * np.pi * fh * t) + 0.3 * np.sin(2 * np.pi * fh * 1.0015 * t)) * np.exp(-t * dd)
    rel = np.clip((dur + 0.6 - t) / 0.5, 0, 1)
    att = int(0.004 * SR)
    y[:att] *= np.linspace(0, 1, att)
    return y * rel * 0.25


def bell(f, dur):
    n = int((dur + 1.5) * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for ratio, a, d in ((1, 1, 1.2), (2.0, 0.5, 1.8), (2.76, 0.4, 2.5), (5.4, 0.25, 4), (8.93, 0.12, 6)):
        y += a * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t * d)
    att = int(0.002 * SR)
    y[:att] *= np.linspace(0, 1, att)
    return y * 0.18


def flute(f, dur, vib=5.2):
    n = int((dur + 0.15) * SR)
    t = np.arange(n) / SR
    vibd = np.clip((t - 0.25) / 0.4, 0, 1) * 0.006
    ph = 2 * np.pi * np.cumsum(f * (1 + vibd * np.sin(2 * np.pi * vib * t))) / SR
    y = np.sin(ph) + 0.22 * np.sin(2 * ph) + 0.08 * np.sin(3 * ph)
    breath = fft_filter(np.random.default_rng(int(f)).standard_normal(n), lo=f * 0.8, hi=f * 3) * 0.05
    e = env_adsr(n, 0.07, 0.3, 0.85, 0.12)
    return (y + breath) * e * 0.22


def accordion(f, dur):
    n = int((dur + 0.1) * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for det in (1.0, 1.0045, 0.9962):
        ph = 2 * np.pi * f * det * t
        for h in range(1, int(min(12, 7000 / f)) + 1):
            y += (1 / h if h % 2 else 0.45 / h) * np.sin(h * ph)
    trem = 1 + 0.08 * np.sin(2 * np.pi * 5.5 * t)
    e = env_adsr(n, 0.04, 0.2, 0.9, 0.08)
    return y * trem * e * 0.07


def balalaika(f, dur, rate=11):
    n = int((dur + 0.2) * SR)
    y = np.zeros(n)
    k = 0
    step = int(SR / rate)
    while k * step < int(dur * SR):
        p = pluck(f * (1 + 0.002 * ((k % 2) - 0.5)), 0.45, bright=1.3, decay=0.6, pos=0.12)
        s = k * step
        e = min(n, s + len(p))
        y[s:e] += p[:e - s] * (0.75 + 0.25 * (k % 2))
        k += 1
    return y * 0.6


def pad(freqs, dur, bright=0.5, attack=0.8):
    n = int((dur + attack) * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for f in freqs:
        for det in (0.996, 1.0, 1.004):
            ph = 2 * np.pi * f * det * t + det * 10
            for h in range(1, int(min(10, 4000 / f)) + 1):
                y += (bright ** (h - 1)) / h * np.sin(h * ph)
    e = env_adsr(n, attack, 1.0, 1.0, attack)
    return y * e * 0.03 / max(1, len(freqs) ** 0.5)


def bass(f, dur):
    n = int((dur + 0.1) * SR)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) + 0.12 * np.sin(6 * np.pi * f * t)
    e = np.exp(-t * 1.4) * 0.7 + 0.3
    e *= np.clip((dur + 0.1 - t) / 0.08, 0, 1)
    att = int(0.006 * SR)
    e[:att] *= np.linspace(0, 1, att)
    return y * e * 0.32


def strings(freqs, dur):
    n = int((dur + 0.6) * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for f in freqs:
        for det in (0.997, 1.0, 1.0035, 0.9985):
            vib = 1 + 0.003 * np.sin(2 * np.pi * (5 + det) * t)
            ph = 2 * np.pi * np.cumsum(f * det * vib) / SR
            for h in range(1, int(min(14, 6000 / f)) + 1):
                y += (1 / h ** 1.2) * np.sin(h * ph)
    e = env_adsr(n, 0.45, 1, 1, 0.5)
    return fft_filter(y, hi=3500) * e * 0.018


def shaker(dur=0.09, vol=1.0, seed=0):
    n = int(dur * SR)
    y = np.random.default_rng(seed).standard_normal(n)
    y = fft_filter(y, lo=5000)
    t = np.arange(n) / SR
    return y * np.exp(-t * 45) * 0.08 * vol


def kick(vol=1.0):
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    f = 45 + 90 * np.exp(-t * 30)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)
    return y * 0.5 * vol


def woodblock(f=900, vol=1.0):
    n = int(0.15 * SR)
    t = np.arange(n) / SR
    y = (np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * f * 2.6 * t)) * np.exp(-t * 40)
    return y * 0.18 * vol


# ------------------------------------------------------------------ composition
class Track:
    def __init__(self, seconds):
        self.n = int(seconds * SR)
        self.buf = np.zeros((self.n + SR * 4, 2))

    def add(self, y, t, pan=0.0, vol=1.0):
        s = int(t * SR)
        if s >= self.n + SR * 3:
            return
        e = min(len(self.buf), s + len(y))
        l = math.cos((pan + 1) * math.pi / 4)
        r = math.sin((pan + 1) * math.pi / 4)
        self.buf[s:e, 0] += y[:e - s] * l * vol * 1.414
        self.buf[s:e, 1] += y[:e - s] * r * vol * 1.414

    def finish(self, rev=0.3, rev_s=2.6, seed=0):
        # fold the overhang back to the beginning for seamless looping
        body = self.buf[:self.n].copy()
        tail = self.buf[self.n:]
        body[:len(tail)] += tail[:self.n]
        body = reverb(body, rev_s, rev, seed)
        body = soft_clip(normalize(body, 0.95) * 1.0)
        return normalize(body, 0.88)


def chord_notes(key, scale, degree, octave=4, ext=False):
    sc = SCALES[scale]
    root = 12 * (octave + 1) + NOTE[key]
    idx = [degree, degree + 2, degree + 4] + ([degree + 6] if ext else [])
    out = []
    for i in idx:
        o, d = divmod(i, len(sc))
        out.append(root + sc[d] + 12 * o)
    return out


def scale_note(key, scale, step, octave=5):
    sc = SCALES[scale]
    o, d = divmod(step, len(sc))
    return 12 * (octave + 1) + NOTE[key] + sc[d] + 12 * o


RHYTHMS = [
    [2, 1, 1, 2, 2], [1, 1, 2, 1, 1, 2], [3, 1, 2, 2], [2, 2, 2, 2], [1, 1, 1, 1, 2, 2], [4, 2, 2], [2, 1, 1, 4], [3, 1, 4],
]


def make_motif(r, prog_len, beats_per_bar, chords, key, scale, start=4, rng_lo=-2, rng_hi=9):
    """Returns list of (start_beat, dur_beats, scale_step) over 2 bars (in 8th notes)."""
    notes = []
    step = start
    eighths_per_bar = beats_per_bar * 2
    for bar in range(2):
        rhythm = RHYTHMS[r.integers(len(RHYTHMS))]
        tot = sum(rhythm)
        rhythm = [x * eighths_per_bar / tot for x in rhythm]
        pos = 0
        for i, d in enumerate(rhythm):
            mv = r.choice([-2, -1, -1, 0, 1, 1, 2, 3, -3], p=[0.08, 0.2, 0.12, 0.1, 0.2, 0.12, 0.08, 0.05, 0.05])
            step = int(np.clip(step + mv, rng_lo, rng_hi))
            if r.random() < 0.12 and i > 0:
                notes.append((bar * eighths_per_bar + pos, d, None))  # rest
            else:
                notes.append((bar * eighths_per_bar + pos, d, step))
            pos += d
    return notes


def snap_to_chord(step, chord_steps, strong):
    if not strong:
        return step
    best = min(chord_steps, key=lambda c: min(abs(step - (c + 7 * k)) for k in range(-2, 3)))
    cands = [best + 7 * k for k in range(-2, 3)]
    return min(cands, key=lambda c: abs(c - step))


def compose(name, key, scale, bpm, prog, bars, lead, accomp, seed, beats=4, extras=(), lead_oct=5, rev=0.3, swing=0.0):
    r = np.random.default_rng(seed)
    spb = 60 / bpm
    total = bars * beats * spb
    tr = Track(total)
    motifs = [make_motif(r, len(prog), beats, prog, key, scale, start=r.integers(2, 6)) for _ in range(3)]
    form = ['A', 'A', 'B', 'A', 'C', 'B', 'A', 'A']
    for bar in range(bars):
        deg = prog[bar % len(prog)]
        t0 = bar * beats * spb
        cn = chord_notes(key, scale, deg, 3)
        # bass
        if 'bass' in extras or True:
            tr.add(bass(mtof(cn[0] - 12), beats * spb * 0.5), t0, -0.1, 0.9)
            tr.add(bass(mtof(cn[2] - 12 if r.random() < 0.5 else cn[0] - 12), beats * spb * 0.45), t0 + beats * spb * 0.5, -0.1, 0.7)
        # accompaniment
        if accomp == 'arp':
            pat = [0, 2, 1, 2, 3, 2, 1, 2] if beats == 4 else [0, 2, 1, 2, 1, 2]
            notes = cn + [cn[0] + 12]
            for i, p in enumerate(pat):
                tt = t0 + i * spb / 2 + (swing * spb / 2 if i % 2 else 0)
                tr.add(pluck(mtof(notes[p] + 12), spb * 1.6, bright=0.8, decay=1.4), tt, 0.25 * (1 if i % 2 else -1), 0.55)
        elif accomp == 'strum':
            for i in range(beats):
                for k, nn in enumerate(cn + [cn[0] + 12]):
                    tr.add(pluck(mtof(nn + 12), spb * 1.2, bright=1.0, decay=0.9), t0 + i * spb + k * 0.012 + (0.03 if i % 2 else 0), 0.3, 0.32 if i % 2 else 0.42)
        elif accomp == 'pad':
            tr.add(pad([mtof(x + 12) for x in cn], beats * spb, bright=0.45, attack=0.9), t0, 0.0, 0.9)
        elif accomp == 'strings':
            tr.add(strings([mtof(x + 12) for x in cn], beats * spb), t0, 0.0, 1.0)
        elif accomp == 'oompah':
            for i in range(beats):
                if i % 2 == 1:
                    for nn in cn:
                        tr.add(accordion(mtof(nn + 12), spb * 0.45), t0 + i * spb, 0.25, 0.55)
        elif accomp == 'piano':
            for i, p in enumerate([0, 1, 2, 1, 2, 1, 0, 2][:beats * 2]):
                tr.add(piano(mtof(cn[p] + 12), spb * 0.9, 0.8), t0 + i * spb / 2, -0.2, 0.6)
        if 'pad' in extras and accomp != 'pad':
            tr.add(pad([mtof(x + 12) for x in cn], beats * spb, bright=0.35, attack=1.2), t0, 0.0, 0.5)
        if 'strings' in extras and accomp != 'strings':
            tr.add(strings([mtof(x + 12) for x in cn], beats * spb), t0, 0.0, 0.55)
        if 'shaker' in extras:
            for i in range(beats * 2):
                tr.add(shaker(vol=1.0 if i % 2 else 0.6, seed=bar * 8 + i), t0 + i * spb / 2 + (swing * spb / 2 if i % 2 else 0), 0.5, 1)
        if 'kick' in extras:
            for i in range(0, beats, 2):
                tr.add(kick(0.7), t0 + i * spb, 0, 1)
        if 'wood' in extras:
            for i in range(beats):
                if i % 2 == 1:
                    tr.add(woodblock(1100, 0.8), t0 + i * spb, -0.4, 1)
        if 'bells' in extras and bar % 2 == 0:
            for i, nn in enumerate(cn):
                tr.add(bell(mtof(nn + 24), 2), t0 + i * spb * 0.67, 0.4 - i * 0.3, 0.5)
    # lead melody, phrase = 2 bars
    sec = 0
    for ph in range(0, bars, 2):
        part = form[(ph // 2) % len(form)]
        if part == 'C' and lead != 'none':
            m = motifs[2]
        else:
            m = motifs[0] if part == 'A' else motifs[1]
        if (ph // 2) % 8 in (0,) and bars > 16 and ph == 0:
            continue  # intro bar pair without melody
        for (b8, d8, step) in m:
            if step is None:
                continue
            bar = ph + int(b8 // (beats * 2))
            if bar >= bars:
                continue
            deg = prog[bar % len(prog)]
            strong = (b8 % (beats * 2)) % 4 == 0
            chord_steps = [deg, deg + 2, deg + 4]
            s2 = snap_to_chord(step, chord_steps, strong)
            if part == 'B':
                s2 += 0
            midi = scale_note(key, scale, s2, lead_oct)
            t = ph * beats * spb + b8 * spb / 2
            dur = d8 * spb / 2
            v = 0.9 if strong else 0.75
            if lead == 'flute':
                tr.add(flute(mtof(midi), dur * 0.95), t, 0.1, v)
            elif lead == 'accordion':
                tr.add(accordion(mtof(midi), dur * 0.95), t, 0.1, v * 1.1)
            elif lead == 'balalaika':
                tr.add(balalaika(mtof(midi), dur * 0.95), t, 0.15, v * 0.9)
            elif lead == 'bell':
                tr.add(bell(mtof(midi), dur), t, 0.2, v)
            elif lead == 'piano':
                tr.add(piano(mtof(midi), dur, 1.0), t, 0.1, v * 1.2)
            elif lead == 'pluck':
                tr.add(pluck(mtof(midi), dur * 1.2, bright=1.2, decay=1.6), t, 0.1, v * 1.1)
    return tr.finish(rev, seed=seed)


MUSIC = {
    'menu':     dict(key='D', scale='major', bpm=84, prog=[0, 4, 5, 3, 0, 4, 3, 4], bars=48, lead='accordion', accomp='arp', seed=1, extras=('pad', 'shaker'), rev=0.3, swing=0.12),
    'pond':     dict(key='G', scale='major', bpm=104, prog=[0, 3, 4, 0, 5, 3, 4, 0], bars=56, lead='balalaika', accomp='oompah', seed=2, extras=('wood',), rev=0.22),
    'river':    dict(key='E', scale='minor', bpm=76, prog=[0, 5, 2, 6, 0, 3, 6, 4], bars=40, lead='flute', accomp='arp', seed=3, extras=('pad',), rev=0.32, swing=0.08),
    'lake':     dict(key='F', scale='major', bpm=70, prog=[0, 5, 3, 4, 0, 2, 3, 4], bars=36, lead='piano', accomp='pad', seed=4, extras=('bells',), rev=0.4),
    'swamp':    dict(key='A', scale='dorian', bpm=62, prog=[0, 0, 3, 3, 5, 4, 0, 6], bars=32, lead='bell', accomp='pad', seed=5, extras=('strings',), rev=0.5, lead_oct=4),
    'mountain': dict(key='D', scale='mixo', bpm=92, prog=[0, 6, 3, 0, 0, 6, 4, 4], bars=48, lead='flute', accomp='strum', seed=6, extras=('kick', 'shaker'), rev=0.28),
    'volga':    dict(key='C', scale='minor', bpm=72, prog=[0, 3, 6, 2, 5, 3, 4, 4], bars=40, lead='accordion', accomp='strings', seed=7, extras=('pad',), rev=0.38),
    'north':    dict(key='B', scale='minor', bpm=64, prog=[0, 5, 2, 6, 3, 5, 4, 4], bars=32, lead='bell', accomp='pad', seed=8, extras=('strings',), rev=0.5),
    'night':    dict(key='Ab', scale='major', bpm=60, prog=[0, 5, 3, 4, 0, 3, 1, 4], bars=32, lead='piano', accomp='pad', seed=9, extras=('bells',), rev=0.5, lead_oct=5),
    'shop':     dict(key='C', scale='major', bpm=112, prog=[0, 5, 1, 4, 0, 5, 3, 4], bars=40, lead='pluck', accomp='piano', seed=10, extras=('shaker', 'wood'), rev=0.2, swing=0.15),
}


def gen_music(name):
    cfg = dict(MUSIC[name])
    st = compose(name, **cfg)
    p = os.path.join(ROOT, 'music', name + '.mp3')
    write_mp3(p, st, '160k')
    return name, os.path.getsize(p)


# ------------------------------------------------------------------ jingles
def jingle(notes, inst='pluck', bpm=140, chord_end=None, rev=0.35, extra_bass=True):
    spb = 60 / bpm
    total = sum(d for _, d in notes) * spb + 2.5
    tr = Track(total)
    t = 0.0
    for m, d in notes:
        if m is not None:
            if inst == 'pluck':
                tr.add(pluck(mtof(m), d * spb * 1.6, 1.2, 1.5), t, 0.1, 0.9)
            elif inst == 'bell':
                tr.add(bell(mtof(m), d * spb * 2), t, 0.1, 1.0)
            elif inst == 'brass':
                tr.add(accordion(mtof(m), d * spb * 0.95), t, 0.0, 1.0)
                tr.add(strings([mtof(m)], d * spb), t, 0.0, 1.5)
            elif inst == 'piano':
                tr.add(piano(mtof(m), d * spb, 1.0), t, 0.0, 1.0)
        t += d * spb
    if chord_end:
        for i, m in enumerate(chord_end):
            tr.add(strings([mtof(m)], 1.8), t, -0.3 + i * 0.2, 1.4)
            tr.add(pluck(mtof(m), 1.8, 1.0, 0.8), t + i * 0.03, -0.3 + i * 0.2, 0.7)
            tr.add(bell(mtof(m + 12), 1.5), t + 0.05, 0.2, 0.4)
        if extra_bass:
            tr.add(bass(mtof(chord_end[0] - 24), 1.8), t, 0, 1.2)
            tr.add(kick(0.9), t, 0, 1)
    tr.n = int((t + 2.2) * SR)
    out = tr.buf[:tr.n].copy()
    out = reverb(out, 1.8, rev, 3)
    fade = int(0.5 * SR)
    out[-fade:] *= np.linspace(1, 0, fade)[:, None]
    return normalize(out, 0.85)


def gen_jingles():
    J = {
        'j_catch': jingle([(72, 0.5), (76, 0.5), (79, 0.5), (84, 1)], 'pluck', 160, [72, 76, 79]),
        'j_trophy': jingle([(67, 0.5), (72, 0.5), (76, 0.5), (79, 1), (76, 0.5), (79, 0.5), (84, 2)], 'brass', 132, [60, 67, 72, 76, 79]),
        'j_levelup': jingle([(76, 0.25), (79, 0.25), (84, 0.25), (88, 0.25), (91, 1)], 'bell', 150, [72, 79, 84, 88]),
        'j_quest': jingle([(79, 0.5), (84, 0.5), (88, 1)], 'piano', 140, [72, 76, 79, 84]),
        'j_fail': jingle([(67, 0.5), (66, 0.5), (65, 0.5), (64, 1.5)], 'brass', 110, [52, 55, 58], extra_bass=True),
        'j_unlock': jingle([(74, 0.25), (78, 0.25), (81, 0.25), (86, 0.75), (85, 0.25), (86, 1)], 'pluck', 140, [62, 69, 74, 78]),
        'j_legend': jingle([(72, 0.33), (76, 0.33), (79, 0.33), (84, 0.33), (88, 0.33), (91, 0.33), (96, 2)], 'bell', 120, [60, 64, 67, 72, 76, 79]),
        'j_sell': jingle([(84, 0.25), (88, 0.25), (91, 0.5)], 'bell', 170, None, 0.2),
    }
    out = []
    for k, st in J.items():
        p = os.path.join(ROOT, 'sfx', k + '.mp3')
        write_mp3(p, st, '128k')
        out.append((k, os.path.getsize(p)))
    return out


# ------------------------------------------------------------------ ambience
def noise(n, seed):
    return np.random.default_rng(seed).standard_normal(n)


def loopify(x, fade_s=2.0):
    """Crossfade end into start to make a seamless loop."""
    f = int(fade_s * SR)
    y = x[:-f].copy()
    ramp = np.linspace(0, 1, f)
    if x.ndim == 2:
        ramp = ramp[:, None]
    y[:f] = y[:f] * ramp + x[-f:] * (1 - ramp)
    return y


def slow_lfo(n, rate, seed, depth=0.5):
    r = np.random.default_rng(seed)
    pts = r.random(int(n / SR * rate) + 3)
    xs = np.linspace(0, len(pts) - 1, n)
    i = np.floor(xs).astype(int); f = xs - i
    f = f * f * (3 - 2 * f)
    i = np.clip(i, 0, len(pts) - 2)
    v = pts[i] * (1 - f) + pts[i + 1] * f
    return 1 - depth + depth * v


def bird_call(kind, r):
    if kind == 0:  # chirp series
        out = []
        for k in range(r.integers(3, 7)):
            d = r.uniform(0.05, 0.12)
            n = int(d * SR); t = np.arange(n) / SR
            f0 = r.uniform(3000, 4500); f1 = f0 + r.uniform(-1500, 1500)
            f = f0 + (f1 - f0) * t / d
            y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / d)
            out.append(y); out.append(np.zeros(int(r.uniform(0.04, 0.1) * SR)))
        return np.concatenate(out)
    if kind == 1:  # warble
        d = r.uniform(0.6, 1.4); n = int(d * SR); t = np.arange(n) / SR
        f = 2600 + 900 * np.sin(2 * np.pi * r.uniform(8, 16) * t) + 500 * np.sin(2 * np.pi * 1.3 * t)
        e = np.sin(np.pi * t / d) ** 0.5 * (0.6 + 0.4 * np.sin(2 * np.pi * 22 * t))
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * e
    if kind == 2:  # cuckoo-like two-tone (distant)
        out = []
        for k in range(r.integers(2, 4)):
            for f0, d in ((740, 0.18), (590, 0.3)):
                n = int(d * SR); t = np.arange(n) / SR
                y = np.sin(2 * np.pi * f0 * t) * np.sin(np.pi * t / d) ** 0.6
                out.append(y); out.append(np.zeros(int(0.12 * SR)))
            out.append(np.zeros(int(0.5 * SR)))
        return np.concatenate(out) * 0.6
    if kind == 3:  # whistle glide
        d = r.uniform(0.3, 0.6); n = int(d * SR); t = np.arange(n) / SR
        f = 1800 + 1600 * (t / d) ** 2 if r.random() < 0.5 else 3600 - 1600 * (t / d)
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / d)
    return np.zeros(10)


def scatter(base, events, r, pan_range=0.8):
    for (y, t, vol) in events:
        s = int(t * SR)
        e = min(len(base), s + len(y))
        pan = r.uniform(-pan_range, pan_range)
        l = math.cos((pan + 1) * math.pi / 4); rr = math.sin((pan + 1) * math.pi / 4)
        base[s:e, 0] += y[:e - s] * l * vol
        base[s:e, 1] += y[:e - s] * rr * vol


def amb_birds(sec=62):
    n = int(sec * SR); r = np.random.default_rng(11)
    st = np.zeros((n, 2))
    wind = fft_filter(noise(n, 1), lo=200, hi=1200) * slow_lfo(n, 0.2, 2, 0.7) * 0.06
    leaves = fft_filter(noise(n, 3), lo=2500, hi=7000) * slow_lfo(n, 0.5, 4, 0.9) * 0.02
    st[:, 0] += wind + leaves; st[:, 1] += np.roll(wind, 5000) + np.roll(leaves, 3000)
    ev = []
    t = 0.5
    while t < sec - 3:
        k = r.integers(0, 4)
        ev.append((bird_call(k, r) * (0.12 if k != 2 else 0.06), t, r.uniform(0.5, 1)))
        t += r.uniform(0.6, 3.0)
    scatter(st, ev, r)
    lap = water_lap(n, 5) * 0.5
    st += lap
    return loopify(reverb(st, 1.5, 0.25, 1))


def water_lap(n, seed):
    r = np.random.default_rng(seed)
    st = np.zeros((n, 2))
    base = fft_filter(noise(n, seed), lo=80, hi=600) * slow_lfo(n, 0.6, seed + 1, 0.9) * 0.08
    st[:, 0] += base; st[:, 1] += np.roll(base, 8000)
    t = 0.2
    ev = []
    while t < n / SR - 1:
        d = r.uniform(0.15, 0.4); m = int(d * SR); tt = np.arange(m) / SR
        y = fft_filter(noise(m, int(t * 100)), lo=300, hi=1600) * np.exp(-tt * 12) * 0.12
        ev.append((y, t, r.uniform(0.3, 1)))
        # droplet
        if r.random() < 0.4:
            m2 = int(0.08 * SR); t2 = np.arange(m2) / SR
            f = r.uniform(600, 1400) * (1 + 2.5 * t2 / 0.08)
            ev.append((np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t2 * 50) * 0.08, t + 0.05, 1))
        t += r.uniform(0.4, 1.6)
    scatter(st, ev, r, 0.6)
    return st


def amb_night(sec=60):
    n = int(sec * SR); r = np.random.default_rng(21)
    st = np.zeros((n, 2))
    t = np.arange(n) / SR
    for k, (f, rate, pan, ph) in enumerate([(4400, 32, -0.6, 0), (4650, 28, 0.5, 1.3), (3900, 36, 0.1, 2.1), (5100, 30, 0.8, 0.4)]):
        chirp_env = (np.sin(2 * np.pi * rate * t + ph) > 0.2).astype(float)
        burst = (np.sin(2 * np.pi * (0.55 + k * 0.13) * t + ph * 3) > -0.1).astype(float)
        env = fft_filter(chirp_env * burst, hi=300) * slow_lfo(n, 0.1, k, 0.5)
        y = np.sin(2 * np.pi * f * t) * env * 0.035
        l = math.cos((pan + 1) * math.pi / 4); rr = math.sin((pan + 1) * math.pi / 4)
        st[:, 0] += y * l; st[:, 1] += y * rr
    # frogs
    ev = []
    tt = 1.0
    while tt < sec - 2:
        cnt = r.integers(2, 6); f0 = r.uniform(140, 260)
        for c in range(cnt):
            d = r.uniform(0.08, 0.16); m = int(d * SR); x = np.arange(m) / SR
            pulse = (np.sin(2 * np.pi * r.uniform(40, 70) * x) > 0.3).astype(float)
            y = (np.sin(2 * np.pi * f0 * x) + 0.5 * np.sin(2 * np.pi * f0 * 2.02 * x) + 0.3 * np.sin(2 * np.pi * f0 * 3.1 * x)) * pulse * np.sin(np.pi * x / d)
            ev.append((y * 0.09, tt + c * r.uniform(0.18, 0.3), r.uniform(0.4, 1)))
        tt += r.uniform(1.5, 5)
    # owl
    tt = 7
    while tt < sec - 4:
        for k, (f0, d) in enumerate(((420, 0.5), (390, 0.25), (400, 0.9))):
            m = int(d * SR); x = np.arange(m) / SR
            y = np.sin(2 * np.pi * f0 * (1 - 0.06 * x / d) * x) * np.sin(np.pi * x / d) ** 0.7
            ev.append((y * 0.06, tt + k * 0.65, 1))
        tt += r.uniform(14, 22)
    scatter(st, ev, r)
    st += water_lap(n, 25) * 0.35
    return loopify(reverb(st, 2.2, 0.35, 2))


def amb_river(sec=60, strength=1.0, seed=31):
    n = int(sec * SR)
    st = np.zeros((n, 2))
    for ch in range(2):
        rumble = fft_filter(noise(n, seed + ch), lo=60, hi=500) * 0.25
        hiss = fft_filter(noise(n, seed + 10 + ch), lo=800, hi=5000 * strength) * 0.07 * strength
        gurgle = fft_filter(noise(n, seed + 20 + ch), lo=300, hi=1200) * slow_lfo(n, 3, seed + ch, 0.95) * 0.18
        st[:, ch] = (rumble * slow_lfo(n, 0.3, seed + 5 + ch, 0.4) + hiss * slow_lfo(n, 0.5, seed + 7 + ch, 0.5) + gurgle) * (0.8 + 0.4 * strength)
    r = np.random.default_rng(seed)
    ev = []
    t = 0.3
    while t < sec - 1:
        m = int(0.06 * SR); x = np.arange(m) / SR
        f = r.uniform(500, 1500) * (1 + 3 * x / 0.06)
        ev.append((np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x * 60) * 0.06, t, 1))
        t += r.uniform(0.1, 0.6)
    scatter(st, ev, r)
    if strength < 1.2:
        bird = []
        tt = 3
        while tt < sec - 3:
            bird.append((bird_call(r.integers(0, 2), r) * 0.06, tt, 1))
            tt += r.uniform(3, 8)
        scatter(st, bird, r)
    return loopify(reverb(st, 1.2, 0.15, 3))


def amb_rain(sec=60):
    n = int(sec * SR); r = np.random.default_rng(41)
    st = np.zeros((n, 2))
    for ch in range(2):
        st[:, ch] = fft_filter(noise(n, 41 + ch), lo=400, hi=9000) * 0.12 * slow_lfo(n, 0.15, ch, 0.3)
        st[:, ch] += fft_filter(noise(n, 51 + ch), lo=50, hi=300) * 0.12
    ev = []
    for k in range(int(sec * 40)):
        m = int(0.02 * SR); x = np.arange(m) / SR
        y = fft_filter(noise(m, k), lo=1500, hi=8000) * np.exp(-x * 200) * r.uniform(0.05, 0.25)
        ev.append((y, r.uniform(0, sec - 0.1), 1))
    scatter(st, ev, r, 1)
    # distant thunder
    for tt in (12, 41):
        m = int(5 * SR); x = np.arange(m) / SR
        y = fft_filter(noise(m, int(tt)), lo=30, hi=180) * (np.exp(-x * 0.9) * np.clip(x / 0.3, 0, 1)) * 0.8
        st[int(tt * SR):int(tt * SR) + m] += y[:, None]
    return loopify(st)


def amb_swamp(sec=60):
    n = int(sec * SR); r = np.random.default_rng(61)
    st = np.zeros((n, 2))
    drone = fft_filter(noise(n, 61), lo=40, hi=200) * 0.15
    st += drone[:, None]
    ev = []
    t = 0.5
    while t < sec - 3:
        # bubbling
        for k in range(r.integers(3, 9)):
            m = int(0.05 * SR); x = np.arange(m) / SR
            f = r.uniform(200, 600) * (1 + 4 * x / 0.05)
            ev.append((np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x * 50) * 0.1, t + k * r.uniform(0.05, 0.2), 1))
        t += r.uniform(1, 4)
    t = 1
    while t < sec - 3:  # big bullfrog
        f0 = r.uniform(80, 120)
        for c in range(r.integers(2, 4)):
            d = 0.35; m = int(d * SR); x = np.arange(m) / SR
            y = (np.sin(2 * np.pi * f0 * x) + 0.6 * np.sin(2 * np.pi * f0 * 2 * x) + 0.4 * np.sin(2 * np.pi * f0 * 3 * x)) * np.sin(np.pi * x / d) * (0.7 + 0.3 * np.sin(2 * np.pi * 30 * x))
            ev.append((y * 0.12, t + c * 0.55, 1))
        t += r.uniform(4, 9)
    t = 5
    while t < sec - 3:  # mosquitos
        d = r.uniform(1, 2.5); m = int(d * SR); x = np.arange(m) / SR
        f = 560 + 40 * np.sin(2 * np.pi * 0.8 * x)
        y = np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * np.sin(np.pi * x / d) * 0.012
        ev.append((fft_filter(y, hi=3000), t, 1))
        t += r.uniform(6, 14)
    scatter(st, ev, r)
    st += amb_night_insects(n) * 0.5
    return loopify(reverb(st, 2.8, 0.4, 5))


def amb_night_insects(n):
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * 3800 * t) * (np.sin(2 * np.pi * 45 * t) > 0.5) * slow_lfo(n, 0.2, 9, 0.8) * 0.02
    y = fft_filter(y, lo=2000)
    return np.stack([y, np.roll(y, 9000)], 1)


def amb_wind(sec=60, gulls=False, loons=False, seed=71):
    n = int(sec * SR); r = np.random.default_rng(seed)
    st = np.zeros((n, 2))
    for ch in range(2):
        st[:, ch] = fft_filter(noise(n, seed + ch), lo=150, hi=900) * slow_lfo(n, 0.25, seed + ch, 0.85) * 0.2
        st[:, ch] += fft_filter(noise(n, seed + 3 + ch), lo=1500, hi=4000) * slow_lfo(n, 0.4, seed + 5 + ch, 0.9) * 0.03
    st += water_lap(n, seed + 9) * 0.9
    ev = []
    if gulls:
        t = 2
        while t < sec - 3:
            for k in range(r.integers(1, 4)):
                d = r.uniform(0.3, 0.6); m = int(d * SR); x = np.arange(m) / SR
                f = 1400 + 900 * np.sin(np.pi * x / d) - 600 * x / d
                y = (np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.4 * np.sin(4 * np.pi * np.cumsum(f) / SR)) * np.sin(np.pi * x / d) ** 0.5
                ev.append((fft_filter(y, hi=5000) * 0.05, t + k * r.uniform(0.4, 0.8), r.uniform(0.4, 1)))
            t += r.uniform(5, 11)
    if loons:
        t = 4
        while t < sec - 6:
            seq = [(620, 1.2), (930, 1.6), (780, 1.4)] if r.random() < 0.5 else [(700, 0.4), (1050, 0.4), (700, 0.4), (1050, 0.4), (940, 1.2)]
            tt = t
            for f0, d in seq:
                m = int(d * SR); x = np.arange(m) / SR
                f = f0 * (1 + 0.02 * np.sin(2 * np.pi * 6 * x)) * (1 - 0.04 * x / d)
                y = (np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.25 * np.sin(4 * np.pi * np.cumsum(f) / SR)) * np.sin(np.pi * x / d) ** 0.4
                ev.append((y * 0.045, tt, 1))
                tt += d * 0.9
            t += r.uniform(15, 24)
    scatter(st, ev, r)
    return loopify(reverb(st, 3.0 if loons else 1.6, 0.4 if loons else 0.2, 7))


AMB = {
    'birds': amb_birds, 'night': amb_night, 'river': lambda: amb_river(60, 1.0, 31), 'rapids': lambda: amb_river(60, 1.8, 35),
    'rain': amb_rain, 'swamp': amb_swamp, 'wind': lambda: amb_wind(60, True, False, 71), 'north': lambda: amb_wind(60, False, True, 81),
}


def gen_amb(name):
    st = AMB[name]()
    st = normalize(st, 0.8)
    p = os.path.join(ROOT, 'amb', name + '.mp3')
    write_mp3(p, st, '112k')
    return name, os.path.getsize(p)


# ------------------------------------------------------------------ sfx
def env_exp(n, k):
    return np.exp(-np.arange(n) / SR * k)


def sfx_all():
    S = {}
    r = np.random.default_rng(99)
    # cast whoosh
    n = int(0.7 * SR); t = np.arange(n) / SR
    w = noise(n, 1)
    lo = fft_filter(w, lo=400, hi=1800); hi_ = fft_filter(w, lo=1800, hi=6000)
    e = np.sin(np.pi * np.clip(t / 0.55, 0, 1)) ** 2
    y = (lo * (1 - t / 0.7) + hi_ * (t / 0.7)) * e * 0.6
    # line whistle
    f = 1200 + 2500 * t
    y += np.sin(2 * np.pi * np.cumsum(f) / SR) * e * 0.04
    # reel spin clicks
    clicks = (np.sin(2 * np.pi * (60 - 40 * t) * t * 30) > 0.95).astype(float)
    y += fft_filter(clicks * noise(n, 2), lo=2000) * 0.15 * np.clip(t / 0.2, 0, 1)
    S['cast'] = y
    # plop (float landing)
    n = int(0.45 * SR); t = np.arange(n) / SR
    f = 380 * (1 + 2.2 * np.clip(t / 0.06, 0, 1))
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(n, 35) * 0.5
    y += fft_filter(noise(n, 3), lo=300, hi=3000) * env_exp(n, 18) * 0.35
    S['plop'] = y
    # splash small / big
    for name, dur, lo_, hi2, vol, k in (('splash_s', 0.6, 300, 4000, 0.6, 9), ('splash_b', 1.4, 120, 3500, 1.0, 3.5)):
        n = int(dur * SR); t = np.arange(n) / SR
        y = fft_filter(noise(n, len(name)), lo=lo_, hi=hi2) * env_exp(n, k) * vol
        for d in range(12 if name == 'splash_b' else 5):
            m = int(0.08 * SR); x = np.arange(m) / SR
            fr = r.uniform(500, 1600) * (1 + 3 * x / 0.08)
            dr = np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-x * 45) * 0.25
            s0 = int(r.uniform(0.05, dur * 0.7) * SR)
            e0 = min(n, s0 + m)
            y[s0:e0] += dr[:e0 - s0]
        S[name] = y
    # reel loop (1.0s of ratchet + gear)
    n = int(1.0 * SR); t = np.arange(n) / SR
    y = np.zeros(n)
    for i in range(int(1.0 * 26)):
        s0 = int(i / 26 * SR)
        m = int(0.012 * SR)
        y[s0:s0 + m] += fft_filter(noise(m, i), lo=2500, hi=9000) * np.exp(-np.arange(m) / SR * 400) * 0.6
    y += np.sin(2 * np.pi * 180 * t + 3 * np.sin(2 * np.pi * 13 * t)) * 0.05
    y += fft_filter(noise(n, 5), lo=300, hi=900) * 0.05
    S['reel'] = y
    # drag zing loop
    n = int(1.0 * SR); t = np.arange(n) / SR
    y = np.zeros(n)
    rate = 70
    for i in range(int(rate)):
        s0 = int(i / rate * SR); m = int(0.006 * SR)
        y[s0:s0 + m] += fft_filter(noise(m, 100 + i), lo=3000) * np.exp(-np.arange(m) / SR * 900) * 0.8
    y += np.sin(2 * np.pi * 2200 * t) * 0.03 * (1 + 0.5 * np.sin(2 * np.pi * 70 * t))
    S['drag'] = y
    # line snap
    n = int(0.9 * SR); t = np.arange(n) / SR
    y = fft_filter(noise(n, 7), lo=1500) * env_exp(n, 60) * 1.0
    f = 1800 * np.exp(-t * 5) + 200
    y += np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(n, 6) * 0.3
    y += np.sin(2 * np.pi * 90 * t) * env_exp(n, 12) * 0.4
    S['snap'] = y
    # fish flop (landing)
    n = int(1.2 * SR)
    y = np.zeros(n)
    for i in range(6):
        s0 = int((0.05 + i * 0.16 + r.uniform(0, 0.05)) * SR); m = int(0.12 * SR)
        x = np.arange(m) / SR
        y[s0:s0 + m] += (fft_filter(noise(m, 200 + i), lo=200, hi=2500) * np.exp(-x * 35) + np.sin(2 * np.pi * 140 * x) * np.exp(-x * 50) * 0.6) * (1 - i * 0.12)
    S['flop'] = y
    # coin
    n = int(0.8 * SR); t = np.arange(n) / SR
    y = (np.sin(2 * np.pi * 1975 * t) + 0.6 * np.sin(2 * np.pi * 2637 * t)) * env_exp(n, 7) * 0.4
    y[int(0.07 * SR):] += (np.sin(2 * np.pi * 2637 * t) + 0.5 * np.sin(2 * np.pi * 3520 * t))[:n - int(0.07 * SR)] * env_exp(n - int(0.07 * SR), 6) * 0.35
    S['coin'] = y
    # bell (feeder bite alarm)
    n = int(1.2 * SR); t = np.arange(n) / SR
    y = np.zeros(n)
    for i in range(3):
        s0 = int(i * 0.11 * SR)
        x = t[:n - s0]
        y[s0:] += (np.sin(2 * np.pi * 2350 * x) + 0.5 * np.sin(2 * np.pi * 5400 * x) + 0.3 * np.sin(2 * np.pi * 3700 * x)) * np.exp(-x * 9) * 0.3
    S['bell'] = y
    # bite twitch (soft water tick)
    n = int(0.25 * SR); t = np.arange(n) / SR
    y = np.sin(2 * np.pi * (700 + 1500 * t) * t) * env_exp(n, 30) * 0.4 + fft_filter(noise(n, 9), lo=500, hi=2500) * env_exp(n, 40) * 0.2
    S['nibble'] = y
    # hook set (rod whoosh + thump)
    n = int(0.4 * SR); t = np.arange(n) / SR
    y = fft_filter(noise(n, 11), lo=600, hi=3000) * np.sin(np.pi * np.clip(t / 0.25, 0, 1)) * 0.6 + np.sin(2 * np.pi * 70 * t) * env_exp(n, 15) * 0.6
    S['hookset'] = y
    # click / ui
    n = int(0.08 * SR); t = np.arange(n) / SR
    S['click'] = (np.sin(2 * np.pi * 1300 * t) * env_exp(n, 70) + fft_filter(noise(n, 12), lo=2000) * env_exp(n, 150) * 0.4) * 0.6
    # page / paper
    n = int(0.35 * SR); t = np.arange(n) / SR
    S['paper'] = fft_filter(noise(n, 13), lo=1500, hi=7000) * np.sin(np.pi * t / 0.35) ** 2 * 0.35
    # bubbles
    n = int(1.0 * SR); y = np.zeros(n)
    for i in range(8):
        m = int(0.06 * SR); x = np.arange(m) / SR
        fr = r.uniform(400, 900) * (1 + 3 * x / 0.06)
        s0 = int(r.uniform(0, 0.9) * SR); e0 = min(n, s0 + m)
        y[s0:e0] += (np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-x * 50) * 0.3)[:e0 - s0]
    S['bubbles'] = y
    # snag (creak)
    n = int(0.8 * SR); t = np.arange(n) / SR
    saw = ((t * 95) % 1) * 2 - 1
    S['snag'] = fft_filter(saw * (np.sin(2 * np.pi * 9 * t) > 0) , lo=200, hi=2000) * env_exp(n, 3) * 0.4
    # buy (cash register)
    n = int(0.7 * SR); t = np.arange(n) / SR
    y = fft_filter(noise(n, 14), lo=2000, hi=8000) * env_exp(n, 40) * 0.4
    y += (np.sin(2 * np.pi * 2093 * t) + np.sin(2 * np.pi * 2637 * t)) * env_exp(n, 6) * 0.2
    S['buy'] = y
    # error
    n = int(0.35 * SR); t = np.arange(n) / SR
    S['error'] = (np.sign(np.sin(2 * np.pi * 180 * t)) * 0.3 + np.sin(2 * np.pi * 120 * t) * 0.4) * env_exp(n, 8) * 0.4
    out = []
    for k, y in S.items():
        y = y / (np.max(np.abs(y)) + 1e-9) * 0.9
        fade = int(0.01 * SR)
        if k not in ('reel', 'drag'):
            y[-fade:] *= np.linspace(1, 0, fade)
        st = np.stack([y, y], 1)
        p = os.path.join(ROOT, 'sfx', k + '.mp3')
        write_mp3(p, st, '96k', mono=True)
        out.append((k, os.path.getsize(p)))
    return out


def task(job):
    kind, name = job
    if kind == 'music':
        return gen_music(name)
    if kind == 'amb':
        return gen_amb(name)
    if kind == 'jingles':
        return gen_jingles()
    if kind == 'sfx':
        return sfx_all()


if __name__ == '__main__':
    what = sys.argv[1:] or ['music', 'amb', 'jingles', 'sfx']
    jobs = []
    if 'music' in what:
        jobs += [('music', k) for k in MUSIC]
    if 'amb' in what:
        jobs += [('amb', k) for k in AMB]
    if 'jingles' in what:
        jobs.append(('jingles', None))
    if 'sfx' in what:
        jobs.append(('sfx', None))
    for w in what:
        if w in MUSIC:
            jobs.append(('music', w))
        if w in AMB:
            jobs.append(('amb', w))
    with Pool(4) as p:
        for res in p.imap_unordered(task, jobs):
            print(res, flush=True)
