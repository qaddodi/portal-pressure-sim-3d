#!/usr/bin/env python3
"""iPhone / iPad home-screen launch images (splash plan A8, 22 Nov 2026).

Without a startup image an iOS home-screen launch shows a plain screen until the page paints. These images are the cover as it looks at its first paint (index.html #boot: the look's ground, the 64 px mark, the
name in Source Serif 4 600 20 px, the same centring, and the empty track of the wait bar, which the cover has from its first paint), for Light and Dark, so the launch screen, the cover and the figure follow on with nothing changing between them.

Run by hand when the cover's look changes (a manual tool, in no workflow, no browser):   pip install pillow fonttools brotli;  python3 scripts/startup-images.py
It writes public/brand/launch/*.png and the <link rel="apple-touch-startup-image"> block between the markers in index.html. tests/startup-images.test.ts checks the files, their sizes and the grounds.
Known limit: the images are Light and Dark only (a media query cannot see the saved look), so a viewer who chose Soft, Navy or Black sees Light or Dark until the cover paints.
STATUS_BAR is an assumption: a standalone page's viewport starts under the status bar, so the cover centres lower than the screen's middle by half of it (not yet checked on a device).
"""
import os, re, sys
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public/brand/launch')
THEMES = {'light': ('#F1EBE0', '#1B1710'), 'dark': ('#1A1917', '#EEEBE5')}   # (ground, name colour: the look table's; tests/startup-images.test.ts holds them to the look table)
NAME = 'Portal Pressure Simulator 3D'
# (CSS width, CSS height, device pixel ratio, status bar height in CSS px), portrait; iPads also go out in landscape
PHONES = [(440, 956, 3, 62), (402, 874, 3, 62), (430, 932, 3, 59), (393, 852, 3, 59), (428, 926, 3, 47), (390, 844, 3, 47), (375, 812, 3, 44), (414, 896, 3, 44), (414, 896, 2, 44), (375, 667, 2, 20)]
PADS = [(1032, 1376, 2, 24), (1024, 1366, 2, 24), (834, 1210, 2, 24), (834, 1194, 2, 24), (820, 1180, 2, 24), (810, 1080, 2, 24), (768, 1024, 2, 20)]
BAR_W, BAR_H = 172, 3
MARK, GAP, NAME_PX, BAR_BLOCK = 64, 16, 20, 29   # (the cover: mark, flex gap, name size, the progress block: its 4 px margin, the 3 px bar, 6 px and the 16 px row of the stage and percent, laid out even while still invisible)

def font(px):
    cache = os.path.join('/tmp', 'source-serif-600-opsz20.ttf')
    if not os.path.exists(cache):
        f = TTFont(os.path.join(ROOT, 'public/fonts/source-serif-4-latin.woff2'))
        g = instancer.instantiateVariableFont(f, {'wght': 600, 'opsz': 20}); g.flavor = None; g.save(cache)
    return ImageFont.truetype(cache, px)

def hexrgb(h): return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))

def render(w, h, dpr, sb, theme):
    ground, ink = THEMES[theme]
    im = Image.new('RGB', (w * dpr, h * dpr), hexrgb(ground))
    s = dpr
    block = MARK + GAP + round(NAME_PX * 1.2) + GAP + BAR_BLOCK
    top = (h + sb) / 2 - block / 2          # (the cover's centre: the middle of the viewport, which starts under the status bar)
    mark = Image.open(os.path.join(ROOT, 'public/brand/icon-512.png')).convert('RGBA').resize((MARK * s, MARK * s), Image.LANCZOS)
    im.paste(mark, (round((w - MARK) / 2 * s), round(top * s)), mark)
    f = font(NAME_PX * s)
    asc, desc = f.getmetrics()
    line = NAME_PX * 1.2 * s
    base = (top + MARK + GAP) * s + (line - (asc + desc)) / 2 + asc
    track = -0.01 * NAME_PX * s                # (letter-spacing: -.01em)
    total = sum(f.getlength(NAME[:i + 1]) - f.getlength(NAME[:i]) + track for i in range(len(NAME)))
    x = (w * s - total) / 2
    d = ImageDraw.Draw(im)
    for i, ch in enumerate(NAME):
        d.text((x, base), ch, font=f, fill=hexrgb(ink), anchor='ls')
        x += f.getlength(NAME[:i + 1]) - f.getlength(NAME[:i]) + track
    # the empty wait bar (plan 49, 23 Nov): the cover now has its track from the first paint, so the launch image has it too, at the cover's own offset (4 px under the name block's gap, 172 x 3 px, radius 3,
    # 14% of the text colour over the ground), and the page's fade-in lands on it
    ty = top + MARK + GAP + round(NAME_PX * 1.2) + GAP + 4
    tx = (w - BAR_W) / 2
    ink_rgb, bg_rgb = hexrgb(ink), hexrgb(ground)
    track_rgb = tuple(round(bg_rgb[k] + (ink_rgb[k] - bg_rgb[k]) * 0.14) for k in range(3))
    d.rounded_rectangle((round(tx * s), round(ty * s), round((tx + BAR_W) * s) - 1, round((ty + BAR_H) * s) - 1), radius=BAR_H * s / 2, fill=track_rgb)
    return im

def entries():
    for (w, h, d, sb) in PHONES: yield (w, h, d, sb, 'portrait')
    for (w, h, d, sb) in PADS:
        yield (w, h, d, sb, 'portrait'); yield (h, w, d, sb, 'landscape')

def fname(w, h, d, theme): return f'{w * d}x{h * d}-{theme}.png'

def main():
    os.makedirs(OUT, exist_ok=True)
    links = []
    for (w, h, d, sb, o) in entries():
        for theme in THEMES:
            name = fname(w, h, d, theme)
            render(w, h, d, sb, theme).save(os.path.join(OUT, name), optimize=True)
            scheme = 'dark' if theme == 'dark' else 'light'
            links.append(f'  <link rel="apple-touch-startup-image" media="(device-width: {w}px) and (device-height: {h}px) and (-webkit-device-pixel-ratio: {d}) and (orientation: {o}) and (prefers-color-scheme: {scheme})" href="./brand/launch/{name}">')
    p = os.path.join(ROOT, 'index.html'); s = open(p).read()
    a, b = '<!-- startup-images:begin -->', '<!-- startup-images:end -->'
    i, j = s.index(a), s.index(b)
    s = s[:i + len(a)] + '\n' + '\n'.join(links) + '\n  ' + s[j:]
    open(p, 'w').write(s)
    print(f'{len(links)} images and links written')

if __name__ == '__main__': main()
