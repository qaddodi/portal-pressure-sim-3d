// Settings > Record window: where the row shows, the format and the file's name, the shortcut, the phases, and the run against stand-ins for the browser (cancel, stop, the browser bar's "Stop sharing", a failure).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canRecordWindow, pickRecordMime, recordExt, recordFileName, isRecordKey, recordStep, recordRow, RECORD_MIMES, type RecordPhase, type RecordEvent } from '../src/ui/capture/record-model.ts';
import { isCaptureKey } from '../src/ui/capture/capture-model.ts';
import { createRecordRun, isRefusal, type RecordDeps, type RecordNote, type RecorderLike, type StreamLike } from '../src/ui/capture/record-run.ts';
import { RECORD } from '../src/ui/shell/words.ts';

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const at = new Date(2026, 10, 27, 9, 8, 7);

test('the row shows only where the browser can share a window AND write video (looked for, never read from the user agent)', () => {
  const fn = () => undefined;
  assert.equal(canRecordWindow({ getDisplayMedia: fn, MediaRecorder: fn }), true, 'a laptop browser');
  assert.equal(canRecordWindow({}), false, 'an iPhone: neither');
  assert.equal(canRecordWindow({ MediaRecorder: fn }), false, 'a phone browser that records but cannot share a screen');
  assert.equal(canRecordWindow({ getDisplayMedia: fn }), false, 'it can share but not write video');
  assert.equal(canRecordWindow({ getDisplayMedia: undefined, MediaRecorder: fn }), false);
  assert.equal(canRecordWindow({ getDisplayMedia: 'yes', MediaRecorder: fn }), false, 'a thing that is not a function is not a capability');
});

test('the row and the shortcut are gated by the one check, and nothing in Record window reads the user agent', () => {
  const sheet = src('src/ui/settings/SettingsSheet.tsx'), keys = src('src/ui/keys/useKeys.ts'), rec = src('src/ui/capture/record.ts');
  assert.match(sheet, /if \(!recordAvailable\(\)\) return null;/);
  assert.match(keys, /isRecordKey\(e\) && recordAvailable\(\)/);
  assert.match(rec, /canRecordWindow\(\{ getDisplayMedia: navigator\.mediaDevices\?\.getDisplayMedia/);
  assert.match(rec, /if \(!recordAvailable\(\)\) return Promise\.resolve\(\);/, 'the toggle itself does nothing where it cannot work');
  for (const f of ['record.ts', 'record-model.ts', 'record-run.ts']) assert.ok(!/userAgent|platform\b|iPhone|iPad|Safari\)/.test(src(`src/ui/capture/${f}`).replace(/\/\/.*|\/\*\*[\s\S]*?\*\//g, '')), `${f} sniffs nothing`);
});

test('Record window sits in Settings with Capture screen, and its press runs inside the tap (no import() before the browser is asked)', () => {
  const sheet = src('src/ui/settings/SettingsSheet.tsx'), rec = src('src/ui/capture/record.ts');
  assert.match(sheet, /<RecordRow touch=\{touch\} \/>/);
  assert.ok(sheet.indexOf('<RecordRow') > sheet.indexOf('label={CAPTURE.row}') && sheet.indexOf('<RecordRow') < sheet.indexOf('label={CAPTURE.deckRow}'), 'between Capture screen and Capture this deck');
  assert.match(sheet, /from '\.\.\/capture\/record\.ts'/, 'imported statically');
  assert.ok(!/import\('\.\.\/capture\/record/.test(sheet + src('src/ui/keys/useKeys.ts')), 'a dynamic import in the tap spends the tap (Safari)');
  assert.match(rec, /preferCurrentTab: true/);
});

test('the format is the first one the browser says it writes: WebM, then MP4 (Safari); none known leaves it to the browser', () => {
  const only = (...ok: string[]) => (m: string) => ok.includes(m);
  assert.equal(pickRecordMime(only('video/webm;codecs=vp9', 'video/webm')), 'video/webm;codecs=vp9');
  assert.equal(pickRecordMime(only('video/webm')), 'video/webm');
  assert.equal(pickRecordMime(only('video/mp4')), 'video/mp4');
  assert.equal(pickRecordMime(only('video/mp4;codecs=avc1', 'video/mp4')), 'video/mp4;codecs=avc1');
  assert.equal(pickRecordMime(only()), '');
  assert.equal(pickRecordMime(undefined), '');
  assert.equal(pickRecordMime(() => { throw new Error('no'); }), '', 'a browser that throws for a type does not write it');
  assert.ok(RECORD_MIMES.indexOf('video/webm') < RECORD_MIMES.indexOf('video/mp4'));
  assert.equal(recordExt('video/mp4;codecs=avc1'), 'mp4'); assert.equal(recordExt('video/mp4'), 'mp4'); assert.equal(recordExt('video/webm;codecs=vp9'), 'webm'); assert.equal(recordExt(''), 'webm');
});

test('the video is named like the capture files, with its format as the extension', () => {
  assert.equal(recordFileName('lobule', 'cirr-decomp', '48b3b5e4', at, 'video/webm;codecs=vp9'), 'portal-pressure-capture-lobule-cirr-decomp-48b3b5e4-20261127-090807.webm');
  assert.equal(recordFileName('anatomic', null, 'local', at, 'video/mp4'), 'portal-pressure-capture-anatomic-local-20261127-090807.mp4');
});

test('Option Shift R records; it is its own key, not Capture\'s', () => {
  const k = (o: object) => ({ altKey: true, shiftKey: true, code: 'KeyR', key: '®', ...o });
  assert.equal(isRecordKey(k({})), true, 'by its place on the board (Option makes another character on a Mac)');
  assert.equal(isRecordKey(k({ code: undefined, key: 'R' })), true);
  assert.equal(isRecordKey(k({ repeat: true })), false, 'a held key does not start and stop it');
  assert.equal(isRecordKey(k({ ctrlKey: true })), false); assert.equal(isRecordKey(k({ metaKey: true })), false);
  assert.equal(isRecordKey(k({ shiftKey: false })), false); assert.equal(isRecordKey(k({ altKey: false })), false);
  assert.equal(isRecordKey(k({ code: 'KeyS', key: 'S' })), false);
  assert.equal(isCaptureKey(k({})), false);
});

const PHASES: RecordPhase[] = ['idle', 'asking', 'recording', 'saving'], EVENTS: RecordEvent[] = ['press', 'granted', 'refused', 'ended', 'saved', 'failed'];
test('the phases: idle asks, the browser answers, recording stops into saving, saving ends idle; everything else is left as it is', () => {
  assert.equal(recordStep('idle', 'press'), 'asking');
  assert.equal(recordStep('asking', 'granted'), 'recording');
  assert.equal(recordStep('asking', 'refused'), 'idle', 'the person cancelled the picker');
  assert.equal(recordStep('asking', 'failed'), 'idle');
  assert.equal(recordStep('asking', 'press'), 'asking', 'a second press while the browser asks changes nothing');
  assert.equal(recordStep('recording', 'press'), 'saving', 'the row or the shortcut again is Stop');
  assert.equal(recordStep('recording', 'ended'), 'saving', 'the browser bar\'s Stop sharing saves what was recorded');
  assert.equal(recordStep('recording', 'failed'), 'idle');
  assert.equal(recordStep('saving', 'saved'), 'idle');
  assert.equal(recordStep('saving', 'failed'), 'idle');
  assert.equal(recordStep('saving', 'press'), 'saving', 'pressing while the file is made does not start another');
  // nothing jumps: from idle only a press leaves; nothing is entered except by the step above
  for (const e of EVENTS) if (e !== 'press') assert.equal(recordStep('idle', e), 'idle', `idle ignores ${e}`);
  for (const p of PHASES) for (const e of EVENTS) assert.ok(PHASES.includes(recordStep(p, e)));
  // every phase can get back to idle (no phase is a trap)
  for (const p of PHASES) { const seen = new Set<RecordPhase>([p]); let grew = true; while (grew) { grew = false; for (const q of [...seen]) for (const e of EVENTS) { const n = recordStep(q, e); if (!seen.has(n)) { seen.add(n); grew = true; } } } assert.ok(seen.has('idle'), `${p} reaches idle`); }
});

test('the row says what it offers: Record window, then Stop recording, then that the file is being made', () => {
  assert.equal(recordRow('idle', RECORD), 'Record window'); assert.equal(recordRow('asking', RECORD), 'Record window');
  assert.equal(recordRow('recording', RECORD), 'Stop recording'); assert.equal(recordRow('saving', RECORD), RECORD.savingRow);
});

// ---- the run, against stand-ins for the browser ---------------------------------------------------------------------------
class FakeTrack { stopped = false; onended: (() => void) | null = null; stop() { this.stopped = true; } addEventListener(_t: 'ended', fn: () => void) { this.onended = fn; } }
class FakeStream implements StreamLike { track = new FakeTrack(); getTracks() { return [this.track]; } getVideoTracks() { return [this.track]; } }
class FakeRecorder implements RecorderLike {
  state = 'inactive'; ondataavailable: RecorderLike['ondataavailable'] = null; onstop: RecorderLike['onstop'] = null; onerror: RecorderLike['onerror'] = null; started = 0;
  mimeType: string; data: Blob[];
  constructor(mimeType: string, data: Blob[]) { this.mimeType = mimeType; this.data = data; }
  start() { this.state = 'recording'; this.started++; }
  stop() { for (const d of this.data) this.ondataavailable?.({ data: d }); this.state = 'inactive'; this.onstop?.(undefined); }
}
function rig(opts: { ask?: () => Promise<StreamLike>; mime?: string; data?: Blob[]; recorder?: () => RecorderLike } = {}) {
  const stream = new FakeStream(), phases: RecordPhase[] = [], notes: RecordNote[] = [], saved: { size: number; ext: string }[] = [];
  const rec = new FakeRecorder(opts.mime ?? 'video/webm;codecs=vp9', opts.data ?? [new Blob(['aa']), new Blob(['bbb'])]);
  let asked = 0;
  const deps: RecordDeps = {
    ask: () => { asked++; return opts.ask ? opts.ask() : Promise.resolve(stream); },
    recorder: opts.recorder ?? (() => rec),
    save: (v, ext) => { saved.push({ size: v.size, ext }); },
    tell: (n) => { notes.push(n); }, onPhase: (p) => { phases.push(p); },
  };
  return { run: createRecordRun(deps), stream, rec, phases, notes, saved, asked: () => asked };
}
const err = (name: string) => Object.assign(new Error(name), { name });

test('record, then stop from the row: asked once, recorded, the video saved once as WebM, the share ended, idle again', async () => {
  const r = rig();
  await r.run.press();
  assert.equal(r.run.phase(), 'recording'); assert.equal(r.rec.started, 1); assert.deepEqual(r.notes, ['recording']); assert.equal(r.saved.length, 0);
  await r.run.press();
  assert.equal(r.run.phase(), 'idle'); assert.deepEqual(r.saved, [{ size: 5, ext: 'webm' }]); assert.deepEqual(r.notes, ['recording', 'saved']);
  assert.equal(r.stream.track.stopped, true, 'the browser\'s sharing indicator goes away');
  assert.deepEqual(r.phases, ['asking', 'recording', 'saving', 'idle']);
});

test('Safari writes MP4: the file is .mp4', async () => {
  const r = rig({ mime: 'video/mp4' });
  await r.run.press(); await r.run.press();
  assert.deepEqual(r.saved, [{ size: 5, ext: 'mp4' }]);
});

test('the person cancels the picker: back to idle, nothing recorded, nothing saved, nothing said', async () => {
  for (const name of ['NotAllowedError', 'AbortError']) {
    const r = rig({ ask: () => Promise.reject(err(name)) });
    await r.run.press();
    assert.equal(r.run.phase(), 'idle'); assert.deepEqual(r.notes, []); assert.deepEqual(r.saved, []); assert.equal(r.rec.started, 0);
    await r.run.press(); assert.equal(r.asked(), 2, 'and they can try again');
  }
  assert.equal(isRefusal(err('NotAllowedError')), true); assert.equal(isRefusal(err('NotFoundError')), false); assert.equal(isRefusal(null), false);
});

test('the browser breaks (not a "no"): idle again and the person is told', async () => {
  const r = rig({ ask: () => Promise.reject(err('NotReadableError')) });
  const warn = console.warn; console.warn = () => undefined;
  try { await r.run.press(); } finally { console.warn = warn; }
  assert.equal(r.run.phase(), 'idle'); assert.deepEqual(r.notes, ['failed']); assert.deepEqual(r.saved, []);
});

test('the browser bar\'s "Stop sharing" (the track ends) stops and saves what was recorded', async () => {
  const r = rig();
  await r.run.press();
  r.stream.track.onended?.();
  assert.equal(r.run.phase(), 'idle'); assert.deepEqual(r.saved, [{ size: 5, ext: 'webm' }]); assert.deepEqual(r.phases, ['asking', 'recording', 'saving', 'idle']);
  r.stream.track.onended?.();
  assert.equal(r.saved.length, 1, 'ending twice saves once');
});

test('a press while the browser is asking does nothing; a press after the track ended starts a new recording', async () => {
  let yes: (s: StreamLike) => void = () => undefined;
  const r = rig({ ask: () => new Promise<StreamLike>((ok) => { yes = ok; }) });
  const first = r.run.press();
  assert.equal(r.run.phase(), 'asking');
  await r.run.press();
  assert.equal(r.asked(), 1, 'one question to the browser');
  yes(r.stream); await first;
  assert.equal(r.run.phase(), 'recording');
});

test('no video came out, or the recorder could not be made or started: idle, told, the share let go, nothing saved', async () => {
  const warn = console.warn; console.warn = () => undefined;
  try {
    const empty = rig({ data: [new Blob([])] });
    await empty.run.press(); await empty.run.press();
    assert.equal(empty.run.phase(), 'idle'); assert.deepEqual(empty.saved, []); assert.deepEqual(empty.notes, ['recording', 'failed']);
    const broken = rig({ recorder: () => { throw err('NotSupportedError'); } });
    await broken.run.press();
    assert.equal(broken.run.phase(), 'idle'); assert.deepEqual(broken.notes, ['failed']); assert.equal(broken.stream.track.stopped, true);
    const noStart = rig(); noStart.rec.start = () => { throw err('InvalidStateError'); };
    await noStart.run.press();
    assert.equal(noStart.run.phase(), 'idle'); assert.deepEqual(noStart.notes, ['failed']); assert.equal(noStart.stream.track.stopped, true);
  } finally { console.warn = warn; }
});

test('a recorder error mid-way ends it once and tells once', async () => {
  const r = rig();
  await r.run.press();
  r.rec.onerror?.(undefined); r.rec.onerror?.(undefined);
  assert.equal(r.run.phase(), 'idle'); assert.deepEqual(r.notes, ['recording', 'failed']); assert.deepEqual(r.saved, []); assert.equal(r.stream.track.stopped, true);
});

test('the words: plain, no dot, Stop is a word in the toast', () => {
  assert.equal(RECORD.row, 'Record window'); assert.equal(RECORD.stopRow, 'Stop recording'); assert.equal(RECORD.stop, 'Stop');
  assert.ok(!/[●•]/.test(Object.values(RECORD).join(' ')));
});
