// Words that never part across two lines (2D glue.js `nb`): a number and its unit ("8.1 mmHg"), a range's words ("5 to 8 mmHg") and the dash inside a name ("Budd–Chiari").
// Same text as 2D's; tests/line-rich.test.ts compares the two when a 2D checkout at the pin is at hand.
const UNIT = String.raw`(?:mmHg|mL\/min|L\/min|g\/dL|mg\/dL|kPa|cm\/s|cm|mm|mL|[µμ]L|\/[µμ]L|kg|g|L|%|points?|hours?|days?|weeks?|months?|years?)(?![\p{L}\d])`;
const RANGE = new RegExp(String.raw`(\d) (to|or|and) (?=\d[\d.,]*[  ]?${UNIT})`, 'gu');
const UNIT_GAP = new RegExp(String.raw`(\d) (?=${UNIT})`, 'gu');
export const nb = (t: string | null | undefined): string => (t || '').replace(/(\p{L})–(\p{L})/gu, '$1–⁠$2').replace(RANGE, '$1 $2 ').replace(UNIT_GAP, '$1 ');
