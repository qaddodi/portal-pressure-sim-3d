// Replay (plans 27, 27b): the label controller in node, Healthy, the portal vein picked, readings ticking, the orbit dragged like a hand.
// node --experimental-strip-types scripts/replay-labels.mjs
import { replay, HANDS } from '../tests/helpers-label-replay.ts';
for (const s of ['mac', 'iphone-portrait']) for (const [name, h] of Object.entries(HANDS)) {
  const r = replay(s, h.hand, h.ms);
  const top = [...r.bothFrames].sort((a, b) => b[1] - a[1]).slice(0, 4);
  console.log(`${s} | ${name}: spot moves ${r.crossings.filter((c) => !c.words).length} (${r.crossings.filter((c) => !c.words && c.moving).length} while turning), word changes ${r.crossings.filter((c) => c.words).length}, flip-backs ${r.flipBacks.length}, frames with both >0.3: ${JSON.stringify(top)}, HA moves ${r.crossings.filter((c) => c.id === 'HA' && !c.words).length}`);
}

console.log('--- spot moves while the picture turns, with why the standing spot was no longer legal:');
for (const s of ['mac', 'iphone-portrait']) for (const [name, h] of Object.entries(HANDS)) for (const c of replay(s, h.hand, h.ms).crossings) if (c.moving && !c.words) console.log(`${s} | ${name} | ${c.id} ${c.from} -> ${c.to} : ${c.why || 'STILL LEGAL'}`);
