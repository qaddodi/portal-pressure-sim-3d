// One panel head (menu unification, stage 1: reports/menu-unification.md 3.2 "Head", section 5 tests/panel-head.test.ts). Root cause pinned: every panel drew its own head,
// in three fonts and paddings with two kinds of X, and a 2D phone rule (#app.thumb .card-close { display: none }) hid Treat's and Tests' X while History kept its own.
// Now Treat, Tests, History, Compare and Why render <PanelHead>, whose X is the one CloseX; no stylesheet hides an X on any device; and where a tab strip stands (in the
// head row or under it) and how far its names step down is the one measured rule, tab-fit.ts tabRow. Node only: the head is rendered to markup (bundled by vite, CSS dropped).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tabRow, fitTabs, iconLeast, textNeed, FIT_WHOLE } from '../src/ui/surface/tab-fit.ts';
import { isPanel } from '../src/ui/surface/kinds.ts';

const read = (p: string) => readFileSync(p, 'utf8');
const walk = (dir: string, out: string[] = []): string[] => {
  for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p, out); else out.push(p.replace(/\\/g, '/')); }
  return out;
};

test('Treat, Tests, History, Compare and Why render the one panel head', () => {
  assert.match(read('src/ui/treat/TreatCard.tsx'), /<PanelHead\b/, 'Treat');
  assert.match(read('src/ui/tests/TestsLayer.tsx'), /<PanelHead\b/, 'Tests');
  // (History, Compare and Why are Frames until stage 2: the Frame draws a panel kind's head as the panel head)
  const frame = read('src/ui/shell/Frame.tsx');
  assert.match(frame, /isPanel\(kind\)\s*\?\s*<PanelHead\b/, 'a Frame of a panel kind draws the panel head');
  for (const [file, kind] of [['src/ui/history/HistorySheet.tsx', 'history'], ['src/ui/compare/CompareUi.tsx', 'compare'], ['src/ui/why/WhySheet.tsx', 'why']] as const) {
    const src = read(file);
    assert.match(src, new RegExp(`<Frame kind="${kind}"`), `${kind} is a Frame`);
    assert.doesNotMatch(src.match(new RegExp(`<Frame kind="${kind}"[^>]*>`))![0], /head=\{null\}/, `${kind} keeps its head`);
    assert.equal(isPanel(kind), true, `${kind} is a panel`);
  }
});

test('no panel builds its own close button: the head\'s X is the one CloseX', () => {
  const head = read('src/ui/surface/PanelHead.tsx');
  assert.match(head, /<CloseX className=\{`card-close/, 'the head\'s X is CloseX, wearing the class the 2D card head places it by');
  assert.doesNotMatch(head, /hidden=|display/, 'the head never hides its X');
  for (const f of ['src/ui/treat/TreatCard.tsx', 'src/ui/tests/TestsLayer.tsx', 'src/ui/shell/Frame.tsx']) {
    const src = read(f);
    assert.doesNotMatch(src, /className="[^"]*\bcard-close\b/, `${f} draws no X of its own`);
  }
  assert.doesNotMatch(read('src/ui/shell/Frame.tsx').match(/isPanel\(kind\)[\s\S]*?: <div/)![0], /sh-x/, 'a panel Frame has no .sh-x');
});

/** Every rule in the stylesheets we serve (comments blanked), with the @media / @container text it sits in. */
function rules(css: string): { at: string; sel: string; body: string }[] {
  const s = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const out: { at: string; sel: string; body: string }[] = [];
  const stack: string[] = [];
  let i = 0, start = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '{') {
      const head = s.slice(start, i).trim();
      if (head.startsWith('@')) { stack.push(head); start = i + 1; i++; continue; }
      const end = s.indexOf('}', i);
      out.push({ at: stack.join(' '), sel: head, body: s.slice(i + 1, end) });
      i = end + 1; start = i; continue;
    }
    if (c === '}') { stack.pop(); start = i + 1; }
    i++;
  }
  return out;
}

test('no stylesheet hides a panel\'s X on any device class (thumb, phone, sheet or any media query)', () => {
  const css = walk('src').filter((f) => f.endsWith('.css'));
  assert.ok(css.length > 30 && css.includes('src/ui/styles/app-10-thumb-dock.css'), 'the walk found the stylesheets, the lifted 2D ones too');
  const X = /\.(card-close|sf-x|sh-x)(?![\w-])/;
  const hides = /(^|;)\s*(display\s*:\s*none|visibility\s*:\s*hidden)/;
  const bad: string[] = [];
  for (const f of css) {
    for (const r of rules(read(f))) {
      // (the X is the selector's subject: the last compound of some selector in the list names it)
      const subjects = r.sel.split(/,(?![^(]*\))/).map((p) => p.trim().split(/\s+|>|~|\+/).filter(Boolean).pop() ?? '');
      if (subjects.some((x) => X.test(x)) && hides.test(r.body)) bad.push(`${f}: ${r.at} ${r.sel}`);
    }
  }
  assert.deepEqual(bad, [], 'an X is hidden');
  assert.doesNotMatch(read('src/ui/styles/app-10-thumb-dock.css'), /#app\.thumb \.card-close \{ display: none/, 'the 2D phone rule that hid it is gone');
});

test('a phone sheet\'s X is a 44 px target and the title does not move for it', () => {
  const cards = read('src/ui/styles/app-08-cards.css'), thumb = read('src/ui/styles/app-10-thumb-dock.css');
  // (a centred head: the X stands in the head's own 44 px side padding, out of the row, so the title stays centred)
  assert.match(cards, /\.card-head\.card-head \{ position: relative; min-height: 44px; padding: 0 44px !important; justify-content: center; \}/);
  assert.match(cards, /\.card-head \.card-close\.card-close \{ position: absolute; right: 0; top: 50%; width: 44px; height: 44px;/);
  // (a tabbed head and every other small control on a phone: an invisible 44 px box centred on the X, so nothing in the row moves)
  assert.match(thumb, /html\.thumb-ui :is\([^)]*\.card-close[^)]*\)::after \{ content: ''; position: absolute; inset: auto; left: 50%; top: 50%; width: max\(100%, 44px\); height: max\(100%, 44px\)/);
});

test('the tab row fit rule: in the head row when the tabs fit beside the title and the X, else a row of their own', () => {
  // Tests: icon tabs, the title steps aside (lead 0). A 600 px card keeps them in the row; the names step down by fitTabs on the room the row leaves.
  const wide = tabRow({ head: 576, close: 40, lead: 0, variant: 'icon', n: 8, open: 'Pressure' });
  assert.equal(wide.inHead, true);
  assert.deepEqual(wide.fit, fitTabs(536, 8, 'Pressure'));
  // a phone's sheet: tight (only the open tab named), the X beside them now that it shows on a phone
  const phone = tabRow({ head: 358, close: 40, lead: 0, variant: 'icon', n: 8, open: 'Pressure' });
  assert.deepEqual(phone, { inHead: true, fit: { compact: true, narrow: true, tight: true, bare: false } });
  assert.equal(tabRow({ head: 300, close: 40, lead: 0, variant: 'icon', n: 8, open: 'Endoscopy' }).fit.bare, true, 'never a cut name: the open tab is an icon too');
  // icon tabs leave the row only when not even an icon each fits beside the title
  assert.equal(tabRow({ head: iconLeast(8) + 40 + 100, close: 40, lead: 100, variant: 'icon', n: 8, open: 'IR' }).inHead, true);
  const under = tabRow({ head: iconLeast(8) + 40 + 99, close: 40, lead: 100, variant: 'icon', n: 8, open: 'IR' });
  assert.equal(under.inHead, false);
  assert.deepEqual(under.fit, fitTabs(iconLeast(8) + 139, 8, 'IR'), 'under the head the strip steps on the whole row');
  // Treat: three text tabs never shrink; beside "Treat · 2 running" and the X in a 400 px card they do not fit, so they take the row under the head
  const need = textNeed([38, 42, 72 + 17]);
  assert.equal(need, 3 * (89 + 16) + 2 * 2 + 6);
  assert.deepEqual(tabRow({ head: 376, close: 44, lead: 130, variant: 'text', n: 3, open: 'Drugs', need }), { inHead: false, fit: FIT_WHOLE });
  // ... and a card wide enough for every name whole beside the title keeps them in the row, whole
  assert.deepEqual(tabRow({ head: 130 + 44 + need, close: 44, lead: 130, variant: 'text', n: 3, open: 'Drugs', need }), { inHead: true, fit: FIT_WHOLE });
  assert.equal(tabRow({ head: 130 + 44 + need - 1, close: 44, lead: 130, variant: 'text', n: 3, open: 'Drugs', need }).inHead, false);
  assert.equal(tabRow({ head: 2000, close: 44, lead: 0, variant: 'text', n: 3, open: 'Drugs' }).inHead, false, 'a text strip not measured yet stays under the head');
});

test('the 2D step thresholds are kept (fitTabs moved to surface/, unchanged)', () => {
  assert.deepEqual(fitTabs(800, 8, 'Pressure'), FIT_WHOLE);
  assert.equal(fitTabs(779, 8, 'Pressure').compact, true);
  assert.equal(fitTabs(519, 8, 'Pressure').narrow, true);
  assert.equal(fitTabs(419, 8, 'Pressure').tight, true);
  assert.equal(read('src/ui/tests/TestsLayer.tsx').includes('fitTabs('), false, 'Tests no longer fits its own row: the head asks the one rule');
});

test('Treat and Tests wear one tab look on every screen (text or icon is the only difference)', () => {
  const cards = read('src/ui/styles/app-08-cards.css');
  assert.match(cards, /:is\(\.treat-tabs, \.ws-tabs\) \{ margin: 2px 12px 10px; gap: 2px; padding: 3px; border-radius: 10px; background: var\(--surface-2\); \}/, 'the Mac row too: one raised two-part look');
  assert.match(cards, /:is\(\.treat-tabs, \.ws-tabs\) \.instr-tab\[aria-selected="true"\] \{ background: var\(--surface\)/);
  assert.match(cards, /\.instr-tabs:is\(\.treat-tabs, \.ws-tabs\)\.seg-glide::before \{ display: block; \}/, 'the one gliding chosen piece is drawn on both');
});

// ── the head rendered to markup ──
mkdirSync('node_modules/.cache', { recursive: true });
const entry = resolve('node_modules/.cache/panel-head-entry.tsx');
writeFileSync(entry, `export { PanelHead } from '${resolve('src/ui/surface/PanelHead.tsx')}';\nexport { createElement } from 'react';\nexport { renderToStaticMarkup } from 'react-dom/server';\n`);

test('the head\'s markup: the 2D classes, the X, and the strip in the row or under it', async () => {
  const { build } = await import('vite');
  const res = await build({
    configFile: false, logLevel: 'silent', root: process.cwd(), plugins: [],
    build: { ssr: entry, write: false, minify: false, emptyOutDir: false, rollupOptions: { output: { format: 'esm' } } },
  });
  const first = (Array.isArray(res) ? res[0]! : res) as { output: { code?: string }[] };
  const out = resolve('node_modules/.cache/panel-head-test.mjs');
  writeFileSync(out, first.output.find((o) => typeof o.code === 'string')!.code!);
  type M = { PanelHead: unknown; createElement(c: unknown, p: unknown): unknown; renderToStaticMarkup(e: unknown): string };
  const m = await import(pathToFileURL(out).href) as M;
  const html = (p: Record<string, unknown>) => m.renderToStaticMarkup(m.createElement(m.PanelHead, { onClose: () => undefined, ...p }));

  const plain = html({ title: 'History', closeLabel: 'Close History' });
  assert.match(plain, /^<div class="card-head"><h2 class="card-title"><span>History<\/span><\/h2><button type="button" class="ib sf-x card-close" aria-label="Close History"/);
  assert.doesNotMatch(plain, / hidden[ =>]|tabbed|instr-tabs/);

  const items = [{ id: 'drugs', label: 'Drugs', count: 2 }, { id: 'fluids', label: 'Fluids' }, { id: 'procs', label: 'Procedures', count: 0 }];
  const treat = html({ title: 'Treat', className: 'tc-head', meta: { text: '2 running' }, closeLabel: 'Close Treat',
    tabs: { variant: 'text', className: 'treat-tabs', label: 'Treatments', items, value: 'drugs', onPick: () => undefined } });
  // (a text strip starts under the head, as Treat's stood, until the head is measured)
  assert.match(treat, /^<div class="card-head tc-head" data-tabs="below"><h2 class="card-title"><span>Treat<\/span><\/h2><span class="card-meta">2 running<\/span><button[^>]*class="ib sf-x card-close"[^>]*><i[^>]*><\/i><\/button><\/div><div class="instr-tabs treat-tabs" role="tablist" aria-label="Treatments" data-variant="text">/);
  assert.match(treat, /<button type="button" class="instr-tab" role="tab" data-tab="drugs" aria-selected="true" tabindex="0"><span class="tt-l">Drugs<span class="tt-n on" aria-hidden="true">2<\/span><\/span><\/button>/);
  assert.match(treat, /data-tab="fluids" aria-selected="false" tabindex="-1"><span class="tt-l">Fluids<\/span>/, 'a tab with no count has no count slot');

  const tests = html({ title: 'Tests', className: 'dock-head', titleClass: 'dock-title', sub: '', yieldTitle: true, closeLabel: 'Close Tests', closeClass: 'workspace-close',
    meta: { text: 'Paused', className: 'workspace-live', state: 'paused', live: 'off' },
    tabs: { variant: 'icon', className: 'ws-tabs', label: 'Tests', value: 'hvpg', onPick: () => undefined,
      items: [{ id: 'hvpg', label: 'IR', icon: 'catheter', selected: true, slot: '1' }, { id: 'doppler', label: 'Doppler', short: 'Dopp', icon: 'doppler', selected: true, slot: '2' }] } });
  // (an icon strip starts in the head row, as Tests' stood: the head is .tabbed and the title steps aside for it)
  assert.match(tests, /^<div class="card-head dock-head tabbed" data-yield="true" data-tabs="head"><h2 class="card-title dock-title"><span>Tests<\/span><span class="dt-l"><\/span><\/h2><span class="card-meta workspace-live" data-state="paused" aria-live="off">Paused<\/span><div class="instr-tabs ws-tabs"/);
  assert.match(tests, /data-tab="doppler" data-slot="2" aria-selected="true" tabindex="-1"[^>]*><i class="ic ic-doppler" aria-hidden="true"><\/i><span class="it-t"><b><span class="it-full">Doppler<\/span><span class="it-short">Dopp<\/span><\/b><\/span>/, 'the slot markers and the two names');
  assert.match(tests, /<\/div><button type="button" class="ib sf-x card-close workspace-close" aria-label="Close Tests"[^>]*>.*<\/button><\/div>$/, 'the X ends the row');
});
