// Departures from 2D's interpret() so the Doppler's verdict never disagrees with its own flag (B13, capture 0bc14020, 26 Nov 2026), written once and applied by
// scripts/copy-b11-doppler.mjs to a fresh copy, and by tests/doppler-verdict.test.ts to the kept one (so a fresh copy keeps them).
// The root: the gauge's amber flag judged the speed SHOWN against the usual range, while the verdict judged the raw 3 s mean, and the portal vein's words never asked
// judgeFlow for `fast` at all, so 47 cm/s in amber above "Usual 15 to 40" read "Normal: hepatopetal with mild phasicity". The pattern class read the one beat nearest the
// window's mean, so a vein near the cut read Phasic on one screen and Monophasic on another. Now: one judgment (`judged`, run on every verdict, handed to the gauge as `out`),
// and the class reads the median pulsatility of every whole beat in the window.
const once = (body, from, to, what) => {
  const n = body.split(from).length - 1;
  if (n !== 1) throw new Error(`doppler.js: ${what} is not where the verdict departure expects it (${n} matches)`);
  return body.replace(from, () => to);
};

export function patchVerdict(body) {
  let b = body;
  // the phasicity class: the median of the window's whole beats, never the one beat the tiles stand on
  b = once(b, `  function medianBeat(from, to, level) {`,
`  // (A portal vein's phasicity class is the median pulsatility of the whole beats of the last breath's worth of the record (6.5 s, never before the settled change), not of the one beat the
  // tiles' Max and Trough stand on, nor of the two or three a 3 s window holds: a vein near the cut read Phasic on one screen and Monophasic on another, B13. The calipers still stand
  // on a real beat, BEAT_PICK.b0 and b1.)
  const CLASS_SPAN = 6.5, BEAT_SORT = new Float64Array(BEAT_MAX);
  const windowPi = (to, nb0, pis) => {
    const n = Math.min(beatN, BEAT_MAX), lo0 = Math.max(to - CLASS_SPAN, heldTo ?? -Infinity) + 0.05, hi1 = to - 0.05;
    let m = 0;
    for (let j = 1; j < n; j++) {
      const b0 = beatT[(beatN - n + j - 1) % BEAT_MAX], b1 = beatT[(beatN - n + j) % BEAT_MAX];
      if (b0 < lo0 || b1 > hi1 || !(b1 > b0)) continue;
      let hi = -Infinity, lo = Infinity;
      for (let i = buf.length - 1; i >= 0 && buf[i][0] >= b0; i--) { if (buf[i][0] > b1) continue; const v = buf[i][1]; if (v > hi) hi = v; if (v < lo) lo = v; }
      if (!(hi > -Infinity)) continue;
      const v = pulsatility(hi, lo); let k = m++;
      while (k > 0 && BEAT_SORT[k - 1] > v) { BEAT_SORT[k] = BEAT_SORT[k - 1]; k--; }
      BEAT_SORT[k] = v;
    }
    return m ? (m & 1 ? BEAT_SORT[m >> 1] : (BEAT_SORT[(m >> 1) - 1] + BEAT_SORT[m >> 1]) / 2) : pis[nb0];
  };
  function medianBeat(from, to, level) {`, 'medianBeat');
  b = once(b, `BEAT_PICK.pi = BEAT_PIS[pick];`, `BEAT_PICK.pi = windowPi(to, pick, BEAT_PIS);`, 'the picked beat\'s pulsatility');
  // the verdict's speed is the one shown (the gauge's), not the raw 3 s mean
  b = once(b, `    const j = judgeFlow(r.mean, null, normal, OPT_SWINGS), js = p.kind === 'tips' ? judgeFlow(r.mean, null, normal, OPT_STENT) : j;`,
`    // (The speed judged is the one shown beside the words, the gauge's: with none shown yet, the 3 s mean.)
    const mj = seen && Number.isFinite(seen.gated) ? seen.gated : r.mean;
    const j = judgeFlow(mj, null, normal, OPT_SWINGS), js = p.kind === 'tips' ? judgeFlow(mj, null, normal, OPT_STENT) : j;`, 'the verdict\'s judgeFlow');
  // the portal vein: a fast vein is flagged, and says so
  b = once(b, `else { dir = 'Hepatopetal'; sev = j.slow ? 'caution' : 'ok'; }`, `else { dir = 'Hepatopetal'; sev = j.slow || j.fast ? 'caution' : 'ok'; }`, 'the hepatopetal tone');
  b = once(b, `        : j.slow ? (stent ? NOTE_SLOW[stent] : 'Hepatopetal but slow: typical of portal hypertension.')`,
`        : j.slow ? (stent ? NOTE_SLOW[stent] : 'Hepatopetal but slow: typical of portal hypertension.')
        : j.fast ? 'Hepatopetal but fast: above the usual range for this vein.'`, 'the slow note');
  // one judgment for every vessel
  b = once(b, `IT = { dir: '', sev: '', pattern: '', note: '', pi: 0, expected: false }`, `IT = { dir: '', sev: '', pattern: '', note: '', pi: 0, expected: false, out: false }`, 'IT');
  b = once(b, `    return say(dir, sev, pattern, note, pi, jetOk);\n  }`, `    return judged(say(dir, sev, pattern, note, pi, jetOk), mj, normal, p);\n  }`, 'the verdict\'s return');
  b = once(b, `o.expected = expected; return o; };`,
`o.expected = expected; o.out = false; return o; };
  // (One judgment of the speed against the usual range, run on every verdict: the verdict's tone and words and the gauge's amber flag (\`out\`) all read it, so a speed flagged outside its
  // usual range is never called normal. A stent's deliberate reduction jet is expected and a stent of another diameter has a model band, neither is flagged, B13.)
  const judged = (o, m, normal, p) => {
    const low = !!normal && m < normal[0], high = !!normal && m > normal[1];
    o.out = !!normal && !o.expected && !(p.kind === 'tips' && normal !== p.normal) && (low || high);
    if (o.out) {
      if (o.sev === 'ok') o.sev = 'caution';
      if (/^Normal/.test(o.note)) o.note = \`Speed is \${low ? 'below' : 'above'} the usual range for this vessel. \` + o.note.replace(/^Normal: ?(.)/, (_, c) => c.toUpperCase());
    }
    return o;
  };`, 'say');
  return b;
}
