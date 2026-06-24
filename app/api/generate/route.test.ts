import { describe, it, expect } from 'vitest';
import { resolvePlan } from './route';

describe('resolvePlan', () => {
  it('returns the oil fixture in mock mode', async () => {
    const plan = await resolvePlan({ selfie: 'x', team: 'Brazil' }, { mock: true });
    expect(plan.oilStrokes.length).toBeGreaterThan(0);
    expect(plan.strokePaths.length).toBeGreaterThan(2);
    expect((plan as unknown as Record<string, unknown>).shadingLayer).toBeUndefined();
  });
});
