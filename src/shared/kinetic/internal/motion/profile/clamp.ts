/** Local copy by design: the motion library imports only React and itself
 * (copy-portability contract, see README) — a three-line clamp is the
 * sanctioned kind of duplication. */
export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);
