import { describe, it, expect } from 'vitest';
import { createTournamentSchema } from './tournament';
import { createRoundSchema } from './round';
import { customLeaderSchema } from './reference';

describe('validation', () => {
  it('accepts a valid tournament', () => {
    const parsed = createTournamentSchema.parse({
      type: 'local',
      playedOn: '2026-07-20',
    });
    expect(parsed.type).toBe('local');
  });

  it('rejects a bad date', () => {
    expect(() =>
      createTournamentSchema.parse({
        type: 'local',
        playedOn: '20-07-2026',
      })
    ).toThrow();
  });

  it('rejects an unknown tournament type', () => {
    expect(() =>
      createTournamentSchema.parse({
        type: 'worlds',
        playedOn: '2026-07-20',
      })
    ).toThrow();
  });

  it('requires uuids on a round', () => {
    expect(() =>
      createRoundSchema.parse({
        myLeaderId: 'x',
        opponentLeaderId: 'y',
        result: 'win',
      })
    ).toThrow();
  });

  it('defaults custom leader colors to empty array', () => {
    expect(customLeaderSchema.parse({ name: 'Test' }).colors).toEqual([]);
  });
});
