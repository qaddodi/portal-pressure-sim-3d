// The app icon and favicon are the 2D app's, same files, wired the same way: head links, manifest icons and the files themselves exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));

test('index.html links the favicon, apple-touch-icon and manifest, and each file exists', () => {
  for (const href of ['brand/mark.svg', 'brand/icon-32.png', 'brand/icon-180.png', 'manifest.webmanifest']) {
    assert.ok(html.includes(`href="./${href}"`), `${href} linked`);
    assert.ok(existsSync(`public/${href}`), `public/${href} exists`);
  }
  assert.match(html, /rel="apple-touch-icon"/);
  assert.match(html, /apple-mobile-web-app-title" content="Portal Sim"/);
});

test('the manifest lists 192, 512, maskable and svg icons that all exist', () => {
  const srcs = manifest.icons.map((i: { src: string }) => i.src);
  for (const s of ['brand/icon-192.png', 'brand/icon-512.png', 'brand/icon-maskable-512.png', 'brand/mark.svg']) assert.ok(srcs.includes(s), s);
  for (const s of srcs) assert.ok(existsSync(`public/${s}`), `${s} exists`);
  assert.ok(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable'));
});
