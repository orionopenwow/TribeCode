#!/usr/bin/env python3
"""Original soundtrack for site/ad-slow.html (v0.27): a warm lo-fi / chiptune bed, generated from nothing.

No samples, no loops from anywhere else: every sound here is synthesized with numpy. Layers:
  campfire crackle (filtered noise + random pops), soft pad chords, a round bass, a gentle triangle melody,
  light drums that start when the friends' AI helpers get to work and build a little into the company beat,
  tiny UI blips on the moments the picture shows (message lands, tool lines, approve click), and a resolve
  on the end card that fades out.
The beat and event times match BEATS / the timeline in site/ad-slow.html.

Usage:  python3 scripts/dev/ad-soundtrack.py OUT.wav      (48 kHz stereo, 16-bit, peak-limited)
Then loudness-normalise with ffmpeg (two-pass loudnorm to -16 LUFS), as scripts/dev comments in the playbook show.
"""
import sys, wave
import numpy as np
from scipy.signal import lfilter, butter

SR = 48000
DUR = 33.0
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(27)

BAR = 2.75                    # seconds per bar (4 beats), so the end card at 27.5 s lands exactly on bar 10
BEAT = BAR / 4
END = 27.5                    # end card
DRUMS_IN = 10.0               # the chat beat: the AI helpers start building
BUILD = 22.5                  # company beat: hats get busier
# UI moments, same as the page: message lands, chat lines and tool lines, stats, live chip, seats, approval, click, end card
BLIPS = [(8.1, 'land'), (10.4, 'soft'), (11.2, 'soft'), (13.0, 'tick'), (13.6, 'tick'), (14.2, 'tick'), (14.8, 'ok'),
         (15.4, 'soft'), (16.0, 'soft'), (18.0, 'soft'), (21.2, 'soft'), (22.9, 'tick'), (23.3, 'tick'), (23.7, 'tick'),
         (24.1, 'tick'), (24.5, 'soft'), (25.65, 'click'), (27.7, 'chime')]

def midi(n): return 440.0 * 2 ** ((n - 69) / 12)

def lp(x, hz, order=2):
    b, a = butter(order, hz / (SR / 2), 'low'); return lfilter(b, a, x)

def hp(x, hz, order=2):
    b, a = butter(order, hz / (SR / 2), 'high'); return lfilter(b, a, x)

def bp(x, lo, hi, order=2):
    b, a = butter(order, [lo / (SR / 2), hi / (SR / 2)], 'band'); return lfilter(b, a, x)

def env_adsr(n, a, d, s, r, sr=SR):
    a, d, r = int(a * sr), int(d * sr), int(r * sr)
    sus = max(0, n - a - d - r)
    e = np.concatenate([np.linspace(0, 1, max(a, 1)), np.linspace(1, s, max(d, 1)), np.full(sus, s), np.linspace(s, 0, max(r, 1))])
    return e[:n] if len(e) >= n else np.pad(e, (0, n - len(e)))

def place(buf, start, sig):
    i = int(start * SR)
    if i >= len(buf): return
    j = min(len(buf), i + len(sig)); buf[i:j] += sig[: j - i]

def saw(f, n, phase=0.0):
    ph = (phase + np.arange(n) * f / SR) % 1.0
    return 2 * ph - 1

def tri(f, n):
    ph = (np.arange(n) * f / SR) % 1.0
    return 4 * np.abs(ph - 0.5) - 1

L = np.zeros(N); R = np.zeros(N)

# ---------------- campfire crackle ----------------
noise = rng.standard_normal(N)
rumble = bp(noise, 60, 260) * 0.28
hiss = bp(noise, 1800, 6000) * 0.05
fire = rumble + hiss
pops = np.zeros(N)
pop_times = np.sort(rng.uniform(0, DUR, 260))
for pt in pop_times:
    n = int(SR * rng.uniform(0.004, 0.02))
    burst = rng.standard_normal(n) * np.exp(-np.linspace(0, 7, n)) * rng.uniform(0.2, 1.0)
    place(pops, pt, burst)
pops = bp(pops, 900, 7000) * 0.5
crackle = fire + pops
fire_level = 0.11 + 0.07 * np.exp(-((t - 2.0) / 3.0) ** 2) + 0.05 * (t > END)      # a bit louder in the opening and the end
crackle *= fire_level
L += crackle * 1.0; R += crackle * 0.85

# ---------------- chords (one per bar) ----------------
# C major, lo-fi voicings. Bars 0..11; bar 10 (END) resolves to Cmaj9 and holds.
CH = [
    [53, 57, 60, 64],  # Fmaj7
    [52, 55, 59, 62],  # Em7
    [57, 60, 64, 67],  # Am7
    [50, 53, 57, 60],  # Dm7
    [53, 57, 60, 64],  # Fmaj7
    [52, 55, 59, 62],  # Em7
    [57, 60, 64, 67],  # Am7
    [55, 59, 62, 65],  # G7
    [53, 57, 60, 64],  # Fmaj7 (company beat lifts)
    [55, 59, 62, 65],  # G7  -> resolves
    [48, 52, 55, 59, 62],  # Cmaj9 (end card)
    [48, 52, 55, 59, 62],
]
BASS = [41, 40, 45, 38, 41, 40, 45, 43, 41, 43, 36, 36]
pad = np.zeros((2, N))
for b, notes in enumerate(CH):
    start = b * BAR
    if start >= DUR: break
    length = BAR + 0.6 if b < 10 else DUR - start
    n = int(length * SR)
    e = env_adsr(n, 0.5, 0.4, 0.8, 0.6 if b < 10 else 3.0)
    for k_, m in enumerate(notes):
        f = midi(m)
        sl = saw(f * 0.997, n, 0.1 * k_) + saw(f * 1.004, n, 0.37)
        sr_ = saw(f * 1.003, n, 0.21) + saw(f * 0.996, n, 0.53)
        place(pad[0], start, sl * e * 0.045); place(pad[1], start, sr_ * e * 0.045)
pad_lvl = np.clip(t / 2.5, 0, 1) * 0.85 + 0.15 * (t > BUILD)
pad[0] = lp(pad[0], 1400) * pad_lvl; pad[1] = lp(pad[1], 1400) * pad_lvl
# slow "tape" wobble
wob = 1 + 0.06 * np.sin(2 * np.pi * 0.35 * t)
L += pad[0] * wob; R += pad[1] * wob

# ---------------- bass (from the first spoken words) ----------------
bass = np.zeros(N)
for b, m in enumerate(BASS):
    start = b * BAR
    if start < 4.5 - BAR or start >= DUR: continue
    for beat in (0, 2.5):        # root on 1, a soft push on the "and" of 3
        s = start + beat * BEAT
        if s < 4.5 or s >= DUR or (s >= END and beat): continue
        n = int((BEAT * (1.4 if beat == 0 else 0.9) if s < END else DUR - s) * SR)
        f = midi(m)
        sig = (np.sin(2 * np.pi * f * np.arange(n) / SR) + 0.25 * tri(f * 2, n)) * env_adsr(n, 0.01, 0.15, 0.6, 0.12 if s < END else 2.5)
        place(bass, s, sig * 0.11)
bass = lp(bass, 600)
L += bass; R += bass

# ---------------- melody: a gentle triangle tune ----------------
# (beat offset within the bar, MIDI note, length in beats); a two-bar phrase with an answer
PH_A = [(0, 72, 1), (1, 74, .5), (1.5, 76, 1.5), (3, 79, 1), (4, 76, 1), (5, 74, 1), (6, 72, 2)]
PH_B = [(0, 76, 1), (1, 79, .5), (1.5, 81, 1.5), (3, 79, 1), (4, 76, .5), (4.5, 74, .5), (5, 76, 1), (6, 74, 2)]
PH_C = [(0, 81, 1), (1, 79, .5), (1.5, 76, 1), (2.5, 79, .5), (3, 84, 1.5), (4.5, 81, .5), (5, 79, 1), (6, 76, 2)]
melody = np.zeros(N)
plan = [(2, PH_A), (4, PH_B), (6, PH_A), (8, PH_C)]   # starts at bar 2 (5.5 s), right as Camp starts talking
for bar0, ph in plan:
    for off, m, ln in ph:
        s = bar0 * BAR + off * BEAT
        if s >= END: continue
        n = int(ln * BEAT * SR)
        f = midi(m)
        sig = tri(f, n) * env_adsr(n, 0.01, 0.12, 0.55, min(0.2, ln * BEAT * 0.5))
        sig += 0.18 * np.sin(2 * np.pi * f * 2 * np.arange(n) / SR) * env_adsr(n, 0.005, 0.08, 0.2, 0.1)
        place(melody, s, sig * 0.12)
# the resolve on the end card: a soft high C with a fifth, ringing out
for m, d in ((84, 0.0), (79, 0.18), (88, 0.36)):
    n = int((DUR - END - d) * SR)
    f = midi(m)
    sig = tri(f, n) * np.exp(-np.linspace(0, 4.5, n)) * env_adsr(n, 0.01, 0.1, 1, 0.2)
    place(melody, END + d, sig * 0.09)
melody = lp(melody, 5200)
# a short echo for space
echo = np.zeros(N); dly = int(BEAT * 0.75 * SR); echo[dly:] = melody[:-dly] * 0.32
L += melody + echo * 0.6; R += melody * 0.9 + echo

# ---------------- drums ----------------
def kick():
    n = int(0.32 * SR); x = np.arange(n) / SR
    f = 52 + 70 * np.exp(-x * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x * 9) * 0.5
def snare():
    n = int(0.22 * SR)
    return bp(rng.standard_normal(n), 900, 5200) * np.exp(-np.linspace(0, 9, n)) * 0.17 + \
           np.sin(2 * np.pi * 190 * np.arange(n) / SR) * np.exp(-np.linspace(0, 14, n)) * 0.08
def hat(open_=False):
    n = int((0.12 if open_ else 0.045) * SR)
    return hp(rng.standard_normal(n), 7000) * np.exp(-np.linspace(0, 6 if open_ else 10, n)) * 0.05
dL = np.zeros(N); dR = np.zeros(N)
first = int(np.ceil(DRUMS_IN / BEAT))
b = first
while b * BEAT < END - 0.01:
    s = b * BEAT; pos = b % 4
    swing = 0.0
    if pos in (0, 2): place(dL, s, kick()); place(dR, s, kick())
    if pos in (1, 3): sn = snare(); place(dL, s, sn * 0.9); place(dR, s, sn)
    # hats: 8ths, softly swung; 16ths from the company beat on
    for sub in ((0, .5) if s < BUILD else (0, .25, .5, .75)):
        hs = s + sub * BEAT + (0.06 * BEAT if sub == .5 else 0)
        h = hat(open_=(sub == .5 and pos == 3)) * (0.6 if sub in (.25, .75) else 1.0)
        place(dL, hs, h * 0.7); place(dR, hs, h * 1.1)
    b += 1
# a soft fill into the end card
for i, off in enumerate((-0.5, -0.375, -0.25, -0.125)):
    sn = snare() * (0.35 + 0.15 * i); place(dL, END + off * BEAT * 2, sn); place(dR, END + off * BEAT * 2, sn)
drum_lvl = np.clip((t - DRUMS_IN) / 1.5, 0, 1) * (0.85 + 0.25 * (t > BUILD))
dL = lp(dL, 9000) * drum_lvl; dR = lp(dR, 9000) * drum_lvl
L += dL; R += dR

# ---------------- UI blips ----------------
def blip(kind):
    def tone(f, d, a=0.12):
        n = int(d * SR); x = np.arange(n) / SR
        return (np.sin(2 * np.pi * f * x) + 0.3 * tri(f * 2, n)) * np.exp(-x * 30) * a
    if kind == 'land':  return np.concatenate([tone(midi(84), .07), tone(midi(91), .16)])
    if kind == 'soft':  return tone(midi(88), .12, .07)
    if kind == 'tick':  return tone(midi(96), .05, .05)
    if kind == 'ok':    return np.concatenate([tone(midi(88), .06, .08), tone(midi(95), .14, .08)])
    if kind == 'click': return np.concatenate([tone(midi(79), .04, .1), tone(midi(91), .08, .1), tone(midi(96), .18, .09)])
    if kind == 'chime': return np.concatenate([tone(midi(84), .1, .07), tone(midi(88), .1, .07), tone(midi(91), .35, .07)])
ui = np.zeros(N)
for when, kind in BLIPS: place(ui, when, blip(kind))
L += ui * 0.9; R += ui

# ---------------- master: fade in/out, gentle saturation, peak safety ----------------
fade = np.clip(t / 0.25, 0, 1) * np.clip((DUR - t) / 3.0, 0, 1)
L *= fade; R *= fade
L = hp(L, 32); R = hp(R, 32)                         # no sub rumble
mix = np.stack([L, R], 1)
mix = np.tanh(mix * 1.4) / 1.4
mix *= 0.89 / max(1e-9, np.abs(mix).max())           # leave headroom; loudnorm sets the final level
out = sys.argv[1] if len(sys.argv) > 1 else 'ad-soundtrack.wav'
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype('<i2').tobytes())
print('wrote', out, f'{DUR}s')
