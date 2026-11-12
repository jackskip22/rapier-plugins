export type Look = 'screenshot' | 'photo';

/**
 * Screenshots, diagrams and interface pictures use few colors and repeat them, and neighboring pixels are
 * the same or very different. In a photograph neighbors differ a little (sensor noise, texture), almost everywhere.
 * Two tests, either of which says photograph:
 *  - colors: over 12% of about 65,000 sampled pixels are distinct colors, and the 32 commonest cover under 60%;
 *  - texture: over 35% of horizontally neighboring pixels differ by 1 to 6 levels (measured: photographs 0.6 to 0.8,
 *    screenshots and diagrams under 0.01, an icon with a soft shadow 0.2).
 * The texture test also catches small photographs and sharp phone photographs, whose colors repeat locally.
 */
export function classify(data: Uint8Array, width: number, height: number): {look: Look; distinct: number; top: number; soft: number} {
  const total = width * height;
  const step = Math.max(1, Math.floor(Math.sqrt(total / 65536)));
  const counts = new Map<number, number>();
  let n = 0;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const key = ((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]) >>> 0;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      n++;
    }
  }
  const sorted = [...counts.values()].sort((a, b) => b - a);
  let top = 0;
  for (let i = 0; i < Math.min(32, sorted.length); i++) top += sorted[i];
  const distinct = counts.size / n;
  const topShare = top / n;
  // Texture: whole rows, at most about 500,000 neighbor pairs.
  const rowStep = Math.max(1, Math.floor((width * height) / 500_000));
  let soft = 0, pairs = 0;
  for (let y = 0; y < height; y += rowStep) {
    for (let x = 0; x + 1 < width; x++) {
      const i = (y * width + x) * 4;
      const m = Math.max(Math.abs(data[i] - data[i + 4]), Math.abs(data[i + 1] - data[i + 5]), Math.abs(data[i + 2] - data[i + 6]));
      pairs++;
      if (m > 0 && m <= 6) soft++;
    }
  }
  const texture = pairs ? soft / pairs : 0;
  const photo = (distinct > 0.12 && topShare < 0.6) || texture > 0.35;
  return {look: photo ? 'photo' : 'screenshot', distinct, top: topShare, soft: texture};
}
