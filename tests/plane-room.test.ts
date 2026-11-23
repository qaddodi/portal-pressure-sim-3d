// Plan 43 Part C: a picture is never drawn taller than the room its panel leaves it. Below the plot's floor the picture says what it WANTS instead (Frame.want) and the panel zooms its contents down to it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planeFrame, PLOT_LEAST } from '../src/ui/charts/plane/frame.ts';
import { PLANES } from '../src/ui/charts/plane/model.ts';
import { ctxOf } from './charts-helpers.ts';

const pts = [{ f: { hvpg: 5, ppg: 20 } as never, name: 'Schistosomiasis' }, { f: { hvpg: 18, ppg: 18 } as never, name: 'Cirrhosis' }, { f: { hvpg: 12, ppg: 9 } as never, name: 'Right heart failure' }];

test('a summary plane is never taller than its room (or says what it wants), at every width and every room, for every plane', () => {
  let held = 0, wanted = 0;
  for (const [name, pl] of Object.entries(PLANES)) {
    for (const [dev, w] of [['phone-portrait', 358], ['tablet-portrait', 540], ['desktop', 380], ['desktop', 520], ['desktop', 700]] as const) {
      const c = ctxOf('light', w, dev as 'desktop');
      const free = planeFrame({ plane: pl, points: pts }, c).frame, least = planeFrame({ plane: pl, points: pts, height: PLOT_LEAST }, c).frame.h;   // (the frame at the plot's least: what a room too small for it gets)
      for (let room = 80; room <= free.h + 60; room += 10) {
        const f = planeFrame({ plane: pl, points: pts, room }, c).frame;
        const at = `${name} ${dev} ${w} room ${room}`;
        assert.ok(f.h <= free.h, `${at}: never taller than without a room`);
        if (f.want == null) assert.ok(f.h <= room + 1 || room >= free.h, `${at}: ${f.h} high, no want`);
        else { wanted++; assert.ok(f.want > f.h, `${at}: it wants more than it was given`); assert.ok(f.h <= Math.max(room + 1, least + 1), `${at}: ${f.h} in a room of ${room} (the least frame is ${least})`); }
        if (f.h < free.h) held++;
      }
    }
  }
  assert.ok(held > 50 && wanted > 0, `the sweep held ${held} and reported ${wanted} wants`);
});

test('the want is what the old floor drew: a 150 px plot', () => {
  const pl = PLANES['hvpg-ppg']!, c = ctxOf('light', 520, 'desktop');
  const free = planeFrame({ plane: pl, points: pts }, c).frame;
  const tiny = planeFrame({ plane: pl, points: pts, room: 100 }, c).frame;
  assert.ok(tiny.h < free.h, `${tiny.h} of ${free.h}`);
  assert.ok((tiny.want ?? 0) > tiny.h && (tiny.want ?? 0) <= free.h, `wants ${tiny.want} of ${free.h}`);
});

test('the panel\'s fit counts what a picture still wants, and the painter publishes it where the fit reads it', () => {
  assert.match(readFileSync('src/ui/cards/CardFrame.tsx', 'utf8'), /size = \(\) => [^;]*\+ heldBy\(el\)/);
  assert.match(readFileSync('src/ui/charts/painter.ts', 'utf8'), /next\.want != null && next\.want > next\.h/);
});
