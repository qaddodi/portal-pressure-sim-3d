// The Doppler cell's picture (table-wave.ts has the numbers): toward the probe above the baseline in the Doppler's toward colour, away below it in its away colour (lifted toward the text colour so it reads on a
// dark card), a 1 px baseline, 2 px lines with round joins, as a frame for the charts' one shared GPU drawer.
import { mix, parseColour, type Rgba } from '../charts/colour.ts';
import type { Frame, Shape } from '../charts/scene.ts';
import { pen } from '../charts/scene.ts';
import { H, MID, wavePoints, type Trace } from './table-wave.ts';

const TOWARD = parseColour('rgb(224, 90, 48)'), AWAY = parseColour('#5072E0');   // (--dop-toward, --dop-away: the same in every look)

/** The cell's picture: a box w px wide and h tall. */
export function waveFrame(trace: Trace, vessel: string, max: number, w: number, h: number, text: Rgba, base: Rgba, words: string): Frame {
  const mid = (MID / H) * h, pts = wavePoints(trace, vessel, max, w, h), shapes: Shape[] = [];
  shapes.push({ k: 'line', x1: 0, y1: mid, x2: w, y2: mid, pen: pen(base, 1) });
  const away = mix('srgb', AWAY, 60, text, 40);
  shapes.push({ k: 'clip', x: 0, y: 0, w, h: mid }, { k: 'path', pts, pen: pen(TOWARD, 2, { join: 'round', cap: 'round' }) }, { k: 'unclip' });
  shapes.push({ k: 'clip', x: 0, y: mid, w, h: h - mid }, { k: 'path', pts, pen: pen(away, 2, { join: 'round', cap: 'round' }) }, { k: 'unclip' });
  return { w, h, shapes, label: words };
}

