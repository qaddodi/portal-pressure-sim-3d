// The Doppler card on a slide has no title (28 Nov 2026, Mohammad: "doesn't need a title tbh, just maximize the monitor area"). The heading leaves the flow (`dt-off`, a card with no readings is `.off` whole),
// the monitor takes the height the header row gave up (`--dh-freed`, written by TilesHead before the first paint), and no other instrument's card is touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/ui/css3d-over-2d.css', import.meta.url), 'utf8');
const tsx = readFileSync(new URL('../src/ui/cards/TilesCard.tsx', import.meta.url), 'utf8');

test('only a Doppler card drops its title; the readings row stays; its title is kept for a screen reader', () => {
  assert.match(tsx, /kind === 'doppler'/);
  assert.match(tsx, /'pz-dh dt-off' : 'pz-dh off dt-off'/, 'readings keep the row, no readings drop it whole');
  assert.match(tsx, /<span>\{titleUnits\(title\)/, 'the heading stays in the page');
  assert.match(css, /\.pz-dh\.dt-off\.dt-off > span:first-child \{ position: absolute; visibility: hidden/);
});

test('the monitor takes the freed height in every layout: laptop, tablet and phone upright, and a phone on its side', () => {
  const rules = css.split('\n').filter((l) => /\[data-kind="doppler"\] \.dop-box/.test(l) && /--dh-freed/.test(l));
  assert.equal(rules.length, 2);
  assert.ok(rules.some((l) => /:not\(\.low\)/.test(l) && /--pz-chart-px\) \* var\(--pz-fit, 1\) \+ var\(--dh-freed, 0px\)/.test(l)), 'the table height, still fitted, plus the row');
  assert.ok(rules.some((l) => /\.pz\.low\.low\.low/.test(l) && /120px \+ var\(--dh-freed/.test(l)), 'a phone on its side: its 120 px plus the row');
  // the shared rule of the other instruments' boxes no longer lists the Doppler (they keep their own height)
  const shared = css.split('\n').filter((l) => /fibroscan-box/.test(l) && /deck-ui/.test(l));
  assert.ok(shared.length && shared.every((l) => !/doppler/.test(l)));
});

test('the card keeps its size: the row is measured with and without its title and the monitor is given the difference, once before paint', () => {
  assert.match(tsx, /useLayoutEffect\(\(\) => \{\s*const el = row\.current/);
  assert.match(tsx, /Math\.max\(0, Math\.round\(withT - without\)\)/);
  assert.match(tsx, /removeProperty\('--dh-freed'\)/);
});
