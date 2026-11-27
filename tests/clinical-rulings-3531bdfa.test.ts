// The owner's clinical rulings C1 to C15 on the external review of capture 3531bdfa (27 Nov 2026) that are wording in a talk: every patch of CAPTURE_3531BDFA_CLINICAL is in the talk the app
// loads (a re-copy from 2D, or a later patch over the same field, may not undo a ruling), and the general rules those rulings state hold over every talk. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAPTURE_3531BDFA_CLINICAL } from '../scripts/source-edits.mjs';
import { loadSource } from '../src/decks/source.ts';
import { AG_IDS } from '../src/decks/ag/index.ts';
import { HP_IDS } from '../src/decks/hp/index.ts';
import { RW_IDS } from '../src/decks/rw/copied/index.ts';

type Patch = { deck: string; at: string; from?: string; to?: string; set?: unknown; drop?: boolean; append?: string; after?: boolean };
const decks = new Map<string, Record<string, unknown>>();
const deckOf = async (id: string) => decks.get(id) ?? (decks.set(id, (await loadSource(id)) as unknown as Record<string, unknown>), decks.get(id)!);

/** The field a patch path names ("slides.<slide id>.line", "checks.1.1", "objectives.2"). */
function fieldOf(deck: Record<string, unknown>, at: string): { parent: Record<string, unknown> | unknown[] | undefined; key: string } {
  const parts = at.split('.');
  let cur: unknown = deck;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    cur = Array.isArray(cur) && !/^\d+$/.test(p) ? cur.find((x) => (x as { id?: string }).id === p) : (cur as Record<string, unknown> | undefined)?.[p];
  }
  return { parent: cur as Record<string, unknown> | unknown[] | undefined, key: parts.at(-1)! };
}

test('every patch of the C1 to C15 group holds in the talk the app loads', async () => {
  let n = 0;
  for (const p of CAPTURE_3531BDFA_CLINICAL as Patch[]) {
    const d = await deckOf(p.deck);
    const { parent, key } = fieldOf(d, p.at);
    const at = `${p.deck} ${p.at}`;
    if (p.after) { assert.ok(fieldOf(d, `${p.at}`).key && (d.slides as { id: string }[]).some((s) => s.id === (p.set as { id: string }).id), at); n++; continue; }
    assert.ok(parent, `${at}: the field's parent is there`);
    const v = (parent as Record<string, unknown>)[key];
    if (p.drop) assert.equal(v, undefined, at);
    else if (p.set !== undefined) assert.deepEqual(v, p.set, at);
    else if (p.append !== undefined) assert.ok(String(v).includes(p.append), at);
    else assert.ok(String(v).includes(p.to!), `${at}: holds the new words`);
    n++;
  }
  assert.ok(n > 40, `${n} patches checked`);
});

test('C8 and C14: no talk\'s on-screen words carry the dropped phrases', async () => {
  const all = JSON.stringify(await Promise.all([...AG_IDS, ...HP_IDS, ...RW_IDS].map(async (id) => {
    const d = { ...(await deckOf(id)) } as Record<string, unknown>;
    // (speaker notes are where the sources live; only what is on screen is read)
    d.slides = (d.slides as Record<string, unknown>[]).map(({ notes: _n, ...s }) => s);
    return d;
  })));
  assert.doesNotMatch(all, /Bureau, Ann Intern Med 2021/, 'C14: a non-Baveno citation is for the notes');
  assert.doesNotMatch(all, /every 2 to 4 weeks/, 'C8: banding is every 1 to 4 weeks until eradication');
});
