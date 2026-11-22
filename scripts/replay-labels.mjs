// Replay (plan 27): the label controller in node, free play, the pressures ticking; counts every label's placement flips.
// node --experimental-strip-types scripts/replay-labels.mjs [stay]
import { replay } from '../tests/helpers-label-replay.ts';
for (const s of ['mac', 'iphone-portrait']) {
  const { flips, ghostFrames } = replay(s, 10);
  console.log(s, 'flips', JSON.stringify([...flips].sort((a, b) => b[1] - a[1]).slice(0, 8)), 'HA', flips.get('HA') ?? 0, 'ghostFrames', JSON.stringify([...ghostFrames].sort((a, b) => b[1] - a[1]).slice(0, 5)));
}
