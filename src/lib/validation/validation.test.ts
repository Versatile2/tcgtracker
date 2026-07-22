import { describe, it, expect } from 'vitest';
import { createTournamentSchema } from './tournament';
import { createRoundSchema } from './round';
import { customLeaderSchema } from './reference';

const VALID_UUID = '00000000-0000-0000-0000-000000000000';

describe('validation', () => {
  it('accepts a valid tournament', () => {
    const parsed = createTournamentSchema.parse({
      type: 'local',
      myLeaderId: VALID_UUID,
      playedOn: '2026-07-20',
    });
    expect(parsed.type).toBe('local');
  });

  it('rejects a bad date', () => {
    expect(() =>
      createTournamentSchema.parse({
        type: 'local',
        myLeaderId: VALID_UUID,
        playedOn: '20-07-2026',
      })
    ).toThrow();
  });

  it('rejects an unknown tournament type', () => {
    expect(() =>
      createTournamentSchema.parse({
        type: 'worlds',
        myLeaderId: VALID_UUID,
        playedOn: '2026-07-20',
      })
    ).toThrow();
  });

  it('rejects a tournament missing myLeaderId', () => {
    expect(() =>
      createTournamentSchema.parse({
        type: 'local',
        playedOn: '2026-07-20',
      })
    ).toThrow();
  });

  it('accepts a tournament without a metaId', () => {
    const parsed = createTournamentSchema.parse({
      type: 'local',
      myLeaderId: VALID_UUID,
      playedOn: '2026-07-20',
    });
    expect(parsed.metaId).toBeUndefined();
  });

  it('requires uuids on a round', () => {
    expect(() =>
      createRoundSchema.parse({
        opponentLeaderId: 'y',
        result: 'win',
      })
    ).toThrow();
  });

  it('accepts an optional opponentMetaId on a round', () => {
    const base = { opponentLeaderId: '00000000-0000-0000-0000-000000000000', result: 'win' as const };
    expect(createRoundSchema.parse(base).opponentMetaId).toBeUndefined();
    const withMeta = createRoundSchema.parse({ ...base, opponentMetaId: '00000000-0000-0000-0000-000000000000' });
    expect(withMeta.opponentMetaId).toBe('00000000-0000-0000-0000-000000000000');
  });

  it('defaults custom leader colors to empty array', () => {
    expect(customLeaderSchema.parse({ name: 'Test' }).colors).toEqual([]);
  });
});
