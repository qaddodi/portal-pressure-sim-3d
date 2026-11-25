// The scope disc's side on a slide's card: the room the card leaves the instrument, less what stands round the disc (the readings, the Band button, EUS-PPG and the label under it), held between
// a disc still worth looking at and the size the slide asked for. Pure. The label under the disc is part of the stage, so `rest` is the pane's height less the stage's, plus the label.
export const DISC_MIN = 120;
export function discSquare(room: number, rest: number, asked: number, label = 22): number {
  if (!(room > 0)) return asked;
  return Math.round(Math.max(DISC_MIN, Math.min(asked, room - rest - label)));
}
