// Seeded random numbers, so a screenshot scene and a replayed world come out the
// same every time. Mulberry32 is small, fast and good enough for a city.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(rng, min, max) {
  return min + rng() * (max - min);
}

/** A whole number in [min, max), for counts and indexes. */
export function int(rng, min, max) {
  return min + Math.floor(rng() * (max - min));
}

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

export function pickIndex(rng, count) {
  return Math.floor(rng() * count);
}

export function chance(rng, p) {
  return rng() < p;
}

export function shuffle(rng, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
  }
  return out;
}
