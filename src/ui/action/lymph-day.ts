// The lymph's one printed form: mL a day, rounded to 10 (2D lymph-day.js: one rounding for the fluid balance card, the lobule's labels and the lobule card).
/** A rate in mL/min as mL a day, to the nearest 10 (never below 0). */
export const lymphDay = (mlMin: number): number => Math.round((Math.max(0, mlMin) * 1440) / 10) * 10;
/** The same with its thousands comma ("3,170"). */
export const lymphText = (mlMin: number): string => lymphDay(mlMin).toLocaleString('en-US');
/** The unit every lymph reading is printed in. */
export const LYMPH_UNIT = 'mL/day';
