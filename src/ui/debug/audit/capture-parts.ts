// A capture's zip is never one huge Blob in Safari (26 Nov: the page ran out of memory making the zip of a whole audit). The files in storage are planned into parts, each small enough for
// one Blob, and the person saves them one at a time (capture-deliver.ts); a browser that can write straight to a file the person picked (Chrome, Edge) needs no Blob at all and takes parts
// as big as a zip can be. Pure: tests/capture-parts.test.ts.

/** What one zip held as a Blob in memory may be: small enough for Safari, big enough that a whole size's pictures are usually one part. */
export const PART_BYTES_BLOB = 200 * 1024 * 1024;
/** What one zip written straight to a file may be: a zip (no zip64) ends at 4 GB. */
export const PART_BYTES_FILE = 3 * 1024 * 1024 * 1024;
/** A zip (no zip64) holds 65535 files. */
export const PART_FILES = 60000;

export interface Sized { name: string; bytes: number }
export interface PartPlan {
  /** 1-based, and how many parts there are */
  index: number; of: number;
  /** the files of this part, in zip order (the files at the top of the capture, README and the manifest, are in every part) */
  names: string[];
  bytes: number;
  /** the folders it holds (`iphone + mac`), in words */
  label: string;
}

/** The parts of a capture: one when it fits; otherwise whole folders (a size, then a talk or a case) are kept together and packed in order, a folder too big for a part is split by its own
 *  folders, and a single file bigger than the limit is a part of its own. The files with no folder go in every part. */
export function planParts(files: readonly Sized[], limit: { bytes: number; files?: number } = { bytes: PART_BYTES_BLOB }): PartPlan[] {
  const maxFiles = limit.files ?? PART_FILES;
  const top = files.filter((f) => !f.name.includes('/')), rest = files.filter((f) => f.name.includes('/')).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const topBytes = top.reduce((n, f) => n + f.bytes, 0), budget = Math.max(1, limit.bytes - topBytes), room = Math.max(1, maxFiles - top.length);
  const size = (g: readonly Sized[]): number => g.reduce((n, f) => n + f.bytes, 0);
  const fits = (g: readonly Sized[]): boolean => size(g) <= budget && g.length <= room;
  /** the files cut into units that each fit (or are one file), folder by folder */
  const split = (g: Sized[], depth: number): Sized[][] => {
    if (fits(g) || g.length <= 1) return [g];
    const by: { seg: string | undefined; items: Sized[] }[] = [];
    for (const f of g) {
      const seg = f.name.split('/')[depth], last = by[by.length - 1];
      if (last && last.seg === seg) last.items.push(f); else by.push({ seg, items: [f] });
    }
    // (every file under one folder: look a level deeper; files that are the folder's own, with no deeper folder, are each a unit)
    if (by.length === 1) return depth > 32 ? g.map((f) => [f]) : split(g, depth + 1);
    return by.flatMap((b) => split(b.items, depth + 1));
  };
  const units = rest.length ? split(rest, 0) : [];
  const groups: { names: string[]; bytes: number; folders: string[] }[] = [];
  let cur: { names: string[]; bytes: number; folders: string[] } | null = null;
  for (const u of units) {
    const bytes = size(u);
    if (!cur || cur.bytes + bytes > budget || cur.names.length + u.length > room) { cur = { names: [], bytes: 0, folders: [] }; groups.push(cur); }
    cur.names.push(...u.map((f) => f.name)); cur.bytes += bytes;
    for (const f of u) { const d = f.name.split('/')[0]!; if (!cur.folders.includes(d)) cur.folders.push(d); }
  }
  if (!groups.length) groups.push({ names: [], bytes: 0, folders: [] });
  const topNames = top.map((f) => f.name).sort();
  return groups.map((g, i) => ({ index: i + 1, of: groups.length, names: [...topNames, ...g.names], bytes: topBytes + g.bytes, label: g.folders.join(' + ') }));
}

/** A part's file name: the zip's own name when there is one part, else `-part2of4` before the `.zip`. */
export const partName = (zipName: string, p: Pick<PartPlan, 'index' | 'of'>): string => (p.of <= 1 ? zipName : zipName.replace(/(\.zip)?$/, `-part${p.index}of${p.of}.zip`));

/** A size in words (`180 MB`, `2.4 GB`). */
export const sizeWords = (bytes: number): string => (bytes >= 1e9 ? `${Math.round(bytes / 1e8) / 10} GB` : `${Math.max(0.1, Math.round(bytes / 1e5) / 10)} MB`);
