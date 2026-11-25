// The weld plan as one binary file (baked at build time, scripts/bake-welds.mjs; the phone fetches it and plans nothing). Layout: "LWB2", u32 header length, the header as JSON (the plan with every
// typed array replaced by its reference {$t, o, n, m} and every Map by {$m: [[key, value]...]}), padding to 4 bytes, then the arrays' bytes (written through a reversible
// transform each, bake-pack.ts: read back bit for bit).
import type { WeldPlan } from './welds.ts';
import { PackWriter, isRef, unpackRef } from '../bake-pack.ts';

const MAGIC = 0x3242574c;   // "LWB2"

/** A cheap digest of what the plan was made from (the courses and the discs to avoid, to 1e-5), so a baked file made for other numbers is never laid in. */
export function weldDigest(req: unknown): string {
  let h1 = 0x811c9dc5, h2 = 0x1b873593, n = 0;
  const mix = (x: number) => { h1 = Math.imul(h1 ^ x, 16777619) >>> 0; h2 = Math.imul(h2 + x, 0x85ebca6b) >>> 0; h2 ^= h2 >>> 13; n++; };
  // (numbers to 1e-5: the browser's own sin and cos may differ from node's in the last bits, and a phone must still know the file for its own)
  const walk = (v: unknown): void => {
    if (typeof v === 'number') mix(Math.round(v * 1e5) | 0);
    else if (typeof v === 'string') { for (let i = 0; i < v.length; i++) mix(v.charCodeAt(i)); mix(0x7f); }
    else if (Array.isArray(v)) { mix(0x5b); for (const x of v) walk(x); mix(0x5d); }
    else if (v && typeof v === 'object') for (const k of Object.keys(v).sort()) { walk(k); walk((v as Record<string, unknown>)[k]); }
    else mix(v === true ? 1 : 2);
  };
  walk(req);
  return `${h1.toString(16)}-${h2.toString(16)}-${n}`;
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
  if (head.digest !== digest) return null;
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
