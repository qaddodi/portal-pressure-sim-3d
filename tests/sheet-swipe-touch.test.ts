import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachSheetSwipe } from '../src/ui/shell/sheet-swipe.ts';

// A sheet and the events a finger makes, as a play-test tool or a phone sends them: pointer events with pointerType "touch", touch events alone, and both together (a real phone sends both).
class Panel {
  l = new Map<string, ((e: unknown) => void)[]>();
  dataset: Record<string, string> = {}; style: { translate?: string } = {}; classList = { contains: () => false };
  offsetHeight = 600; scrollHeight = 600; clientHeight = 600; parentElement = null;
  hasAttribute() { return false; } closest() { return null; } setPointerCapture() {}
  addEventListener(t: string, f: (e: unknown) => void) { this.l.set(t, [...(this.l.get(t) ?? []), f]); }
  removeEventListener(t: string, f: (e: unknown) => void) { this.l.set(t, (this.l.get(t) ?? []).filter((x) => x !== f)); }
  fire(t: string, e: object) { const ev = { cancelable: true, prevented: false, preventDefault() { this.prevented = true; }, stopPropagation() {}, target: this, ...e }; for (const f of this.l.get(t) ?? []) f(ev); return ev as { prevented: boolean }; }
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pe = (p: Panel, t: string, y: number, o: object = {}) => p.fire(t, { pointerType: 'touch', isPrimary: true, pointerId: 7, clientX: 100, clientY: y, ...o });
const te = (p: Panel, t: string, y: number, x = 100) => p.fire(t, { touches: t === 'touchend' ? [] : [{ identifier: 3, clientX: x, clientY: y }] });

/** A drag of `to` px down in 8 steps, 10 ms apart: via the given inputs. */
async function drag(p: Panel, to: number, via: ('pointer' | 'touch')[], x = 100): Promise<boolean> {
  const y0 = 300; let claimed = false;
  if (via.includes('pointer')) pe(p, 'pointerdown', y0);
  if (via.includes('touch')) te(p, 'touchstart', y0);
  for (let i = 1; i <= 8; i++) {
    const y = y0 + (to * i) / 8;
    if (via.includes('pointer')) pe(p, 'pointermove', y, { clientX: x });
    if (via.includes('touch')) { const e = te(p, 'touchmove', y, x); claimed ||= e.prevented; }
    await wait(10);
  }
  if (via.includes('pointer')) pe(p, 'pointerup', y0 + to);
  if (via.includes('touch')) te(p, 'touchend', y0 + to);
  return claimed;
}

test('a pointer sequence of a touch (pointerType "touch") pulls the sheet and closes it past the short way', async () => {
  const p = new Panel(); let closed = 0;
  const off = attachSheetSwipe(p as unknown as HTMLElement, { onClose: () => closed++ });
  await drag(p, 160, ['pointer']);
  assert.equal(closed, 1);
  assert.equal(p.dataset.swiped, '1', 'it is already on its way out: the stylesheet gives its own exit way');
  await wait(300);
  assert.match(p.style.translate ?? '', /^0px \d+(\.\d+)?px$/, 'and rests out of sight');
  off();
  assert.equal(p.style.translate, '', 'taken off with the remover');
});

test('touch events alone (a tool that sends only those) do the same, and claim the pull so the page does not scroll', async () => {
  const p = new Panel(); let closed = 0;
  const off = attachSheetSwipe(p as unknown as HTMLElement, { onClose: () => closed++ });
  const claimed = await drag(p, 160, ['touch']);
  assert.equal(closed, 1);
  assert.equal(claimed, true, 'preventDefault on a downward pull, so iOS does not take the touch for scrolling');
  off();
});

test('a phone sends both: the gesture is one, and it closes the sheet once', async () => {
  const p = new Panel(); let closed = 0;
  const off = attachSheetSwipe(p as unknown as HTMLElement, { onClose: () => closed++ });
  await drag(p, 160, ['pointer', 'touch']);
  assert.equal(closed, 1);
  off();
});

test('a short slow pull eases back and does not close', async () => {
  const p = new Panel(); let closed = 0;
  const off = attachSheetSwipe(p as unknown as HTMLElement, { onClose: () => closed++ });
  const y0 = 300;
  pe(p, 'pointerdown', y0);
  for (let i = 1; i <= 6; i++) { pe(p, 'pointermove', y0 + 7 * i); await wait(60); }   // 42 px over 360 ms
  pe(p, 'pointerup', y0 + 42);
  await wait(500);
  assert.equal(closed, 0);
  assert.equal(p.style.translate, '', 'back at rest');
  assert.equal(p.dataset.swiped, undefined);
  off();
});

test('a mouse is no swipe, a sideways drag is not the sheet\'s, a pull up never closes, and a disabled sheet ignores all', async () => {
  const p = new Panel(); let closed = 0, on = true;
  const off = attachSheetSwipe(p as unknown as HTMLElement, { onClose: () => closed++, enabled: () => on });
  pe(p, 'pointerdown', 300, { pointerType: 'mouse' }); for (let i = 1; i <= 8; i++) pe(p, 'pointermove', 300 + 20 * i, { pointerType: 'mouse' }); pe(p, 'pointerup', 460, { pointerType: 'mouse' });
  assert.equal(closed, 0, 'mouse');
  const claimed = await drag(p, 12, ['touch'], 100 + 200);   // sideways: x moves far, y a little
  p.fire('touchstart', { touches: [{ identifier: 3, clientX: 100, clientY: 300 }] });
  const e = p.fire('touchmove', { touches: [{ identifier: 3, clientX: 220, clientY: 305 }] });
  assert.equal(e.prevented, false, 'sideways is left to the page');
  void claimed;
  p.fire('touchend', {});
  await drag(p, -160, ['touch']);
  await wait(300);
  assert.equal(closed, 0, 'a pull up stretches and eases back');
  on = false;
  await drag(p, 200, ['touch', 'pointer']);
  assert.equal(closed, 0, 'disabled');
  off();
});
