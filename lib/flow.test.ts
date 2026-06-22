import { describe, it, expect } from 'vitest';
import { nextStep } from './flow';

describe('nextStep', () => {
  it('advances through the flow in order', () => {
    expect(nextStep('start')).toBe('input');
    expect(nextStep('input')).toBe('vibe');
    expect(nextStep('vibe')).toBe('preparing');
    expect(nextStep('preparing')).toBe('performance');
    expect(nextStep('performance')).toBe('result');
  });

  it('stays on result at the end', () => {
    expect(nextStep('result')).toBe('result');
  });
});
