import { describe, it, expect } from 'vitest';
import { isFreeplay, FREEPLAY_TYPES, CASUAL_TYPES, TOURNAMENT_TYPES, MATCH_TYPE } from './tournament-kinds';

/*
 * Ranked Simulator is one kind of event with two stored values, because the
 * segment it was logged in — not its label — decides whether it counts. These
 * tests hold that split in place: the tournament one is competitive, the
 * freeplay one is not, and nothing else moved.
 */
describe('tournament kinds', () => {
  it('puts both freeplay flavours in the freeplay segment', () => {
    expect(isFreeplay('freeplay')).toBe(true);
    expect(isFreeplay('freeplay_sim')).toBe(true);
  });

  it('keeps every event type out of it', () => {
    for (const t of TOURNAMENT_TYPES) expect(isFreeplay(t)).toBe(false);
    expect(isFreeplay(MATCH_TYPE)).toBe(false);
  });

  it('counts a ranked simulator tournament as competitive', () => {
    // The whole point: the same games logged as an event count, and logged as
    // a session do not.
    expect(CASUAL_TYPES).not.toContain('ranked_sim');
    expect(CASUAL_TYPES).toContain('freeplay_sim');
  });

  it('offers the simulator when creating a tournament', () => {
    expect(TOURNAMENT_TYPES).toContain('ranked_sim');
    expect(TOURNAMENT_TYPES).not.toContain('freeplay');
    expect(TOURNAMENT_TYPES).not.toContain(MATCH_TYPE);
  });

  it('treats every casual type alike, freeplay and match both', () => {
    expect(CASUAL_TYPES).toEqual([...FREEPLAY_TYPES, MATCH_TYPE]);
  });
});
