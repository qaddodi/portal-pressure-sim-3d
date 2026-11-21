import { clock } from '../../../clock/frame.ts';
// A rest pass for the copied 2D modules (rest-pass.js): `fn` runs once, in a task of its own after the one that asked, never inside a frame. The 2D scheduler adds a shared budget;
// the shell's few passes (a glide's measuring, a tab fit) need only the order and the task boundary.
let next = 1;
const pending = new Map<number, number>();
export function restPass(fn: () => void): number {
  const id = next++;
  pending.set(id, clock.after(() => { pending.delete(id); fn(); }, 0));
  return id;
}
export function cancelRest(id: number): void {
  const t = pending.get(id);
  if (t !== undefined) { clock.cancel(t); pending.delete(id); }
}
