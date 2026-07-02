#!/usr/bin/env python3
"""Regenerate every app icon / logo asset from the repo-root `icon.png`.

The source is a 2048x2048 AI-generated app-icon tile whose "transparency" is a
FAKE checkerboard baked into the pixels (plus a soft drop shadow and a
watermark sparkle), so it can't be color-keyed. Instead the tile's silhouette
was measured once (per-pixel edge profiles for the straight edges, a
gradient-energy fit for the corners) and is cut with an analytic anti-aliased
superellipse mask — the constants below. The bottom edge (B) includes the
tile's dark bevel UNDERSIDE (a cool-tinted ~18px band that ends in a sharp
step), not just the bright rim — clipping it made the bottom rim read thinner
than the top.

Outputs:
  public/logo.png                   the in-app mark (transparent squircle)
  build/icon-master.png             1024², transparent margin (Windows draws as-is)
  build/icon.ico                    multi-size, from the master
  build/icon-master-fullbleed.png   1024² opaque, rim MITERED to the square
                                    corners (see below) — the macOS master
  build/icon.png                    1024² full-bleed (dev dock + linux deb/rpm)
  build/icon.icns                   via `iconutil` (macOS only)

The full-bleed corners are NOT flat navy: macOS 26 (Tahoe) composites legacy
icons (.icns and the dev-dock PNG alike) onto its standardized tile and masks
them to ITS squircle, whose corner radius (~22.4%) is squarer than the
artwork's (~29%). Flat corners would show as navy gaps breaking the silver rim
at all four corners, so the straight-edge rim cross-sections are extended into
the corner regions with a 45-degree miter (a 9-slice), keeping the frame
continuous under any OS mask radius up to the artwork's own.

Needs Pillow + numpy (`python3 -m venv v && v/bin/pip install pillow numpy`).
Run from the repo root: `python3 build/make-icons.py`
"""

import os
import shutil
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image

# ---- the fitted silhouette of icon.png (2048x2048) ----
L, T, R, B = 244.0, 234.5, 1802.5, 1811.0  # straight edges (B includes the bevel underside)
RAD, EXP = 459.0, 3.0                      # superellipse corner: (dx/r)^n + (dy/r)^n = 1


def superellipse_alpha(h, w):
    """4x4-supersampled coverage of the tile silhouette -> uint8 alpha."""
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float64)
    acc = np.zeros((h, w))
    for oy in (0.125, 0.375, 0.625, 0.875):
        for ox in (0.125, 0.375, 0.625, 0.875):
            x, y = xs + ox, ys + oy
            dx = np.maximum(np.maximum(L + RAD - x, x - (R - RAD)), 0.0) / RAD
            dy = np.maximum(np.maximum(T + RAD - y, y - (B - RAD)), 0.0) / RAD
            acc += (dx**EXP + dy**EXP <= 1.0) & (x >= L) & (x <= R) & (y >= T) & (y <= B)
    return (acc / 16.0 * 255.0).round().astype(np.uint8)


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(root)
    rgb = np.asarray(Image.open('icon.png').convert('RGB'))
    alpha = superellipse_alpha(*rgb.shape[:2])

    x0, y0 = int(L), int(T)
    x1, y1 = int(np.ceil(R)) + 1, int(np.ceil(B)) + 1
    tile_rgb = rgb[y0:y1, x0:x1]
    tile_a = alpha[y0:y1, x0:x1]
    th, tw = tile_rgb.shape[:2]

    # --- the transparent squircle (in-app logo + Windows master) ---
    tile = Image.fromarray(np.dstack([tile_rgb, tile_a]))
    side = max(tw, th)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.paste(tile, ((side - tw) // 2, (side - th) // 2))
    sq.resize((1024, 1024), Image.LANCZOS).save('public/logo.png')

    master = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
    fitted = sq.resize((840, 840), Image.LANCZOS)
    master.paste(fitted, (92, 92), fitted)
    master.save('build/icon-master.png')
    master.save('build/icon.ico',
                sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

    # --- the full-bleed macOS master: miter the rim into the square corners ---
    prof_row = tile_rgb[:, tw // 2, :]   # vertical cross-section (top/bottom bands)
    prof_col = tile_rgb[th // 2, :, :]   # horizontal cross-section (left/right bands)
    synth = tile_rgb.copy()
    for y, x in zip(*np.where(tile_a < 250)):
        dxl, dxr = x, tw - 1 - x
        dyt, dyb = y, th - 1 - y
        if min(dyt, dyb) <= min(dxl, dxr):
            synth[y, x] = prof_row[y]
        else:
            synth[y, x] = prof_col[x]
    w = (tile_a.astype(np.float64) / 255.0)[..., None]
    full = (tile_rgb * w + synth * (1.0 - w)).round().astype(np.uint8)
    fb = Image.fromarray(full).resize((1024, 1024), Image.LANCZOS)
    fb.save('build/icon-master-fullbleed.png')
    fb.save('build/icon.png')

    # --- iconset -> icns (macOS only; skipped elsewhere) ---
    if shutil.which('iconutil'):
        with tempfile.TemporaryDirectory() as tmp:
            iconset = os.path.join(tmp, 'icon.iconset')
            os.makedirs(iconset)
            for name, px in [('icon_16x16', 16), ('icon_16x16@2x', 32), ('icon_32x32', 32),
                             ('icon_32x32@2x', 64), ('icon_128x128', 128), ('icon_128x128@2x', 256),
                             ('icon_256x256', 256), ('icon_256x256@2x', 512), ('icon_512x512', 512),
                             ('icon_512x512@2x', 1024)]:
                fb.resize((px, px), Image.LANCZOS).save(f'{iconset}/{name}.png')
            subprocess.run(['iconutil', '-c', 'icns', iconset, '-o', 'build/icon.icns'], check=True)
    else:
        print('iconutil not found — skipped build/icon.icns', file=sys.stderr)
    print('icon assets regenerated')


if __name__ == '__main__':
    main()
