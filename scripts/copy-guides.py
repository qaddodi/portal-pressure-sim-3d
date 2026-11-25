#!/usr/bin/env python3
"""Makes the 3D build's two tester guides from the 2D app's (parity plan, batch B15; docs/guides.md).

    python3 scripts/copy-guides.py --from <2D checkout> [--out public/guides] [--check]

The 2D guides (guides/beta-start-guide.pdf, Letter, and guides/beta-start-guide-iphone.pdf) are copied with ONLY the words that differ for the 3D build changed
(scripts/guides-edits.json): the link, the title line, and the paragraphs that say something that is not true of the 3D app (its loading screen, its timed feedback
card) or that Send feedback now does more. The pictures stay the 2D app's here; `--refresh --shots <dir>` then lays the 3D app's own shots over them
(scripts/capture-guide-shots.mjs, docs/guides.md), keeping the file names and the places. A paragraph is one text block of the PDF (the guides are ReportLab
output: one `BT ... ET` per paragraph, the lines by `T*`); it is rewritten in the same block, so the size, leading, colour and place stay the 2D guide's and nothing else is
touched. The fonts are the PDF's own Helvetica (not embedded), so the wrap is measured with Helvetica's widths.
`--check` writes nothing and fails when a guide in --out is not what this script makes from the 2D one (compared by text, page count and size).
Needs pypdf and PyMuPDF (pip install pypdf pymupdf; PyMuPDF only measures text).
"""
import argparse, json, re, sys, pathlib
import pymupdf
from pypdf import PdfReader, PdfWriter

ROOT = pathlib.Path(__file__).resolve().parent.parent
EDITS = json.loads((ROOT / 'scripts' / 'guides-edits.json').read_text())
FONT = {False: ('F1', 'helv'), True: ('F2', 'hebo')}

def esc(s):
    return s.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')

def measure(text, bold, size):
    return pymupdf.get_text_length(text, fontname=FONT[bold][1], fontsize=size)

def wrap(runs, size, width):
    """Greedy word wrap. Returns lines, each a list of (text, bold) pieces (a space inside a piece, one between pieces by their own text)."""
    toks = []   # (word, bold) or None for a forced break
    for text, bold in runs:
        for k, line in enumerate(text.split('\n')):
            if k > 0: toks.append(None)
            parts = line.split(' ')
            for i, w in enumerate(parts):
                if w == '': 
                    if toks and toks[-1] is not None and i > 0: toks.append((' ', bold))   # a space kept at a run's edge
                    elif i == 0 and len(parts) > 1 and toks and toks[-1] is not None: toks.append((' ', bold))
                    continue
                if i > 0 and toks and toks[-1] is not None and toks[-1][0] != ' ': toks.append((' ', bold))
                toks.append((w, bold))
    lines, cur, x = [], [], 0.0
    for t in toks:
        if t is None:
            lines.append(cur); cur, x = [], 0.0; continue
        w = measure(t[0], t[1], size)
        if t[0] == ' ':
            if cur: cur.append(t); x += w
            continue
        if cur and x + w > width + 0.01:
            while cur and cur[-1][0] == ' ': cur.pop()
            lines.append(cur); cur, x = [], 0.0
        cur.append(t); x += w
    while cur and cur[-1][0] == ' ': cur.pop()
    if cur: lines.append(cur)
    return lines

def merged(line):
    out = []
    for text, bold in line:
        if out and out[-1][1] == bold: out[-1][0] += text
        else: out.append([text, bold])
    return out

BLOCK = re.compile(r'BT 1 0 0 1 ([\d.]+) ([\d.]+) Tm ((?:-?[\d.]+ Tw )?)([\d.]+) TL /F[12] ([\d.]+) Tf ([\d. ]+ rg) (.*?) ET', re.S)

# (a block this script wrote itself: the colour comes before the font, the first font is not set apart)
BLOCK_OWN = re.compile(r'BT 1 0 0 1 ([\d.]+) ([\d.]+) Tm ()([\d.]+) TL ([\d. ]+ rg) /F[12] ([\d.]+) Tf (.*?) ET', re.S)

def rewrite(content, para, label, key='find'):
    for m, own in [(m, False) for m in BLOCK.finditer(content)] + [(m, True) for m in BLOCK_OWN.finditer(content)]:
        if para[key] in m.group(7):
            break
    else:
        sys.exit(f"{label}: the 2D guide has no paragraph with \"{para[key]}\" any more; update scripts/guides-edits.json")
    if own: x, y, _tw, tl, color, size, body = m.group(1), m.group(2), m.group(3), float(m.group(4)), m.group(5), float(m.group(6)), m.group(7)
    else: x, y, _tw, tl, size, color, body = m.group(1), m.group(2), m.group(3), float(m.group(4)), float(m.group(5)), m.group(6), m.group(7)
    old_lines = body.count(' T* ') + body.count('T* ') + (0 if body.rstrip().endswith('T*') else 1)
    old_lines = len(re.findall(r'T\*', body))
    lines = wrap(para['runs'], size, para['width'])
    if len(lines) > old_lines:
        sys.exit(f"{label}: the new words need {len(lines)} lines and the picture below leaves {old_lines}; shorten them in scripts/guides-edits.json")
    out = [f'BT 1 0 0 1 {x} {y} Tm {tl:g} TL {color}']
    cur = None
    for line in lines:
        for text, bold in merged(line):
            f = FONT[bold][0]
            if f != cur: out.append(f'/{f} {size:g} Tf'); cur = f
            out.append(f'({esc(text)}) Tj')
        out.append('T*')
    out.append('ET')
    return content[:m.start()] + ' '.join(out) + content[m.end():]

def put(page, content):
    """Replaces the page's content stream in place (the old stream is not left in the file)."""
    c = page['/Contents'].get_object()
    if not hasattr(c, 'set_data'): sys.exit('the page content is not one stream; this script reads the 2D guides as ReportLab writes them')
    c.set_data(content.encode('latin1'))

def make(src, dst, name):
    ed = EDITS['files'][name]
    reader = PdfReader(src)
    writer = PdfWriter(clone_from=reader)
    for para in ed['paragraphs']:
        page = writer.pages[para['page']]
        content = page.get_contents().get_data().decode('latin1')
        content = rewrite(content, para, f"{name} page {para['page'] + 1}")
        put(page, content)
    # the title line under the app's name, and the link wherever it is still written
    page = writer.pages[0]
    content = page.get_contents().get_data().decode('latin1')
    sub = ed['subtitle']
    if f"({sub['from']})" not in content: sys.exit(f'{name}: the subtitle "{sub["from"]}" is not on page 1')
    content = content.replace(f"({sub['from']})", f"({esc(sub['to'])})", 1)
    put(page, content)
    for i, p in enumerate(writer.pages):
        if EDITS['url']['from'] in p.get_contents().get_data().decode('latin1'):
            sys.exit(f"{name} page {i + 1}: the old link is still written outside a paragraph this script rewrites; add it to scripts/guides-edits.json")
    writer.add_metadata({'/Title': ed['title']})
    with open(dst, 'wb') as f: writer.write(f)
    return dst

def jpeg(path, size):
    """The picture as the PDF's own image data: a JPEG at 90 (the shots are 3D shading and soft glass, which a PNG holds at three times the size)."""
    import io
    from PIL import Image
    im = Image.open(path).convert('RGB')
    if im.size != size and abs(im.size[0] / im.size[1] - size[0] / size[1]) > 0.01:
        sys.exit(f'{path}: a {im.size[0]}x{im.size[1]} shot does not fit the picture\'s place ({size[0]}x{size[1]} in the guide)')
    buf = io.BytesIO(); im.save(buf, 'JPEG', quality=90, subsampling=0, optimize=True)
    return buf.getvalue(), im.size

def refresh(name, shots):
    """Takes the committed 3D guide and (1) says the paragraphs again from scripts/guides-edits.json (found by their `find3d` words, so a changed sentence is a one-line edit of the table),
    (2) lays the shots in place of the pictures (`pictures`: the first six characters of the picture's name in the PDF -> the shot's file stem in --shots, e.g. mac-3-tests). The page layout, the other text
    and the file name stay."""
    from pypdf.generic import NameObject, NumberObject
    ed = EDITS['files'][name]
    dst = ROOT / 'public' / 'guides' / f'{name}.pdf'
    writer = PdfWriter(clone_from=PdfReader(str(dst)))
    for para in ed['paragraphs']:
        page = writer.pages[para['page']]
        put(page, rewrite(page.get_contents().get_data().decode('latin1'), para, f"{name} page {para['page'] + 1}", 'find3d'))
    if shots:
        for page in writer.pages:
            for key, ref in page['/Resources']['/XObject'].items():
                tag = key.split('.')[1][:6]
                if tag not in EDITS['pictures']: continue
                obj = ref.get_object()
                data, (w, h) = jpeg(pathlib.Path(shots) / f"{EDITS['pictures'][tag]}.png", (int(obj['/Width']), int(obj['/Height'])))
                obj._data = data
                obj[NameObject('/Filter')] = NameObject('/DCTDecode'); obj[NameObject('/Width')] = NumberObject(w); obj[NameObject('/Height')] = NumberObject(h)
                obj.pop('/DecodeParms', None)
    with open(dst, 'wb') as f: writer.write(f)
    print(f'wrote {dst} ({dst.stat().st_size // 1024} KB)')

def text_of(path):
    return [' '.join(p.get_text('text').split()) for p in pymupdf.open(path)]

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--from', dest='src'); ap.add_argument('--refresh', action='store_true', help='start from the committed 3D guides instead of the 2D ones'); ap.add_argument('--shots', help='with --refresh: the folder the capture script wrote (scripts/capture-guide-shots.mjs)'); ap.add_argument('--out', default=str(ROOT / 'public' / 'guides')); ap.add_argument('--check', action='store_true')
    a = ap.parse_args()
    if a.refresh:
        for name in EDITS['files']: refresh(name, a.shots)
        sys.exit(0)
    if not a.src: ap.error('--from <2D checkout> (or --refresh)')
    out = pathlib.Path(a.out); out.mkdir(parents=True, exist_ok=True)
    bad = []
    for name in EDITS['files']:
        src = pathlib.Path(a.src) / 'guides' / f'{name}.pdf'
        dst = out / f'{name}.pdf'
        if a.check:
            tmp = pathlib.Path('/tmp') / f'check-{name}.pdf'
            make(str(src), str(tmp), name)
            if not dst.exists() or text_of(tmp) != text_of(dst): bad.append(name)
        else:
            make(str(src), str(dst), name)
            print(f'wrote {dst} ({dst.stat().st_size // 1024} KB)')
    if bad:
        print('out of date: ' + ', '.join(bad) + '\nrun: python3 scripts/copy-guides.py --from <2D checkout>'); sys.exit(1)
    if a.check: print('guides are current')
