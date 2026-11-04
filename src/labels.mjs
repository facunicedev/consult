// Fisher-Yates; rng is injectable so tests are deterministic.
export function shuffle(items, rng = Math.random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// The reader never gets its own answer: it is excluded before the draw.
export function drawOthers(reader, voices, rng = Math.random) {
  return shuffle(voices.filter((v) => v !== reader), rng);
}

export const letter = (i) => String.fromCharCode(65 + i);
