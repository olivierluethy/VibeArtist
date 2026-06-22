import { describe, it, expect } from 'vitest';
import { generateDrawingPlan } from './generationService';
import { buildPrompt, type PortraitEngine } from './portraitEngine';
import { extractPathData } from './lineart';

const fakeEngine: PortraitEngine = {
  async generate() {
    // 1x1 transparent png; potrace yields zero or more paths — fine for the test.
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    return { colorImage: 'color.png', lineArtImage: png, width: 400, height: 500 };
  },
};

describe('generationService', () => {
  it('builds a drawing plan from engine output', async () => {
    const plan = await generateDrawingPlan({ selfie: 'x', team: 'Brazil' }, fakeEngine);
    expect(plan.width).toBe(400);
    expect(plan.colorImage).toBe('color.png');
    expect(Array.isArray(plan.strokePaths)).toBe(true);
    expect(plan.timing.accelerate).toBe(true);
  });

  it('buildPrompt includes team and player', () => {
    expect(buildPrompt({ selfie: 'x', team: 'Brazil', player: 'Neymar' })).toContain('Brazil');
    expect(buildPrompt({ selfie: 'x', team: 'Brazil', player: 'Neymar' })).toContain('Neymar');
  });

  it('extractPathData pulls d attributes from svg', () => {
    expect(extractPathData('<svg><path d="M0 0 L1 1"/></svg>')).toEqual(['M0 0 L1 1']);
  });
});
