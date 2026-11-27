// COURSES DRAWN AFTER THE FREEZE (a ruling of Mohammad's replaces a frozen course, which stays untouched in placement.generated.ts and art/anatomy-placement:
// tests/anatomy-placement-copy.test.ts holds the copy to the frozen file). Every reader of a placed course (the network builder, the framing boxes) takes it through DRAWN_COURSES.
import { PLACED_COURSES, type P3 } from './placement.generated.ts';

/** THE SPONTANEOUS SPLENORENAL SHUNT, OVER THE KIDNEY (Mohammad, 27 Nov: "the spontaneous splenorenal shunt is not connected to the splenic vein; also it looks weird, and is NOT visible
 *  from front view well"; he picked A of the mocks, reports/splenorenal-shunt/mock-A-C-front.png, and then: "can we make every shunt open at a slightly different location on the vessel").
 *  ROOT CAUSE (placed-network.ts SIBLINGS APART): it opened beside the distal splenorenal shunt at the same node, and the bow that sets two siblings apart ran along the normal of the plane of the
 *  host's axis and the sibling's heading, which for two vessels lying in the screen's plane is the view's depth. C6 was bowed straight back: it left the splenic vein end-on (83 % of its first
 *  stretch along the depth, so from the front it stopped at the vein) and lay behind the stomach (11 % of it clear of the stomach's outline, the rest dimmed by the organ veil).
 *  It now has a take-off of its own (OWN_TAKEOFF): the first point is on the splenic vein's own course, upstream of SVD and apart from the distal shunt, so it leaves in the screen plane. It makes one
 *  broad S down the stomach's edge and across the front of the kidney (in front of its face, never through it), and runs the last 0.1 beside the distal shunt into the renal vein, where it opens at
 *  LRV_S as before (within PARALLEL_DEG of the distal shunt, so SIBLINGS APART still sets the two apart there and the tract rule leaves the pair alone). The last point is the node's.
 *  THE TAKE-OFF STANDS ON THE VEIN'S STRAIGHT STRETCH (Mohammad, 27 Nov: "the splenorenal shunt junction is a mess, it's kinky").
 *  The first point was at 0.66 of the splenic vein, where it bends toward SVD:
 *  the junction skin that fills the host around a take-off is built from the host's own axis, and on the bend it came out lumpy (a bulge on the inner wall, a sharp inner corner where the leg began).
 *  It is now at 0.43, where the vein runs nearly straight (its heading turns 7 degrees over the skin's reach, against 21 at the old place), and C6 leaves at about 30 degrees to it so the two part cleanly. */
export const C6_DRAWN: readonly P3[] = [
  [0.790, 0.450, -0.135], [0.806, 0.39, -0.13], [0.815, 0.33, -0.13], [0.815, 0.28, -0.13], [0.81, 0.21, -0.14], [0.79, 0.14, -0.15],
  [0.76, 0.12, -0.155], [0.70, 0.08, -0.165], [0.64, 0.04, -0.19], [0.55, -0.005, -0.212],
];

/** The placed courses as drawn: the frozen ones, with the rulings made since the freeze laid over them. */
export const DRAWN_COURSES: Readonly<Record<string, readonly P3[]>> = { ...PLACED_COURSES, C6: C6_DRAWN };
