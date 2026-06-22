import { describe, it, expect } from 'vitest';
import { TEAMS, findTeam } from './teams';

describe('teams', () => {
  it('exposes several teams each with players', () => {
    expect(TEAMS.length).toBeGreaterThanOrEqual(4);
    for (const t of TEAMS) expect(t.players.length).toBeGreaterThan(0);
  });
  it('looks up a team by id', () => {
    expect(findTeam('brazil')?.name).toBe('Brazil');
    expect(findTeam('nope')).toBeUndefined();
  });
});
