/** Confidence intervals for win rates. */

/** 95% Wilson score interval for `score` wins out of `n` games. */
export function wilson(score: number, n: number, z = 1.96): [number, number] {
  if (!n) return [0, 1];
  const p = score / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(c - m) / d, (c + m) / d];
}
