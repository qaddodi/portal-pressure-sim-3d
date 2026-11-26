// The weld plan as one binary file (baked at build time, scripts/bake-welds.mjs; the phone fetches it and plans nothing). Layout: "LWB2", u32 header length, the header as JSON (the plan with every
// typed array replaced by its reference {$t, o, n, m} and every Map by {$m: [[key, value]...]}), padding to 4 bytes, then the arrays' bytes (written through a reversible
// transform each, bake-pack.ts: read back bit for bit).
import type { WeldPlan } from './welds.ts';
import { PackWriter, isRef, unpackRef } from '../bake-pack.ts';
import { Printer, printString, samePrint } from '../fingerprint.ts';

const MAGIC = 0x3242574c;   // "LWB2"

/** What the plan was made from (the courses and the discs to avoid), as a fingerprint (scene/fingerprint.ts):
 *  strings and shape exactly, the numbers as sums compared with a tolerance, so the last bits of
 *  another engine's sin and cos never cost a phone its baked file, and a moved course always does. Compare two with `samePrint`, never `===`. */
export function weldDigest(req: unknown): string {
  const p = new Printer();
  // (each element of a top-level list is a group of its own, a course or a disc: a change to one is judged against that one's size, not the whole network's)
  if (req && typeof req === 'object' && !Array.isArray(req)) {
    for (const k of Object.keys(req).sort()) {
      const v = (req as Record<string, unknown>)[k];
      p.text(k);
      if (Array.isArray(v)) for (const x of v) { p.walk(x); p.group(); }
      else { p.walk(v); p.group(); }
    }
  } else p.walk(req);
  return printString(p.finish());
}

export function encodePlan(plan: WeldPlan, digest: string, gz?: (b: Uint8Array) => number): Uint8Array {
  const w = new PackWriter(gz);
  const pack = (v: unknown): unknown => {
    if (v instanceof Map) return { $m: [...v].map(([k, x]) => [k, pack(x)]) };
    if (v instanceof Float32Array || v instanceof Uint32Array || v instanceof Int32Array) return w.add(v);
    if (Array.isArray(v)) return v.map(pack);
    if (v && typeof v === 'object') { const out: Record<string, unknown> = {}; for (const k of Object.keys(v)) out[k] = pack((v as Record<string, unknown>)[k]); return out; }
    return v;
  };
  const head = new TextEncoder().encode(JSON.stringify({ digest, plan: pack(plan) }));
  const data = w.finish(), start = 8 + head.length + ((4 - ((8 + head.length) % 4)) % 4);
  const out = new Uint8Array(start + data.length), dv = new DataView(out.buffer);
  dv.setUint32(0, MAGIC, true); dv.setUint32(4, head.length, true); out.set(head, 8); out.set(data, start);
  return out;
}

/** The plan in a baked file, or null when the file is not one, or was made for other numbers than `digest`. */
export function decodePlan(buf: ArrayBuffer, digest: string): WeldPlan | null {
  if (buf.byteLength < 8) return null;
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== MAGIC) return null;
  const hl = dv.getUint32(4, true), headPad = (4 - ((8 + hl) % 4)) % 4, start = 8 + hl + headPad;
  let head: { digest: string; plan: unknown };
  try { head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hl))); } catch { return null; }
  if (typeof head.digest !== 'string' || !samePrint(head.digest, digest)) return null;
  const unpack = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(unpack);
    if (isRef(v)) return unpackRef(buf, start, v);
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (Array.isArray(o.$m)) return new Map((o.$m as [string, unknown][]).map(([k, x]) => [k, unpack(x)]));
      const out: Record<string, unknown> = {}; for (const k of Object.keys(o)) out[k] = unpack(o[k]); return out;
    }
    return v;
  };
  try { return unpack(head.plan) as WeldPlan; } catch { return null; }
}
