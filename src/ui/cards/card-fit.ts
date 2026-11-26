// The one rule for a card whose words are taller than the room it has: fit them (the card's `--pz-fit`, a zoom of its contents) down to the 12 px floor,
// then page; a card is never grown after it lands and never stands clipped. These are the numbers of the fit: the floor a zoom may not go under,
// and the zoom that brings a height to its room. Pure; tests/card-fit-rule.test.ts.
/** Lettering never goes under this on the screen (docs/approved/type.md). */
export const FLOOR_PX = 12;

/** The least zoom a card's contents may take, from the size of its body lettering at a zoom of 1: the zoom that brings it to 12 px.
 *  Body lettering already at or under 12 px cannot be zoomed down at all (1); a card with no body lettering to judge by (a table) keeps the half the 2D fit always used. */
export function floorOf(bodyPx: number): number {
  if (!(bodyPx > 0)) return 0.5;
  return bodyPx > FLOOR_PX ? Math.ceil((FLOOR_PX / bodyPx) * 1000) / 1000 : 1;
}

/** The zoom that brings a content of height `h` to a room of `room` px: 1 when it already fits (or nothing is known), never under the floor. A little
 *  under the exact ratio, because a zoomed text re-wraps. */
export function fitToRoom(h: number, room: number, bodyPx: number): number {
  if (!(h > 0) || !(room > 0) || h <= room) return 1;
  return Math.min(1, Math.max(floorOf(bodyPx), (room / h) * 0.985));
}

/** The words card's last resort: past its last page it still stands taller than its room, so its contents zoom to the room (down to the floor). Before
 *  the last page the words page, they never shrink first. */
export const wordsFitOf = (h: number, room: number, bodyPx: number, onLastPage: boolean): number => (onLastPage ? fitToRoom(h, room, bodyPx) : 1);
