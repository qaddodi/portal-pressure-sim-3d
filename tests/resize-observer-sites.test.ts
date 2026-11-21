// "ResizeObserver loop completed with undelivered notifications" (audit v2 B12, 15 times): an observer callback that writes the size of what it observes. The fix is one helper, layout/fit-later.ts
// observeThenFit (the pass runs from a timer, after the delivery). This keeps the rule: every `new ResizeObserver(` in src is the helper's own, or a reviewed site below that only reads, or writes
// something it does not observe. A new site fails here until it uses the helper or is reviewed and listed with its reason.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const REVIEWED: Record<string, string> = {
  'src/ui/layout/fit-later.ts': 'the helper itself: the pass is run from a timer',
  'src/ui/treat/TreatCard.tsx': 'observes the panes\' children and the card; writes the pane\'s height and the figure\'s room, neither observed',
  'src/ui/treat/seg-glide.copied.ts': '2D\'s tab glide: notes controls only; the measuring runs in a rest pass',
  'src/ui/search/SearchSheet.tsx': 'queues a rest pass',
  'src/ui/shell/Credit.tsx': 'observes the obstacles; moves the credit (translate), which is not observed',
  'src/ui/shell/Toast.tsx': 'reads the note\'s box into state',
  'src/ui/shell/use-bar-fit.ts': 'fits from a timer (`soon`)',
  'src/ui/cards/SlideControls.tsx': 'fits only when the host\'s width changed, and the fit writes inside it',
  'src/ui/action/ActionCard.tsx': 'reads the card\'s height into the room store',
  'src/scene/labels/LabelLayer.tsx': 'reads the key\'s size into the controller',
};

function walk(d: string, out: string[] = []): string[] {
  for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p, out); else if (/\.(ts|tsx)$/.test(n)) out.push(p); }
  return out;
}

test('every ResizeObserver in src is the helper or a reviewed read-only site', () => {
  const sites = walk('src').filter((f) => /new ResizeObserver\(/.test(readFileSync(f, 'utf8')));
  for (const f of sites) assert.ok(REVIEWED[f], `${f} makes a ResizeObserver: use observeThenFit (layout/fit-later.ts), or review it and list it here`);
  for (const f of Object.keys(REVIEWED)) assert.ok(sites.includes(f), `${f} no longer has an observer: drop it from the list`);
});

test('the fit passes that write onto what they observe go through the helper', () => {
  for (const f of ['src/ui/cards/CardFrame.tsx', 'src/ui/cards/TableCard.tsx', 'src/ui/cards/TilesCard.tsx', 'src/ui/charts/ladder/LaddersCard.tsx', 'src/ui/charts/Chart.tsx']) assert.match(readFileSync(f, 'utf8'), /observeThenFit\(/, f);
});
