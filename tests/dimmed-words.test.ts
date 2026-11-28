// Words that wait or came earlier are dimmed by colour, not by opacity (22 Nov, the Mac audit: the HVPG reading steps at 55% opacity read 3.24:1). The text tokens must read on their surfaces in every look,
// and no stylesheet of ours dims a run of words with opacity again (the 2D copies keep their own rules; deck-ui.css overrides the two the audit named).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contrast } from '../src/ui/debug/contrast.ts';

const css = (f: string) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');

test('--text-3 and --text-2 read at 4.5:1 or more on every surface of every look (the colour that stands in for a dimmed word)', () => {
  const blocks = [...css('styles/tokens.css').matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  let looks = 0;
  for (const [, , body] of blocks) {
    const t3 = /--text-3\s*:\s*(#[0-9A-Fa-f]{6})/.exec(body!)?.[1], t2 = /--text-2\s*:\s*(#[0-9A-Fa-f]{6})/.exec(body!)?.[1];
    const surfaces = [...body!.matchAll(/--(?:bg|surface|surface-2)\s*:\s*(#[0-9A-Fa-f]{6})/g)].map((m) => m[1]!);
    if (!t3 || !surfaces.length) continue;
    looks++;
    for (const s of surfaces) {
      assert.ok(contrast(t3, s) >= 4.5, `--text-3 ${t3} on ${s}: ${contrast(t3, s)}`);
      if (t2) assert.ok(contrast(t2, s) >= 4.5, `--text-2 ${t2} on ${s}: ${contrast(t2, s)}`);
    }
  }
  assert.ok(looks >= 6, `read ${looks} looks`);
});

test('the reading steps and the ghost reading are dimmed by colour: no opacity on them in deck-ui.css', () => {
  const css3 = css('deck-ui.css');
  assert.match(css3, /:root \.mon-steps li \{ opacity: 1; color: var\(--text-3\);/);
  assert.match(css3, /:root \.pz-ghost b \{ opacity: 1; color: var\(--text-2\); \}/);
});

test('a procedure rail that cannot play now is dimmed by colour too: its words keep full opacity, only the button and the track are thinned (27 Nov: the count read 2.27:1 and the step name 3.33:1 at 50% opacity)', () => {
  const css3 = css('deck-ui.css');
  assert.match(css3, /:root \.pz-prail-box\[data-why\] \{ opacity: 1; \}/);
  assert.match(css3, /:root \.pz-prail-box\[data-why\] :is\(\.pz-prail-go, \.pz-prail-track\) \{ opacity: \.5; \}/);
  assert.match(css3, /:root \.pz-prail-box\[data-why\] \.pz-prail-t b \{ color: var\(--text-3\); \}/);
  assert.match(css3, /:root \.pz-prail-box\[data-why\] \.pz-prail-cap \{ color: var\(--text-3\); \}/);
});
