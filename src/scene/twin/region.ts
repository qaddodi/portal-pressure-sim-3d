// The split orbit draws two figures into one picture: the slide's patient on the right, the healthy liver on the left, each in its own region of the one render target
// (docs/approved/split-orbit.md). A region is a rectangle in the target's pixels, origin at the bottom left (a render target's scissor). Pure: no GL, no clock.
export interface Region { x: number; y: number; w: number; h: number }

/** The canvas cut at `at` (0 to 1, from the left) into the twin's region and the page's: whole pixels, no gap and no overlap. */
export function splitRegions(width: number, height: number, at: number): { twin: Region; main: Region } {
  const cut = Math.min(width - 1, Math.max(1, Math.round(width * Math.min(1, Math.max(0, at)))));
  return { twin: { x: 0, y: 0, w: cut, h: height }, main: { x: cut, y: 0, w: width - cut, h: height } };
}

/** What a render target needs to confine a clear and a draw to `r` (or to lift the confinement with null). */
export interface ScissorTarget { scissorTest: boolean; scissor: { set(x: number, y: number, w: number, h: number): unknown } }
export function confine(target: ScissorTarget, r: Region | null): void {
  target.scissorTest = r !== null;
  if (r) target.scissor.set(r.x, r.y, r.w, r.h);
}

/** A room in CSS px (camera/room.ts), kept apart here so this file stays pure. */
export interface RoomPx { x: number; y: number; w: number; h: number }

/** The free room the cards leave, cut in two: the healthy liver's half on the left, the slide's patient's on the right. */
export function halveRoom(room: RoomPx): { twin: RoomPx; main: RoomPx } {
  const h = room.w / 2;
  return { twin: { x: room.x, y: room.y, w: h, h: room.h }, main: { x: room.x + h, y: room.y, w: h, h: room.h } };
}

/** Where the canvas is cut, as a share from the left: the middle of the free room. */
export function cutShare(room: RoomPx, stageWidth: number): number { return stageWidth > 0 ? Math.min(1, Math.max(0, (room.x + room.w / 2) / stageWidth)) : 0; }
