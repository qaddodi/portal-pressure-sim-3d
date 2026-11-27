// Owner's hard rule (22 Nov 2026, docs/HUMANIZED-DESIGN.md section 0): NEVER a pill with a dot, a status chip or a badge. A state is plain words in its colour.
// The 2D stylesheets (src/ui/styles) bring pills of their own; src/ui/humanized.css takes the paint off the ones the app uses. This test finds every
// style rule that paints a pill (a fully rounded fill or outline) on a class named pill, chip, badge or dot, that the app really makes, and fails unless the class is one of
// the retired ones (humanized.css strips it) or a listed exception. A new pill, chip, badge or dot, or a base-sheet rule that brings one, fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (d: string, out: string[] = []): string[] => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p, out) : out.push(p); } return out; };
const files = walk('src');
const cssFiles = files.filter((f) => f.endsWith('.css'));
const srcText = files.filter((f) => /\.(tsx?|js)$/.test(f) && !f.includes('/styles/') && !f.includes('/debug/') && !f.startsWith('src/decks/')).map((f) => readFileSync(f, 'utf8')).join('\n');

/** Classes whose pill paint humanized.css strips. */
const RETIRED = ['tl-hc', 'tb-hc', 'fd-count', 'pzc-hint', 'pz-miss', 'pzt-r', 'cmp-seg', 'dop-tint', 'cmp-table-btn', 'cmp-banner', 'sh-waitcue', 'sh-glnote', 'pz-val', 'pz-gpill', 'hp-chip', 'cmp-badge', 'tr-chip', 'ir-chip', 'pt-chip', 'fr-pill', 'fr-pillnote', 'fr-mark', 'fr-rc', 'pz-site', 'pz-dz', 'pz-lens-t'];
/** Exceptions, each with its reason. None carries a dot beside words. */
const ALLOWED: Record<string, string> = {
  'zoom-pill': 'a rounded bar of icon buttons (no words, no dot)', 'float-pill': 'a rounded bar of controls', 'sh-pill': 'a plain button',
  'pzb-pill': 'the presenter bar of buttons', 'chip-btn': 'a top-bar button', 'preview-badge': 'the build marker the owner reads (BuildPill)',
  'order-chip': 'a ruled row with a tick box (Treat)', 'oc-dot': 'the tick box of that row', 'look-chip': 'the Appearance swatch (a theme preview)',
  'pz-prail-dot': 'the owner-picked one-row step rail (mock A)', 'ms-dot': 'a numbered step circle', 'lead-dot': 'the callout leader\'s anchor on the figure',
  'cl-lead-dot': 'a leader\'s dot, only where it names an area (an organ, the sinusoids); on a vessel the line ends on its edge', 'leader-dot': 'the leader\'s anchor on the figure', 'endo-chip': 'a data cell of the scope card',
  'sh-toast': 'excluded: the notes redesign waits on the owner\'s pick', 'toast': 'excluded: the notes redesign waits on the owner\'s pick',
};

const NAME = /(pill|chip|badge|dot)s?\b/;
type Hit = { cls: string; file: string; decl: string };
function pillRules(): Hit[] {
  const hits: Hit[] = [];
  for (const f of cssFiles) {
    if (f.endsWith('humanized.css')) continue;
    const css = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = m[1]!.trim(), body = m[2]!;
      if (!/border-radius:\s*(999px|50%|var\(--r-pill\))/.test(body)) continue;
      if (!/(^|;|\s)(background(-color)?:\s*(?!none|transparent|inherit|initial|unset)|box-shadow:\s*inset|border:\s*[1-9]|border:\s*var)/.test(body)) continue;
      for (const c of sel.matchAll(/\.([A-Za-z][\w-]*)/g)) if (NAME.test(c[1]!) || /(^|-)(pill|chip|badge|dot)(s|-|$)/.test(c[1]!)) hits.push({ cls: c[1]!, file: f, decl: sel.slice(0, 80) });
    }
  }
  return hits;
}
/** Whether the app makes an element of this class: it stands as a whole word in a quoted string (a class list) in the app's own code. */
// (the bare words `dot` and `pill` are in every comment and chart key: only a compound class name like `fr-pill` can be told apart; the 2D file's bare `.pill` and `.drug .dot` are markup the app never makes)
const made = (cls: string) => cls.includes('-') && new RegExp(`['"\`](?:[\\w-]+ )*${cls}(?: [\\w-]+)*['"\`]`).test(srcText);

test('no pill, chip, badge or dot the app makes is painted as one, except the retired (stripped) and the listed', () => {
  const bad = pillRules().filter((h) => made(h.cls) && !RETIRED.includes(h.cls) && !(h.cls in ALLOWED));
  assert.deepEqual(bad.map((h) => `${h.cls} (${h.file}: ${h.decl})`), [], 'a pill-painted class: show the state as plain words in its colour (docs/HUMANIZED-DESIGN.md section 0), then strip it in humanized.css');
});

test('humanized.css strips the paint of every retired class', () => {
  const css = readFileSync('src/ui/humanized.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const c of RETIRED) {
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => new RegExp(`\\.${c}\\b`).test(m[1]!));
    assert.ok(rules.length, `${c} has no rule in humanized.css`);
    assert.ok(rules.some((m) => /background:\s*none/.test(m[2]!) || /border-radius:\s*(0|var\(--r-sheet\))/.test(m[2]!)), `${c} is not stripped of its fill or rounding`);
  }
});

test('the retired pills do not come back in the app\'s own stylesheets', () => {
  for (const f of cssFiles.filter((x) => !x.includes('/styles/') && !x.endsWith('humanized.css'))) {
    const css = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(css, /\.hist-dot\b/, `${f}: the history dot is gone (the event's words carry its colour)`);
  }
});

test('the History row has no dot and the Legend key has no round swatch', () => {
  assert.doesNotMatch(readFileSync('src/ui/history/HistoryList.tsx', 'utf8'), /hist-dot/);
  assert.doesNotMatch(readFileSync('src/scene/lenses/legend.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''), /\.lg-dots i\s*\{[^}]*border-radius:\s*50%/);
});

// Charts draw their own shapes (src/ui/charts frames, the Tests panes' models): a rectangle rounded to half its height is a capsule, and a capsule round words is a pill.
test('no chart frame draws a capsule (a rectangle rounded to half its height) round words', () => {
  const frames = files.filter((f) => /(charts\/.*frame|tests\/.*(model|frame))\.ts$/.test(f));
  assert.ok(frames.length > 5);
  const bad: string[] = [];
  for (const f of frames) readFileSync(f, 'utf8').split('\n').forEach((l, i) => { if (/k: 'rect'/.test(l) && /\br: [^,}]*\/ 2/.test(l) && !/\/\/ ?\(capsule ok/.test(l)) bad.push(`${f}:${i + 1}`); });
  assert.deepEqual(bad, [], 'a capsule: draw the words alone in their colour (docs/HUMANIZED-DESIGN.md section 0)');
});

// Small round marks (a dot bullet, a hollow ring before words, a numbered circle, a row of pips): any rule that rounds a box of 26 px or less to a circle on a class the app makes.
// Each is either listed here as a control or a figure mark with its reason, or it is retired (humanized.css must name it). A new one fails.
const ROUND_ALLOWED: Record<string, string> = {
  '.cl-lead-dot': 'the callout leader\'s anchor on the figure', '.ac-switch': 'on/off switch knob', '.switch': 'on/off switch knob', '.switch-vis': 'on/off switch knob',
  '.sh-sw': 'on/off switch knob', '.mt-sw': 'on/off switch knob', '.sl-start': 'slider thumb', '.info-i': 'the info button\'s "i"', '.look-spin': 'a spinner',
  '.sh-waitcue': 'a spinner', '.bt-tick': 'the Over time "What to graph" tick circle, owner-picked (graph-rows mock A, 24 Nov; docs/approved/timeline-chart.md)', '.pz-prail-dot': 'the owner-picked step rail (mock A)', '.pz-prail-at': 'the step rail\'s play button (mock A)', '.sh-toast': 'excluded: the notes redesign',
};
const ROUND_RETIRED = ['.pzc-c', '.pz-nm', '.pzk-n', '.ms-dot', '.hvpg-steps', '.instr-tab', '.tr-pips', '.dk-obj'];
const px = (v: string): number | null => { const m = /^([\d.]+)(px|em)$/.exec(v.trim()); return m ? (m[2] === 'px' ? +m[1]! : +m[1]! * 14) : null; };

test('no small round mark (dot bullet, ring, numbered circle, pip) the app makes is drawn, except the listed controls and figure marks', () => {
  const bad: string[] = [];
  for (const f of cssFiles.filter((x) => !x.endsWith('humanized.css'))) {
    const css = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const body = m[2]!;
      if (!/border-radius:\s*(50%|999px|var\(--r-pill\))/.test(body)) continue;
      const w = /(?:^|[;\s])width:\s*([^;]+)/.exec(body), h = /(?:^|[;\s])height:\s*([^;]+)/.exec(body);
      const W = w ? px(w[1]!) : null, H = h ? px(h[1]!) : null;
      if (W == null || H == null || W > 26 || H > 26) continue;
      for (const sel of m[1]!.split(',')) {
        const cls = [...sel.replace(/::?[\w-]+(\([^)]*\))?/g, '').matchAll(/\.([A-Za-z][\w-]*)/g)].map((c) => c[1]!);
        const last = cls[cls.length - 1];
        if (!last || !made(last)) continue;
        if (cls.some((c) => `.${c}` in ROUND_ALLOWED) || ROUND_RETIRED.some((r) => cls.includes(r.slice(1)))) continue;
        bad.push(`${sel.trim().slice(0, 70)} (${f})`);
      }
    }
  }
  assert.deepEqual(bad, [], 'a round mark beside words: say the state in words (docs/HUMANIZED-DESIGN.md section 0), strip it in humanized.css and list it in ROUND_RETIRED, or list it in ROUND_ALLOWED with its reason');
});

test('humanized.css strips every retired round mark', () => {
  const css = readFileSync('src/ui/humanized.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const r of ROUND_RETIRED.filter((x) => x !== '.dk-obj')) assert.ok(css.includes(r), `${r} is not stripped in humanized.css`);
  assert.doesNotMatch(readFileSync('src/ui/deck-ui.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''), /\.dk-obj li::before/, 'the title card has no dot bullets');
  assert.doesNotMatch(readFileSync('src/ui/trials/TrialsPane.tsx', 'utf8'), /<i key=\{i\} className=\{c\} \/>/, 'the trial rows have no pips');
});

// G2 (Plan 39, Audit 5): the name filter above only sees classes called pill, chip, badge or dot, so a pill named `.tl-hc` or `.cmp-seg` passed. This one has no name filter:
// any class the app makes whose rule rounds it to a pill (999px, 50 %, --r-pill) and paints a fill or a ring must be stripped in humanized.css (RETIRED) or listed with its reason.
const ALLOWED_ANY: Record<string, string> = {
  'pz-step': 'the numbered step disc on a slide (owner-approved)', 'pz-prail-dot': 'the owner-picked step rail (mock A)', 'pz-prail-go': 'the step rail\'s play button (mock A)', 'pz-prail-at': 'the step rail\'s ring (mock A)',
  'ms-dot': 'owner-approved numbered step', 'lead-dot': 'the callout leader\'s anchor on the figure', 'look-chip': 'the Appearance swatch (a theme preview)', 'sh-toast': 'a note (f99c7155)', 'toast': 'a note (f99c7155)',
  'bt-tick': 'the Over time "What to graph" tick circle, owner-picked (graph-rows mock A, 24 Nov; docs/approved/timeline-chart.md)', 'zoom-pill': 'a rounded bar of icon buttons', 'float-pill': 'a rounded bar of controls', 'pzb-pill': 'the presenter bar of buttons', 'chip-btn': 'a top-bar button',
};
Object.assign(ALLOWED_ANY, {
  'lb-anchor': 'a leader\'s anchor mark on the figure', 'sv-mark': 'the Protein callout\'s circle beside its word on the figure: the key\'s swatch, in the particle\'s colour (owner-approved 26 Nov, "circle beside the word"), not a status pill', 'lz-co-ring': 'a ring drawn on the figure', 'lb-bar': 'the lens key\'s colour bar (no words in it)', 'pzc-rule': 'a thin rule line, no words',
  'info-i': 'the info button\'s "i"', 'sl-start': 'slider thumb', 'switch-vis': 'on/off switch knob', 'sh-sw': 'on/off switch knob', 'mt-sw': 'on/off switch knob', 'look-spin': 'a spinner',
  'ab-belly': 'figure art (the belly drawing)', 'pz-lens-disc': 'the scope lens on the figure', 'pz-lens-x': 'the scope lens\' close button (an icon)', 'pz-lens-hit': 'the scope lens\' hit area',
  'sh-btn': 'a dialog button: owner call pending, not in Plan 39', 'pz-nm': 'retired in humanized.css (ROUND_RETIRED)', 'ms-fill': 'retired in humanized.css (display: none)',
  'instr-tab': 'retired in humanized.css (ROUND_RETIRED)', 'pzc-c': 'retired in humanized.css (ROUND_RETIRED)',
});
const LISTED_DEBUG: Record<string, string> = { 'perf-mount': 'debug only', 'charts-gallery': 'debug only', 'handout': 'debug only' };
test('G2: no class the app makes (any name) is a pill with a fill or a ring, except the retired, the owner-approved and the debug-only', () => {
  const seen = new Map<string, string>();
  for (const f of cssFiles) {
    if (f.endsWith('humanized.css')) continue;
    const css = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}@;][^{}]*)\{([^{}]*)\}/g)) {
      const sel = m[1]!.trim(), body = m[2]!;
      if (!/border-radius:\s*(999px|50%|var\(--r-pill\))/.test(body)) continue;
      if (!/(^|;|\s)(background(-color)?:\s*(?!none|transparent|inherit|initial|unset)|box-shadow:\s*(inset|0 0 0)|border:\s*[1-9]|border:\s*var)/.test(body)) continue;
      for (const one of sel.split(/,(?![^()]*\))/)) {
        const subject = one.trim().replace(/::?[\w-]+(\([^()]*\))?$/, '').split(/[\s>+~]+/).pop() ?? '';
        for (const c of subject.matchAll(/\.([A-Za-z][\w-]*)/g)) seen.set(c[1]!, `${f}: ${one.trim().slice(0, 80)}`);
      }
    }
  }
  const bad = [...seen].filter(([c]) => made(c) && !RETIRED.includes(c) && !(c in ALLOWED) && !(c in ALLOWED_ANY) && !(c in LISTED_DEBUG)).map(([c, w]) => `${c} (${w})`);
  assert.deepEqual(bad, [], 'a pill with a fill or a ring: strip it in humanized.css (words in their colour) or list it with its reason');
});

// Owner's ruling L9 (27 Nov 2026, review 3531bdfa E-D9): the scope ring on the varix is a ring and nothing else, no icon badge (a round white disc with a scope's end face, which read as a capsule on the varix before
// banding, 06.5 and 33.2). It is drawn by the GPU, so the DOM scan above never saw it; this reads its shader and its screen box.
test('the scope ring carries no badge: its shader draws the dashed ring alone, and its tap and keep-off room are the ring\'s', async () => {
  const src = readFileSync('src/scene/disease/scope-ring.ts', 'utf8');
  const fs = src.slice(src.indexOf('export const RING_FS'), src.indexOf('export class ScopeRing'));
  assert.doesNotMatch(fs, /badge|uBadge|uSurface|bFill|bEdge|face/i, 'no disc and no scope face in the fragment shader');
  assert.match(fs, /dashD/, 'the dashed ring is drawn');
  const { ScopeRing } = await import('../src/scene/disease/scope-ring.ts');
  const { Vector3, Group } = await import('three');
  const r = new ScopeRing(), body = new Group();
  body.add(r.group); body.updateMatrixWorld(true);
  const out = { x: 0, y: 0, r: 0, bx: 0, by: 0, br: 0, bleed: { l: 0, t: 0, r: 0, b: 0 } };
  const res = r.screen((p: InstanceType<typeof Vector3>, o: { x: number; y: number }) => { o.x = 500 + p.x * 400; o.y = 400 - p.y * 400; return o; }, (p) => body.localToWorld(p.clone()), new Vector3(1, 0, 0), out)!;
  assert.equal(res.br, 0, 'no badge radius');
  r.dispose();
});
