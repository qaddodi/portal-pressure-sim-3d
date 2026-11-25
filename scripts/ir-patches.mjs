// The two changes this app makes on top of the 2D app's pressure monitor, applied by scripts/copy-b11-ir.mjs to every copy it writes (and run once over the files already here), so a re-copy
// from 2D keeps them. Each is an exact text swap that throws when the 2D source has moved, so a change upstream is noticed, never silently dropped. When the 2D app takes them, delete the swap.
//
// Owner, 25 Nov 2026: "the monitor should not show the 11.1 HVPG yet, until we actually do the math on screen". The big headline number on the HVPG tracing read the HVPG as soon as the
// tracing stood still at the end of the wedge (HVPG_SCRIPT.status keyed the HVPG on `!running`), before the bracket from the free to the wedged level (the subtraction) was drawn. And when
// the result did arrive, the headline's words and number changed in one frame, a snap.
//   1. headline: a script's headline switches to the result only once the result's time (`result.at`: the bracket has been drawn) has come, whether or not the tracing is still moving.
//   2. fade:     for the result's fade (RESULT_FADE_MS, the result tag's own), the reading that stood before it eases out as the result eases in; the header words move with it.

const swap = (name, src, from, to) => {
  if (src.split(from).length !== 2) throw new Error(`ir-patches: ${name}: the text to change is not there exactly once (the 2D source has moved): ${from.slice(0, 80)}`);
  return src.replace(from, () => to);
};

export const RESULT_FADE_MS = 450;

/** hvpg-proc.js, as copied: the HVPG headline from the result's time on, running or not. */
export function patchHvpgScript(src) {
  return swap('hvpg-proc.js', src,
    "else if (st.running && t < T.sum) { o.label = 'WHVP';",
    "else if (t < T.sum) { o.label = 'WHVP';");   // (before: held at the end of the wedge, not running, it read the HVPG with no bracket on the trace)
}

/** monitor.js, as copied: the headline's crossfade into the result. */
export function patchMonitor(src) {
  let s = src;
  s = swap('monitor.js', s,
    "const ST = { label: '', num: '', col: 'text' };   // (what a script's status writes: kept, written in place)",
    `const ST = { label: '', num: '', col: 'text' };   // (what a script's status writes: kept, written in place)
const PREV = { label: '', num: '', col: 'text' };   // (what the status read just before the result arrived, while that fades out)
const RESULT_FADE_MS = ${RESULT_FADE_MS};   // (the result tag's own fade: the headline eases into the result over the same time)`);
  s = swap('monitor.js', s,
    "  else S.status(t, v, st, ST);\n  const col = C[ST.col] || C.text;",
    `  else S.status(t, v, st, ST);
  // (The result never snaps in: for RESULT_FADE_MS after the script's result time the reading that stood before it fades out as the result fades in, the header words gliding with it.)
  const rs = S.result, fadeK = ph === 'run' && rs && t >= rs.at && t < rs.at + RESULT_FADE_MS ? ease(k01(t, rs.at, rs.at + RESULT_FADE_MS)) : 1;
  PREV.label = ''; PREV.num = ''; PREV.col = 'text';
  if (fadeK < 1) S.status(rs.at - 1, v, st, PREV);
  const fading = fadeK < 1 && (PREV.label !== ST.label || PREV.num !== ST.num);
  const col = C[ST.col] || C.text;`);
  s = swap('monitor.js', s,
    "  const lw = ST.label ? ctx.measureText(ST.label).width + 14 : 0, room1 = room - lw;",
    `  const lwNow = ST.label ? ctx.measureText(ST.label).width + 14 : 0, lwWas = fading && PREV.label ? ctx.measureText(PREV.label).width + 14 : 0;
  const lw = fading ? lwWas + (lwNow - lwWas) * fadeK : lwNow, room1 = room - lw;`);
  s = swap('monitor.js', s,
    "  ctx.font = FONT(700, FS + 2); ctx.fillStyle = ST.col === 'text' ? C.bright : col; ctx.fillText(ST.label, x, y + 15 * HK);\n  if (ST.num) { ctx.font = FONT(700, big); ctx.fillStyle = ST.col === 'text' ? C.bright : col; ctx.textAlign = 'right'; ctx.fillText(ST.num, x + W, y + 14 + big); ctx.textAlign = 'left'; }",
    `  if (fading) {
    const colWas = C[PREV.col] || C.text;
    ctx.globalAlpha = 1 - fadeK;
    ctx.font = FONT(700, FS + 2); ctx.fillStyle = PREV.col === 'text' ? C.bright : colWas; ctx.fillText(PREV.label, x, y + 15 * HK);
    if (PREV.num) { ctx.font = FONT(700, big); ctx.fillStyle = PREV.col === 'text' ? C.bright : colWas; ctx.textAlign = 'right'; ctx.fillText(PREV.num, x + W, y + 14 + big); ctx.textAlign = 'left'; }
    ctx.globalAlpha = fadeK;
  }
  ctx.font = FONT(700, FS + 2); ctx.fillStyle = ST.col === 'text' ? C.bright : col; ctx.fillText(ST.label, x, y + 15 * HK);
  if (ST.num) { ctx.font = FONT(700, big); ctx.fillStyle = ST.col === 'text' ? C.bright : col; ctx.textAlign = 'right'; ctx.fillText(ST.num, x + W, y + 14 + big); ctx.textAlign = 'left'; }
  ctx.globalAlpha = 1;`);
  return s;
}
