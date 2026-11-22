// N3: Copy figure / Save figure. The pure part (what is kept, in what order, the scale, the gradient's parse) in node; the wiring in the source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { figureItems, figureFileName, parseGradient, pictureScale, MIN_ALPHA, type Item } from '../src/ui/shell/figure-image.ts';

const stage = { x: 10, y: 20, w: 400, h: 300 };
const box = (over = {}): Item => ({ k: 'box', x: 50, y: 60, w: 80, h: 30, r: 8, fill: '#fff', bw: 1, bc: '#000', alpha: 1, ...over }) as Item;
const text = (over = {}): Item => ({ k: 'text', text: 'PV', x: 100, y: 50, w: 20, font: '600 12px Inter', fill: '#111', halo: '#fff', haloW: 2, spacing: 0, rot: 0, alpha: 1, ...over }) as Item;
const line = (over = {}): Item => ({ k: 'line', x1: 100, y1: 50, x2: 150, y2: 90, w: 1, color: '#444', alpha: 1, ...over }) as Item;
const path = (over = {}): Item => ({ k: 'path', d: 'M0 0L10 10', m: [1, 0, 0, 1, 300, 300], fill: null, stroke: '#000', sw: 2, join: 'round', cap: 'round', alpha: 1, ...over }) as Item;

test('what is settled and on the stage is kept, in the order it was read (a card\'s glass before its words)', () => {
  const items = [box(), line(), text(), path()];
  assert.deepEqual(figureItems(items, stage), items);
});

test('what is leaving or arriving, empty, or off the stage is not drawn', () => {
  const gone: Item[] = [
    box({ alpha: MIN_ALPHA - 0.01 }), text({ alpha: 0.1 }), text({ text: '  ' }), text({ x: 900 }), text({ y: 5 }),
    box({ x: 900 }), box({ w: 0 }), line({ x1: 800, y1: 800, x2: 900, y2: 900 }), path({ alpha: 0.2 }),
  ];
  assert.deepEqual(figureItems(gone, stage), []);
  assert.equal(figureItems([box({ x: 380, w: 100 })], stage).length, 1, 'a card half over the edge is kept');
  assert.equal(figureItems([line({ x1: 100, y1: 50, x2: 900, y2: 90 })], stage).length, 1, 'a leader that ends on the stage is kept');
});

test('the picture is 2x the stage, kept inside what the device can draw', () => {
  assert.equal(pictureScale({ w: 400, h: 300 }, 2, 16384), 2, 'a phone, a laptop: 2x');
  assert.equal(pictureScale({ w: 2560, h: 1440 }, 2, 16384), 2, 'a big screen is 14.7 million pixels: still 2x');
  assert.ok(pictureScale({ w: 5000, h: 3000 }, 2, 16384) < 2, 'over the pixel budget it steps down');
  assert.equal(pictureScale({ w: 5000, h: 1000 }, 2, 8192), 8192 / 5000, 'a side the texture cannot hold');
  assert.equal(pictureScale({ w: 0, h: 0 }, 2, 8192), 1);
  assert.ok(pictureScale({ w: 20000, h: 20000 }, 2, 8192) >= 1, 'never below 1x');
});

test('a gradient bar (the colour key) parses: its angle and its stops, evenly spread where unplaced', () => {
  assert.deepEqual(parseGradient('linear-gradient(to right, rgb(10, 20, 30), rgb(200, 100, 0))'), { angle: 90, stops: [[0, 'rgb(10, 20, 30)'], [1, 'rgb(200, 100, 0)']] });
  assert.deepEqual(parseGradient('linear-gradient(90deg, #fff 0%, #888 40%, #000 100%)'), { angle: 90, stops: [[0, '#fff'], [0.4, '#888'], [1, '#000']] });
  assert.deepEqual(parseGradient('linear-gradient(red, green, blue)'), { angle: 180, stops: [[0, 'red'], [0.5, 'green'], [1, 'blue']] });
  assert.equal(parseGradient('none'), null);
  assert.equal(parseGradient('linear-gradient(red 10px, blue)'), null, 'pixel positions are not read');
});

test('the file is named for what it shows', () => {
  assert.equal(figureFileName('anatomic', 'cirr-decomp'), 'portal-pressure-anatomic-cirr-decomp.png');
  assert.equal(figureFileName('Circuit view', null), 'portal-pressure-circuit-view.png');
});

test('wired: the Figure menu has Copy and Save; the stage is drawn at 2x in the one task and put back; the key, cards and probes are all read; nothing runs per frame', () => {
  const menu = readFileSync('src/ui/shell/FigureMenu.tsx', 'utf8');
  assert.match(menu, /copyFigure\(\)/); assert.match(menu, /saveFigure\(\)/);
  const dom = readFileSync('src/ui/shell/figure-image-dom.ts', 'utf8');
  assert.match(dom, /PICTURE_SCALE = 2/);
  assert.match(dom, /querySelectorAll\('\.lb-layer'\)/, 'every label layer: names, probes, the key (the cards are in the first)');
  assert.ok(!/preserveDrawingBuffer|requestAnimationFrame/.test(dom));
  assert.match(dom, /new CI\(\{ 'image\/png': picture \}\)/, 'the clipboard item is made inside the click, holding a promise');
  assert.ok(dom.indexOf('const picture = figurePicture()') < dom.indexOf('navigator.clipboard.write'));
  const stage = readFileSync('src/scene/Stage.tsx', 'utf8');
  assert.match(stage, /gl\.setPixelRatio\(s\); cel\.render\(gl\);/);
  assert.match(stage, /finally \{ gl\.setPixelRatio\(rest\); cel\.render\(gl\);/, 'put back and drawn again in the same task: the screen never shows the other size');
});
