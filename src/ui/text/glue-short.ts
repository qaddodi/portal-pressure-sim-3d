// A one-letter word ("A", "a", "I") never ends a line: it stands with the word after it. A centred case card's lines broke "...spironolactone and furosemide. A / surveillance EGD shows..." (iPhone, audit af1c51a0,
// Treatment 2): the article hung at the end of a line and its noun began the next. Plain text in, plain text out (a no-break space joins the two); nb() in glue.ts is the 2D app's own and stays as it is.
export const glueShort = (t: string | null | undefined): string => (t || '').replace(/(^|[\s(])([AaI]) (?=[\p{L}\d])/gu, '$1$2 ');
