import type { OilDrawingPlan, OilStroke } from './oilTypes';

const W = 400;
const H = 500;

const svgDataUri = (svg: string) => 'data:image/svg+xml,' + encodeURIComponent(svg);

// A deterministic pseudo-random in [0,1) from an integer seed (so the fixture is stable).
const rnd = (i: number) => { const x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); };

// Colour zones of the synthetic portrait, returned for a sampled (x,y).
function zoneColor(x: number, y: number): string {
  if (y > 330) return '#d4202a';                       // jersey (red)
  if (x > 120 && x < 280 && y > 110 && y < 300) return '#f1c79b'; // face (skin)
  return '#0b3d91';                                    // backdrop (blue)
}
// Crude "form" angle so block-in strokes wrap rather than all run flat.
const formAngle = (x: number) => -0.4 + (x / W) * 0.8;

function gridLayer(layer: number, step: number, width: number, length: number, gate: (x: number, y: number) => boolean): OilStroke[] {
  const out: OilStroke[] = [];
  let i = layer * 1000;
  for (let y = step / 2; y < H; y += step) {
    for (let x = step / 2; x < W; x += step) {
      if (!gate(x, y)) continue;
      const jx = (rnd(i++) - 0.5) * step * 0.6;
      const jy = (rnd(i++) - 0.5) * step * 0.6;
      out.push({ x: x + jx, y: y + jy, angle: formAngle(x), length, width, color: zoneColor(x, y), layer });
    }
  }
  return out;
}

const inFace = (x: number, y: number) => x > 120 && x < 280 && y > 110 && y < 300;
const inEyesMouth = (x: number, y: number) => (y > 185 && y < 215) || (y > 255 && y < 280);

function buildStrokes(): OilStroke[] {
  return [
    ...gridLayer(0, 34, 30, 30, () => true),                 // block-in everywhere (big)
    ...gridLayer(1, 22, 18, 20, () => true),                 // forms (medium)
    ...gridLayer(2, 14, 10, 12, (x, y) => inFace(x, y) || y > 330), // detail on face + jersey
    ...gridLayer(3, 9, 6, 8, (x, y) => inFace(x, y)),         // fine on face
    ...gridLayer(4, 5, 4, 5, inEyesMouth),                   // DEDICATED eyes/mouth pass
    // accents: dark strokes around feature lines (layer 5)
    ...gridLayer(5, 7, 5, 7, (x, y) => inEyesMouth(x, y)).map((s) => ({ ...s, color: '#241c16' })),
  ];
}

const colorSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#0b3d91"/>
  <path d="M120 170 C120 100 280 100 280 170 C280 250 240 300 200 300 C160 300 120 250 120 170 Z" fill="#f1c79b"/>
  <path d="M110 330 L160 380 L200 360 L240 380 L290 330 L290 500 L110 500 Z" fill="#d4202a"/>
</svg>`;

const STROKE_PATHS = [
  { d: 'M120 170 C120 100 280 100 280 170 C280 250 240 300 200 300 C160 300 120 250 120 170 Z' },
  { d: 'M160 200 a12 8 0 1 0 0.1 0 Z' },
  { d: 'M230 200 a12 8 0 1 0 0.1 0 Z' },
  { d: 'M170 265 q30 22 60 0' },
];

export const OIL_FIXTURE: OilDrawingPlan = {
  width: W,
  height: H,
  strokePaths: STROKE_PATHS,
  oilStrokes: buildStrokes(),
  colorImage: svgDataUri(colorSvg),
  timing: { outlineMs: 3000, blockInMs: 5000, refineMs: 11000, accentMs: 3000, photoGlaze: 0 },
};
