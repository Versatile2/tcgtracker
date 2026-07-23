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
        kind: 'swiss',
        opponentLeaderId: 'y',
        result: 'win',
      })
    ).toThrow();
  });

  it('accepts an optional opponentMetaId on a swiss round', () => {
    const base = { kind: 'swiss' as const, opponentLeaderId: '00000000-0000-0000-0000-000000000000', result: 'win' as const };
    const parsed = createRoundSchema.parse(base);
    expect(parsed.kind === 'swiss' && parsed.opponentMetaId).toBeUndefined();
    const withMeta = createRoundSchema.parse({ ...base, opponentMetaId: '00000000-0000-0000-0000-000000000000' });
    expect(withMeta.kind === 'swiss' && withMeta.opponentMetaId).toBe('00000000-0000-0000-0000-000000000000');
  });

  it('rejects an incomplete Top Cut game log and accepts a valid one', () => {
    const opp = '00000000-0000-0000-0000-000000000000';
    expect(() => createRoundSchema.parse({ kind: 'top_cut', opponentLeaderId: opp, games: [{ result: 'win' }] })).toThrow();
    expect(() => createRoundSchema.parse({ kind: 'top_cut', opponentLeaderId: opp, games: [{ result: 'win' }, { result: 'win' }] })).not.toThrow();
  });

  it('accepts BYE / No Show without an opponent', () => {
    expect(createRoundSchema.parse({ kind: 'bye' }).kind).toBe('bye');
    expect(createRoundSchema.parse({ kind: 'no_show' }).kind).toBe('no_show');
  });

  it('defaults custom leader colors to empty array', () => {
    expect(customLeaderSchema.parse({ name: 'Test' }).colors).toEqual([]);
  });

  it('accepts a setCode on a custom leader', () => {
    expect(customLeaderSchema.parse({ name: 'Test', setCode: 'OP16' }).setCode).toBe('OP16');
  });

  it('accepts wonDieRoll on a swiss round', () => {
    const p = createRoundSchema.parse({ kind: 'swiss', opponentLeaderId: '00000000-0000-0000-0000-000000000000', result: 'win', wonDieRoll: true });
    expect(p.kind === 'swiss' && p.wonDieRoll).toBe(true);
  });
});
