// A phone on its side holds one column of cards, a taller one never shrinks or scrolls (docs/approved/landscape-phone.md). A summary table or chart is 2D's one centred panel (title, line and the
// table in ONE card), which on a 390 px screen is far taller than the column's room: it was clipped at the foot and the © line stood on the table (capture 4fb2f869: Lobule 10, Gradients 13,
// Where is the resistance? 12, Lowering pressure 9). On a screen like that the panel is the pair every other slide with an instrument is: the words card, the table or chart under it (the swipe).
import type { View } from '../deck/presenter-machine.ts';

export function phoneView(v: View, sideways: boolean, data: 'ladder' | 'table' | null | undefined): View {
  return sideways && v.words === 'visual' && data ? { ...v, words: 'teach', data } : v;
}
