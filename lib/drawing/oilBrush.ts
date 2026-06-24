import type { OilStroke } from './oilTypes';

const clamp8 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

function parseHex(c: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return [136, 136, 136];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgb = (r: number, g: number, b: number) => `rgb(${r},${g},${b})`;
const mix = (c: number, t: number, a: number) => clamp8(c + (t - c) * a);

/** Bristle tracks: many for fat early brushes, 1–3 for fine late layers. */
export function bristleCount(s: OilStroke): number {
  const base = Math.round(s.width / 3);
  if (s.layer >= 4) return 1;
  if (s.layer >= 2) return Math.max(1, Math.min(base, 3));
  return Math.max(2, base);
}

export function paintOilStroke(ctx: CanvasRenderingContext2D, s: OilStroke): void {
  const [r, g, b] = parseHex(s.color);
  const dx = Math.cos(s.angle), dy = Math.sin(s.angle);
  const n = bristleCount(s);
  const half = s.length / 2;
  ctx.lineCap = 'round';
  for (let k = 0; k < n; k++) {
    const u = n === 1 ? 0 : k / (n - 1) - 0.5;        // -0.5..0.5 across the brush
    const off = u * s.width;
    const ox = -dy * off, oy = dx * off;
    const shadeA = Math.abs(u) * 0.6;                  // light→dark furrows
    const tint = u > 0 ? 255 : 0;
    ctx.strokeStyle = rgb(mix(r, tint, shadeA), mix(g, tint, shadeA), mix(b, tint, shadeA));
    ctx.lineWidth = Math.max(1, (s.width / n) * 1.3);
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.moveTo(s.x - dx * half + ox, s.y - dy * half + oy);
    ctx.lineTo(s.x + dx * half + ox, s.y + dy * half + oy);
    ctx.stroke();
  }
  // Impasto highlight ridge.
  ctx.strokeStyle = rgb(mix(r, 255, 0.45), mix(g, 255, 0.45), mix(b, 255, 0.45));
  ctx.lineWidth = Math.max(0.8, s.width / 4);
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(s.x - dx * half * 0.4, s.y - dy * half * 0.4);
  ctx.lineTo(s.x + dx * half * 0.4, s.y + dy * half * 0.4);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Toned canvas ground + faint weave, drawn once under the painting. */
export function paintGround(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#c9bfae';
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = '#7d705c';
  ctx.lineWidth = 1;
  for (let i = 0; i < w; i += 4) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke(); }
  for (let j = 0; j < h; j += 4) { ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(w, j); ctx.stroke(); }
  ctx.globalAlpha = 1;
}
