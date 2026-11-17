// A small seeded random number generator (mulberry32): the same seed gives the same
// city, the same traffic and the same screenshot scenes, which is what makes the
// staged shots repeatable. Helpers on top keep the call sites readable. The
// newer helpers (gauss, weightedPick, angleLerp, seedFromString) let the city,
// traffic and combat ask for clustered, weighted or smoothly varying randomness
// without reaching for Math.random and breaking the seed.

export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A deterministic seed from any string, so a named city seed is shareable. */
export function seedFromString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A random number in [min, max). */
export function range(random, min, max) {
  return min + random() * (max - min);
}

/** A random integer in [min, max]. */
export function int(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

/** One random element of an array. */
export function pick(random, array) {
  return array[Math.floor(random() * array.length)];
}

/** One random element, weighted: entries are [value, weight] pairs. */
export function weightedPick(random, entries) {
  let total = 0;
  for (const [, w] of entries) total += w;
  let roll = random() * total;
  for (const [value, w] of entries) {
    roll -= w;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

/** Fisher-Yates shuffle, in place, driven by the seeded random. */
export function shuffle(random, array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = array[i];
    array[i] = array[j];
    array[j] = tmp;
  }
  return array;
}

/** Approximately normal value around `mean` with spread `spread` (Box-Muller). */
export function gauss(random, mean, spread) {
  const u = Math.max(random(), 1e-8);
  const v = random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
  return mean + z * spread;
}

/** Clamp a value into [min, max]. */
export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** Clamp a value into [0, 1]. */
export function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Linear interpolation between a and b. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Shortest-path interpolation between two angles. */
export function angleLerp(from, to, t) {
  return from + angleDiff(from, to) * clamp01(t);
}

/** True with probability p (0..1) on one draw of the seeded random. */
export function chance(random, p) {
  return random() < p;
}

/** Distance between two points. */
export function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

/** Shortest signed angle from `from` to `to`, in (-PI, PI]. */
export function angleDiff(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** A unit vector for an angle, as {x, y}. */
export function unit(angle) {
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

/** Rotate a vector by an angle, returning a fresh {x, y}. */
export function rotateVec(v, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}
