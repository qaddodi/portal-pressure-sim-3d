// The registry entry of the curve chart (one file per chart, so the threads that port the charts never edit the same lines of registry.ts).
// The 2D app's `curve` tool (a parameter sweep, or a reading against a reading) and its `course` tool (one reading over the days after an event) are one kind here, as there.
import type { ChartKind } from '../registry.ts';
import { againstSpecimen, courseSpecimen, courseWaitingSpecimen, relationSpecimen, tipsSpecimen } from './specimens.ts';

export const curveEntry: ChartKind = {
  kind: 'curve', what: 'One quantity against another, or a parameter sweep, with its course', slides: 25, status: 'done',
  specimens: [
    { id: 'sweep', label: 'A stent\'s diameter against two readings (specimen numbers)', build: tipsSpecimen },
    { id: 'against', label: 'One reading with and without a drug, each line named on it', build: againstSpecimen },
    { id: 'relation', label: 'A reading against a reading, with cut-offs and three named points joined in order', build: relationSpecimen },
    { id: 'course', label: 'A course: ascites over the weeks after a tap, two treatments', build: courseSpecimen },
    { id: 'course-wait', label: 'The course before its days are worked out (zones, numbers, axes)', build: courseWaitingSpecimen },
  ],
};
