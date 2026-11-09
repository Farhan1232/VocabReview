/**
 * Review frequency setting (client request, 5 Nov): FSRS's own desired retention, shown to the teacher
 * as how much the gaps between reviews change compared with the default.
 */

/** The FSRS library default. */
export const DEFAULT_RETENTION = 0.9;
/** The range FSRS's authors recommend; outside it reviews become wasteful or words are mostly forgotten. */
export const MIN_RETENTION = 0.7;
export const MAX_RETENTION = 0.97;

/** Decay in the default FSRS-6 parameters, used only for this estimate. The schedule itself comes from the library. */
const DECAY = 0.1542;

/** How long the gap between reviews becomes compared with the default: 2 means twice as long. */
export function intervalScale(retention: number): number {
  const gap = (r: number) => r ** (-1 / DECAY) - 1;
  return gap(retention) / gap(DEFAULT_RETENTION);
}

/** Plain-language effect of a retention value, e.g. "Gaps between reviews about 2.5× shorter than the default". */
export function describeRetention(retention: number): string {
  if (Math.abs(retention - DEFAULT_RETENTION) < 0.001) return 'The FSRS default.';
  const scale = intervalScale(retention);
  const factor = (scale < 1 ? 1 / scale : scale).toFixed(1);
  return scale < 1
    ? `Words come back more often: gaps between reviews about ${factor}× shorter than the default.`
    : `Words come back less often: gaps between reviews about ${factor}× longer than the default.`;
}
