import { describe, it, expect } from 'vitest';
import { resolvePlan } from './route';

describe('resolvePlan', () => {
  it('returns the fixture in mock mode', async () => {
    const plan = await resolvePlan({ selfie: 'x', team: 'Brazil' }, { mock: true });
    expect(plan.strokePaths.length).toBeGreaterThan(2);
  });
});
