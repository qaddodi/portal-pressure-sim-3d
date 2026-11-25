// Mac review, 21 Nov 2026: the floating "© 2026 ..." sat on figure labels and table rows (Collaterals 4 and 10, Ascites 9, 20 and 22). Root cause (the same as the iPhone's): a talk's credit hunted for bare figure
// among rectangles still moving. On a wide or short screen it now has one fixed place in the foot band under the cards' left edge, so nothing it can land on moves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { footCredit } from '../src/ui/shell/credit-foot.ts';
import { layoutOf, margin } from '../src/ui/layout/rules2d.ts';

const SCREENS: Record<string, [number, number, number]> = { 'mac 1440x900': [1440, 900, 0], 'mac 1728x1117': [1728, 1117, 0], 'desktop 1920x1080': [1920, 1080, 0], 'laptop 1280x720': [1280, 720, 0], 'ipad landscape': [1180, 820, 20] };

test('on every wide or short screen the talk credit stands in the foot band, under the cards, on the left edge of the words card', () => {
  for (const [name, [vw, vh, bottom]] of Object.entries(SCREENS)) {
    const lay = layoutOf(vw, vh), m = margin(vw, vh, lay);
    assert.ok(lay === 'wide' || lay === 'short', name);
    const at = footCredit({ vw, vh, safe: { top: 0, right: 0, bottom, left: 0 }, h: 16.8, margin: m });
    assert.equal(at.x, Math.round(m), `${name}: the cards' left edge`);
    assert.ok(at.y + 16.8 <= vh - bottom, `${name}: on the screen`);
    // the cards keep `m` (16 px or more) off the foot: the line begins at most 4 px above that, inside the card's own foot padding (18 px or more), never in its words
    assert.ok(at.y >= vh - m - 4 - 16.8 || m < 20, `${name}: ${at.y}`);
    assert.ok(vh - at.y - 16.8 <= 3 + bottom, `${name}: hugs the foot`);
  }
});

test('Credit.tsx uses it for a talk on a wide or short screen and keeps its hunt for free play', () => {
  const src = readFileSync('src/ui/shell/Credit.tsx', 'utf8');
  assert.match(src, /talk && \(lay === 'wide' \|\| lay === 'short'\)\) \{/);
  assert.match(src, /footCredit\(/);
  assert.match(src, /freeSpots/);
});
