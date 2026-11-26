// One course played for tests/red-wale.test.ts, in a worker of its own: at the end of each day, the varix's flag and ratios and the red wale event's state; and the days the event fired.
import { parentPort, workerData } from 'node:worker_threads';
import { COURSES } from '../src/ui/histories/courses.ts';
import { playCourse } from '../src/ui/histories/play.ts';

const c = COURSES.find((x) => x.id === workerData)!;
const days: unknown[] = [];
const b = playCourse(c, (e, m, day) => {
  const vx = (m as { varix: unknown }).varix;
  days.push({ day, vx, active: !!(e as { evState?: { RED_WALE?: { active: boolean } } }).evState?.RED_WALE?.active });
});
parentPort!.postMessage({ days, fired: b.entries.filter((x) => x.evId === 'RED_WALE').map((x) => x.day) });
