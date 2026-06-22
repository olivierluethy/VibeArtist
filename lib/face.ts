/** Cheap heuristic: is a meaningful share of pixels skin-toned? */
export function hasFace(image: ImageData): boolean {
  const { data } = image;
  let skin = 0;
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    total++;
    if (
      r > 95 && g > 40 && b > 20 &&
      r > g && r > b &&
      Math.max(r, g, b) - Math.min(r, g, b) > 15 &&
      Math.abs(r - g) > 15
    ) {
      skin++;
    }
  }
  return total > 0 && skin / total > 0.15;
}
