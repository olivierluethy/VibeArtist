import { describe, it, expect } from 'vitest';
import { shareText } from './share';

describe('shareText', () => {
  it('mentions the team', () => {
    expect(shareText({ team: 'Brazil' })).toContain('Brazil');
  });
  it('mentions the player when present', () => {
    expect(shareText({ team: 'Brazil', player: 'Neymar' })).toContain('Neymar');
  });
});
