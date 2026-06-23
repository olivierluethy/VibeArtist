import type { DrawingPlan, StrokePath } from './types';

export function svgDataUri(svg: string): string {
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

const W = 400;
const H = 500;

// Simple stylized face outline, drawn stroke by stroke (head, eyes, nose, mouth, jersey collar).
const STROKES: StrokePath[] = [
  { d: 'M120 170 C120 100 280 100 280 170 C280 250 240 300 200 300 C160 300 120 250 120 170 Z' }, // head
  { d: 'M150 180 q20 -15 40 0' }, // left eyebrow
  { d: 'M210 180 q20 -15 40 0' }, // right eyebrow
  { d: 'M160 200 a12 8 0 1 0 0.1 0 Z' }, // left eye
  { d: 'M230 200 a12 8 0 1 0 0.1 0 Z' }, // right eye
  { d: 'M200 210 L195 245 q5 8 12 0' }, // nose
  { d: 'M170 265 q30 22 60 0' }, // mouth
  { d: 'M120 320 L160 360 L200 345 L240 360 L280 320' }, // jersey collar
];

const colorSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#0b3d91"/>
  <path d="M120 170 C120 100 280 100 280 170 C280 250 240 300 200 300 C160 300 120 250 120 170 Z" fill="#f1c79b"/>
  <circle cx="166" cy="202" r="6" fill="#3a2a1a"/>
  <circle cx="236" cy="202" r="6" fill="#3a2a1a"/>
  <path d="M170 265 q30 22 60 0" fill="none" stroke="#a23b2e" stroke-width="4"/>
  <path d="M110 330 L160 380 L200 360 L240 380 L290 330 L290 500 L110 500 Z" fill="#d4202a"/>
  <text x="200" y="455" font-size="40" fill="#ffd700" text-anchor="middle" font-family="Georgia">10</text>
</svg>`;

const shadingSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#efe9dd"/>
  <path d="M120 170 C120 100 280 100 280 170 C280 250 240 300 200 300 C160 300 120 250 120 170 Z" fill="#cfc6b6"/>
  <path d="M110 330 L160 380 L200 360 L240 380 L290 330 L290 500 L110 500 Z" fill="#b9b0a0"/>
</svg>`;

export const WORLD_CUP_FIXTURE: DrawingPlan = {
  width: W,
  height: H,
  strokePaths: STROKES,
  shadingLayer: svgDataUri(shadingSvg),
  colorImage: svgDataUri(colorSvg),
  timing: { outlineMs: 18000, shadeMs: 4000, colorMs: 14000, accelerate: true },
};
