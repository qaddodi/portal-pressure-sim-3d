// Settings > Record window: where the row shows, the format and the file's name, the shortcut, the phases, and the run against stand-ins for the browser (cancel, stop, the browser bar's "Stop sharing", a failure).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canRecordWindow, actualMime, pickRecordMime, recordExt, recordFileName, recordSize, recordBitrate, RECORD_FPS, noteWords, isRecordKey, recordStep, recordRow, RECORD_MIMES, type RecordPhase, type RecordEvent } from '../src/ui/capture/record-model.ts';
import { isCaptureKey } from '../src/ui/capture/capture-model.ts';
import { createRecordRun, raiseToFullSize, isRefusal, type RecordDeps, type RecordNote, type RecorderLike, type StreamLike } from '../src/ui/capture/record-run.ts';
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
  const sheet = src('src/ui/settings/SettingsSheet.tsx'), keys = src('src/ui/keys/useKeys.ts'), model = src('src/ui/capture/record-model.ts');
  assert.match(sheet, /if \(!recordAvailable\(\)\) return null;/);
  assert.match(keys, /isRecordKey\(e\) && recordAvailable\(\)/);
  assert.match(model, /canRecordWindow\(\{ getDisplayMedia: navigator\.mediaDevices\?\.getDisplayMedia/);
  assert.match(model, /if \(!recordAvailable\(\)\) return Promise\.resolve\(\);/, 'the toggle itself does nothing where it cannot work');
  for (const f of ['record.ts', 'record-model.ts', 'record-run.ts']) assert.ok(!/userAgent|platform\b|iPhone|iPad|Safari\)/.test(src(`src/ui/capture/${f}`).replace(/\/\/.*|\/\*\*[\s\S]*?\*\//g, '')), `${f} sniffs nothing`);
});

test('Record window sits in Settings with Capture screen; the code that talks to the browser is a chunk fetched after the first picture, yet a press goes straight through inside the tap', () => {
  const sheet = src('src/ui/settings/SettingsSheet.tsx'), model = src('src/ui/capture/record-model.ts'), keys = src('src/ui/keys/useKeys.ts');
  assert.match(sheet, /<RecordRow touch=\{touch\} \/>/);
  assert.ok(sheet.indexOf('<RecordRow') > sheet.indexOf('label={CAPTURE.row}') && sheet.indexOf('<RecordRow') < sheet.indexOf('label={CAPTURE.deckRow}'), 'between Capture screen and Capture this deck');
  // the boot entry imports only the light part (tests/boot-entry.test.ts holds its file count)
  for (const f of ['src/ui/settings/SettingsSheet.tsx', 'src/ui/keys/useKeys.ts', 'src/ui/capture/RecordIndicator.tsx', 'src/ui/shell/TopBar.tsx']) assert.ok(!/from '[^']*capture\/record(-run)?\.ts'/.test(src(f)), `${f} does not import the browser code statically`);
  assert.match(model, /import\('\.\/record\.ts'\)/);
  assert.match(model, /if \(engine\) return engine\.toggleRecordingNow\(\);/, 'once the code is in, the press is a plain call inside the tap: Safari lets a page ask to share a screen only there');
  assert.match(sheet, /void warmRecording\(\)/, 'fetched as Settings opens'); assert.match(keys, /warmRecording\(\)/, 'and shortly after the first picture, for the shortcut');
  assert.ok(!/import\('\.\.\/capture\/record/.test(sheet + keys), 'no import() in the tap itself');
  assert.match(src('src/ui/capture/record.ts'), /preferCurrentTab: true/);
});

test('the format is the first one the browser says it writes: MP4 first, then WebM; none known leaves it to the browser', () => {
  const only = (...ok: string[]) => (m: string) => ok.includes(m);
  assert.equal(pickRecordMime(only('video/webm;codecs=vp9', 'video/webm')), 'video/webm;codecs=vp9');
  assert.equal(pickRecordMime(only('video/webm')), 'video/webm');
  assert.equal(pickRecordMime(only('video/webm;codecs=vp9', 'video/webm', 'video/mp4;codecs=avc1', 'video/mp4')), 'video/mp4;codecs=avc1', 'a browser that writes both (Safari, Chrome 126+) gets MP4: it plays everywhere');
  assert.equal(pickRecordMime(only('video/mp4')), 'video/mp4');
  assert.equal(pickRecordMime(only('video/mp4;codecs=avc1', 'video/mp4')), 'video/mp4;codecs=avc1');
  assert.equal(pickRecordMime(only()), '');
  assert.equal(pickRecordMime(undefined), '');
  assert.equal(pickRecordMime(() => { throw new Error('no'); }), '', 'a browser that throws for a type does not write it');
  assert.ok(RECORD_MIMES.indexOf('video/mp4') < RECORD_MIMES.indexOf('video/webm'));
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
  const runRef: { run?: ReturnType<typeof createRecordRun> } = {};
  const rec = new FakeRecorder(opts.mime ?? 'video/webm;codecs=vp9', opts.data ?? [new Blob(['aa']), new Blob(['bbb'])]);
  let asked = 0;
  const told: { note: RecordNote; phase: RecordPhase }[] = [];
  const deps: RecordDeps = {
    ask: () => { asked++; return opts.ask ? opts.ask() : Promise.resolve(stream); },
    recorder: opts.recorder ?? (() => rec),
    save: (v, ext) => { saved.push({ size: v.size, ext }); },
    tell: (n) => { notes.push(n); told.push({ note: n, phase: runRef.run?.phase() ?? 'idle' }); }, onPhase: (p) => { phases.push(p); }
  };
  const run = createRecordRun(deps); runRef.run = run;
  return { run, told, stream, rec, phases, notes, saved, asked: () => asked };
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

test('a recorder error mid-way is not a failure while it holds a recording: it is stopped, the video saved, and nothing says "Couldn\'t record"', async () => {
  const warn = console.warn; console.warn = () => undefined;
  try {
    const r = rig();
    await r.run.press();
    r.rec.onerror?.(undefined); r.rec.onerror?.(undefined);
    assert.equal(r.run.phase(), 'idle'); assert.deepEqual(r.saved, [{ size: 5, ext: 'webm' }]); assert.deepEqual(r.notes, ['recording', 'saved']); assert.equal(r.stream.track.stopped, true);
    // an error with nothing recorded is the one failure, told once
    const none = rig({ data: [] });
    await none.run.press(); none.rec.onerror?.(undefined); none.rec.onerror?.(undefined);
    assert.equal(none.run.phase(), 'idle'); assert.deepEqual(none.notes, ['recording', 'failed']); assert.deepEqual(none.saved, []);
  } finally { console.warn = warn; }
});

test('"Couldn\'t record" is told only when no file was handed over: nothing after a save (a late error, a second stop, a throw while stopping) can say it', async () => {
  const warn = console.warn; console.warn = () => undefined;
  try {
    const r = rig();
    await r.run.press(); await r.run.press();
    assert.deepEqual(r.notes, ['recording', 'saved']);
    r.rec.onerror?.(undefined); r.rec.onstop?.(undefined); r.stream.track.onended?.();
    assert.deepEqual(r.notes, ['recording', 'saved'], 'nothing more is said'); assert.equal(r.saved.length, 1);
    // the recorder runs its stop handler inside stop() and then throws: the video is already saved
    const t = rig(); t.rec.stop = () => { t.rec.state = 'inactive'; for (const d of [new Blob(['xx'])]) t.rec.ondataavailable?.({ data: d }); t.rec.onstop?.(undefined); throw err('InvalidStateError'); };
    await t.run.press(); await t.run.press();
    assert.deepEqual(t.saved, [{ size: 2, ext: 'webm' }]); assert.deepEqual(t.notes, ['recording', 'saved'], 'saved, and not told it failed');
  } finally { console.warn = warn; }
});

test('full size: the screen\'s own pixels at the device pixel ratio, and a bit rate that follows what the track delivers', () => {
  assert.deepEqual(recordSize({ w: 1512, h: 982 }, 2), { w: 3024, h: 1964 });
  assert.deepEqual(recordSize({ w: 1920, h: 1080 }, 1), { w: 1920, h: 1080 });
  assert.deepEqual(recordSize({ w: 1440, h: 900 }, 0), { w: 1440, h: 900 }, 'a missing ratio is 1');
  assert.equal(RECORD_FPS, 60);
  assert.equal(recordBitrate(3024, 1964, 60), 100_000_000, 'a retina screen at 60 fps gets the most');
  assert.equal(recordBitrate(1440, 900, 60), Math.round(1440 * 900 * 60 * 0.4));
  assert.ok(recordBitrate(3024, 1964, 30) > 70_000_000, 'a retina screen at 30 fps (Safari) is about 71 Mbps');
  assert.equal(recordBitrate(320, 240, 30), 20_000_000, 'never starved');
  assert.equal(recordBitrate(7680, 4320, 60), 100_000_000, 'never absurd');
  assert.ok(recordBitrate(3024, 1964, 30) > recordBitrate(1512, 982, 30));
  const rec = src('src/ui/capture/record.ts');
  assert.match(rec, /width: \{ ideal: size\.w \}, height: \{ ideal: size\.h \}, frameRate: \{ ideal: RECORD_FPS \}, resizeMode: 'none'/);
  assert.match(rec, /outerWidth > 0 \? outerWidth : screen\.width/, 'the window\'s own pixels, not the whole screen\'s');
  assert.match(rec, /videoBitsPerSecond/); assert.match(src('src/ui/capture/record-run.ts'), /applyConstraints/); assert.match(rec, /raiseToFullSize/);
});

test('the words: plain, no dot, Stop is a word in the toast', () => {
  assert.equal(RECORD.row, 'Record window'); assert.equal(RECORD.stopRow, 'Stop recording'); assert.equal(RECORD.stopButton, 'Stop recording');
  assert.ok(!/[●•]/.test(Object.values(RECORD).join(' ')));
});

test('the file is named by the format the recorder really wrote (its mimeType, else its first piece), never by the one hoped for', async () => {
  assert.equal(actualMime('video/mp4', '', 'video/webm'), 'video/mp4'); assert.equal(actualMime('', 'video/mp4', 'video/webm'), 'video/mp4'); assert.equal(actualMime('', '', 'video/webm'), 'video/webm');
  // a recorder that does not say, writing pieces that say mp4: the file is .mp4
  const r = rig({ mime: '', data: [new Blob(['aa'], { type: 'video/mp4' }), new Blob(['b'], { type: 'video/mp4' })] });
  await r.run.press(); await r.run.press();
  assert.deepEqual(r.saved, [{ size: 3, ext: 'mp4' }]);
});

test('no toast and no outline while recording; the stop button stands beside Settings in the top bar, the thumb bar and the presenter pill', () => {
  const rec = src('src/ui/capture/record.ts');
  assert.ok(!/RECORD\.on\b/.test(rec) && !/note === 'recording'/.test(rec));
  assert.match(src('src/ui/shell/TopBar.tsx'), /<RecordStop \/>\s*\n\s*<button type="button" className="ib" id="btnSettings"/);
  assert.match(src('src/ui/shell/ThumbBar.tsx'), /t\.id === 'settings' \? <RecordStop tab \/>/);
  assert.match(src('src/ui/settings/SettingsMenu.tsx'), /<RecordStop \/>/);
  assert.match(src('src/ui/deck/PresenterBar.tsx'), /RECORD_STOP_W/);
  const ind = src('src/ui/capture/RecordIndicator.tsx'), css = src('src/ui/capture/record.css');
  for (const t of [rec, ind, css, src('src/App.tsx')]) assert.ok(!/RecordFrame|rec-frame|RestrictionTarget|restrictTo|showRecordFrame/.test(t), 'no red outline round the app, in any browser (Mohammad, 27 Nov)');
  assert.match(css, /prefers-reduced-motion/); assert.match(css, /@keyframes rec-breathe \{ 0%, 100% \{ opacity: 1; \} 50% \{ opacity: \.4; \} \}/, 'the pulse is opacity only');
});

test('the failure line is the words of the failure note ONLY: "recording" says nothing (it once fell into the failure line and said "Couldn\'t record" over a working recording)', () => {
  const words = { saved: 'S', failed: 'F' };
  assert.equal(noteWords('recording', words), null);
  assert.deepEqual(noteWords('saved', words), { text: 'S', tone: 'info' });
  assert.deepEqual(noteWords('saved', words, '3024 x 1964'), { text: 'S 3024 x 1964', tone: 'info' }, 'the saved line carries what was recorded');
  assert.deepEqual(noteWords('failed', words), { text: 'F', tone: 'bad' });
  const rec = src('src/ui/capture/record.ts');
  assert.match(rec, /noteWords\(note, RECORD,/); assert.ok(!/else[^\n]*RECORD\.failed/.test(rec), 'no catch-all that says failed');
});

test('"Couldn\'t record" can be told only when nothing is recording and nothing was saved, in every way a recording can go wrong or right', async () => {
  const warn = console.warn; console.warn = () => undefined;
  try {
    const all = [
      rig(), rig({ ask: () => Promise.reject(err('NotAllowedError')) }), rig({ ask: () => Promise.reject(err('NotReadableError')) }), rig({ data: [] }),
      rig({ recorder: () => { throw err('NotSupportedError'); } }), rig({ mime: 'video/mp4' }),
    ];
    for (const r of all) { await r.run.press(); r.rec.onerror?.(undefined); await r.run.press(); r.stream.track.onended?.(); await r.run.press(); }
    for (const r of all) for (const t of r.told) {
      if (t.note === 'failed') { assert.equal(t.phase, 'idle', 'told only once nothing is recording'); assert.equal(r.saved.length, 0, 'and only when no file was saved'); }
      assert.notEqual(noteWords(t.note, { saved: 'S', failed: 'F' })?.text === 'F' && t.phase === 'recording', true);
    }
    // a good recording says nothing while it runs
    const good = rig(); await good.run.press();
    assert.equal(good.run.phase(), 'recording'); assert.equal(good.notes.filter((n) => noteWords(n, { saved: 'S', failed: 'F' })).length, 0, 'nothing is shown while recording');
  } finally { console.warn = warn; }
});

test('a refused full-size upgrade (applyConstraints rejects, whatever the reason) changes nothing: no error, the recording starts and goes on', async () => {
  for (const name of ['OverconstrainedError', 'NotAllowedError', 'InvalidStateError', 'TypeError']) {
    let tried = 0;
    const small = { width: 800, height: 600, frameRate: 30 };
    const track = { getSettings: () => small, applyConstraints: () => { tried++; return Promise.reject(err(name)); } };
    const gave = await raiseToFullSize(track, [{ width: { ideal: 3024 } }, { width: { min: 3024 } }], { w: 3024, h: 1964 }, 60);
    assert.equal(tried, 2, 'it asked each way in turn, and a refusal of the first did not stop the second'); assert.match(gave, /800 x 600 at 30 fps/, 'and reports what it really has');
    // the stream the run records is the one it was given: a recording that starts with it says nothing but "recording"
    const r = rig({ ask: async () => { await raiseToFullSize(track, [{}], { w: 3024, h: 1964 }, 60); return r0.stream; } });
    const r0 = r;
    await r.run.press();
    assert.equal(r.run.phase(), 'recording'); assert.deepEqual(r.notes, ['recording']); assert.equal(r.rec.started, 1);
  }
  // a track that is already full size is not asked; one whose settings throw still does not reject
  let asked = 0;
  await raiseToFullSize({ getSettings: () => ({ width: 3024, height: 1964, frameRate: 60 }), applyConstraints: () => { asked++; return Promise.resolve(); } }, [{}], { w: 3024, h: 1964 }, 60);
  assert.equal(asked, 0);
  const broken = { getSettings: (): never => { throw err('InvalidStateError'); }, applyConstraints: () => Promise.resolve() };
  assert.equal(await raiseToFullSize(broken, [{}], { w: 1, h: 1 }, 60), 'an unknown size');
});

test('a track that is short of the size is asked each way until it is full size, then left alone', async () => {
  let w = 785; const asks: string[] = [];
  const track = { getSettings: () => ({ width: w, height: 1205, frameRate: 60 }), applyConstraints: (c: MediaTrackConstraints) => { asks.push(JSON.stringify(c)); if ('min' in (c.width as object)) w = 1570; return Promise.resolve(); } };
  const gave = await raiseToFullSize(track, [{ width: { ideal: 1570 } }, { width: { min: 1570 } }, { width: { min: 9999 } }], { w: 1570, h: 1205 }, 60);
  assert.equal(asks.length, 2, 'the third is never asked once the size is reached'); assert.match(gave, /1570 x 1205/);
});
