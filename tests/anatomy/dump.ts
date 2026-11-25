// What every reader of the anatomy gets (anatomy integration plan, phase 1, 24 Nov 2026): the drawn course and radius of every vessel, the stations, the catheter routes, the camera
// shots of every region, the dive's anchor and the liver branches. Frozen in tests/fixtures/anatomy-placed.json (anatomy-today.json keeps the 2D figure's, last default at f17b151a, as the reference the placed frames are held to).
// Numbers are rounded to 1e-4 scene units (about 0.02 mm), the noise floor of a refactor; anything bigger is a real move.
import { NETWORK, MAPPED } from '../../src/scene/vessels/network.ts';
import { centrelineOf } from '../../src/scene/vessels/centreline.ts';
import { STATIONS, figureCourses } from '../../src/scene/labels/stations.ts';
import { catheterRoute } from '../../src/scene/catheter-route.ts';
import { ROUTE_KINDS, routeOf } from '../../src/scene/procedures/route.ts';
import { SHOTS } from '../../src/scene/camera/shots.ts';
import { boxToShot } from '../../src/decks/hp/cams.ts';
import { REGIONS_HP, REGIONS_2D } from '../../src/scene/anatomy/source.ts';
import { shotOfBox } from '../../src/decks/ag/shots.ts';
import { LIVER_POINT, SIN_POINT } from '../../src/scene/lobule/frames.ts';
import { LIVER_BRANCHES } from '../../src/scene/vessels/liver-branches.ts';

const r4 = (v: unknown): unknown => typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : Array.isArray(v) ? v.map(r4) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, r4(x)])) : v;
const U = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];

export function anatomyDump(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const v of NETWORK) out[`course:${v.id}`] = r4({ pts: v.pts, r: v.radius, tier: v.tier });
  for (const v of MAPPED) {
    const c = centrelineOf(v.id);
    if (c) out[`drawn:${v.id}`] = r4({ len: c.length, p: U.map((u) => c.pointAt(u)), r: U.map((u) => c.radiusAt(u)) });
  }
  for (const f of figureCourses()) out[`figure:${f.v.id}`] = r4(f.pts.map((p) => [p.x, p.y, p.z]));
  for (const s of STATIONS) out[`station:${s.id}`] = r4(s);
  out['catheter:hvpg'] = r4(catheterRoute());
  for (const k of ROUTE_KINDS) { const r = routeOf(k); out[`route:${k}`] = r ? r4({ pts: r.pts, rad: (r as { rad?: number[] }).rad, parts: r.parts }) : null; }
  for (const [k, s] of Object.entries(SHOTS)) out[`shot:${k}`] = r4(s);
  for (const [k, b] of Object.entries(REGIONS_HP)) out[`region-hp:${k}`] = r4(boxToShot(b));
  for (const [k, b] of Object.entries(REGIONS_2D)) out[`region-ag:${k}`] = r4(shotOfBox(b));
  out['dive:liver'] = r4(LIVER_POINT); out['dive:sinusoid'] = r4(SIN_POINT);
  for (const b of LIVER_BRANCHES) out[`branches:${b.host}`] = r4(b);
  return out;
}
