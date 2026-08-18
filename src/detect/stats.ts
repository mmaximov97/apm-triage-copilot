/**
 * Abramowitz & Stegun 7.1.26 approximation of the error function.
 * Absolute error < 1.5e-7, which is far tighter than the p-value
 * thresholds this project compares against.
 */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const poly =
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
    t;
  return sign * (1 - poly * Math.exp(-ax * ax));
}

export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

const EPS = 1e-6;

/**
 * One-sample z-test for a proportion against a known baseline rate.
 * Returns the lower-tail p-value: the probability of observing a success
 * rate this low or lower if the true rate were still `baseline`.
 *
 * A two-sample test would be wrong here: the baseline arrives as a known
 * rate with no sample size of its own, and inventing one would be dishonest.
 */
export function proportionZTest(
  successes: number,
  attempts: number,
  baseline: number,
): { observed: number; z: number; pValue: number } {
  if (attempts <= 0) return { observed: 0, z: 0, pValue: 1 };
  const observed = successes / attempts;
  const p0 = Math.min(Math.max(baseline, EPS), 1 - EPS);
  const se = Math.sqrt((p0 * (1 - p0)) / attempts);
  const z = (observed - p0) / se;
  return { observed, z, pValue: normalCdf(z) };
}
