// The height a card is SEEN at. A card that grows or shrinks takes its new layout height at once and is revealed (or clipped) to it by a clip-path glide on the compositor (CardFrame.tsx
// `reveal` / `sink`), so its layout box jumps while what is drawn eases. The recorder read the layout box, and card-size-snap called every glide a snap (audit v2: 158 to 732 px, 573 to 401 px,
// 328 to 304 px in one frame). The box the viewer sees is the layout box less the clip-path's inset on each side.

/** The inset of a computed `clip-path: inset(...)` as [top, right, bottom, left] px (CSS 1 to 4 value shorthand, `round` ignored); zeros for anything else. */
export function clipInset(clipPath: string | null | undefined): [number, number, number, number] {
  const m = /inset\(([^)]*)\)/.exec(clipPath ?? '');
  if (!m) return [0, 0, 0, 0];
  const v = m[1]!.split(/\s+round\s+/)[0]!.trim().split(/\s+/).map((x) => parseFloat(x));
  if (!v.length || v.some((n) => !Number.isFinite(n))) return [0, 0, 0, 0];
  const [t, r = t, b = t, l = r] = v as [number, number?, number?, number?];
  return [t, r!, b!, l!];
}

/** [top, height] of what is drawn: the layout box less the clip's top and bottom insets. */
export function visibleSpan(top: number, height: number, clipPath: string | null | undefined): [number, number] {
  const [t, , b] = clipInset(clipPath);
  return [top + t, Math.max(0, height - t - b)];
}
