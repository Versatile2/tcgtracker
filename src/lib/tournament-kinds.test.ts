import { describe, it, expect } from 'vitest';
import { isFreeplay, FREEPLAY_TYPES, CASUAL_TYPES, TOURNAMENT_TYPES, MATCH_TYPE } from './tournament-kinds';
import { tournamentType } from '../db/schema';
import type { TournamentType } from './dto';

/*
 * Ranked Simulator is one kind of event with two stored values, because the
 * segment it was logged in — not its label — decides whether it counts. These
 * tests hold that split in place: the tournament one is competitive, the
 * freeplay one is not.
 *
 * Testing holds the opposite lesson: one stored value can change segment
 * outright. It was a tournament type only because freeplay used to be a
 * single option, forcing a deck-testing night to declare a leader it never
 * needed. These tests also hold its move into the freeplay segment in place.
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

  it('puts every new session flavour in the freeplay segment', () => {
    const added: TournamentType[] = [
      'freeplay_sim_casual', 'freeplay_friend', 'freeplay_locals', 'freeplay_gauntlet', 'freeplay_teaching',
    ];
    for (const t of added) {
      expect(isFreeplay(t)).toBe(true);
      expect(CASUAL_TYPES).toContain(t);
      expect(TOURNAMENT_TYPES).not.toContain(t);
    }
  });

  it('moves testing out of the competitive record', () => {
    // Testing was always testing; the tournament segment only ever gave it a
    // leader it did not need.
    expect(isFreeplay('testing')).toBe(true);
    expect(CASUAL_TYPES).toContain('testing');
    expect(TOURNAMENT_TYPES).not.toContain('testing');
  });

  it('offers the freeplay strip in the order the product fixes', () => {
    expect(FREEPLAY_TYPES).toEqual([
      'freeplay', 'freeplay_sim', 'freeplay_sim_casual', 'freeplay_friend',
      'freeplay_locals', 'freeplay_gauntlet', 'testing', 'freeplay_teaching',
    ]);
  });

  // TOURNAMENT_TYPES and FREEPLAY_TYPES are what every type strip and filter
  // row actually renders from — the TournamentType union, the Zod enum and the
  // two label Records can all agree on a value and it would still never appear
  // in a picker if nobody had also added it to one of these two arrays. The
  // type-glyph test cannot catch that: it iterates these same arrays, so a type
  // missing from both is missing from its own check too. The database enum is
  // the one declaration site independent of these lists, so it is the source
  // of truth this partition is checked against.
  it('partitions every stored type between the two segments and match', () => {
    const partition = [...TOURNAMENT_TYPES, ...FREEPLAY_TYPES, MATCH_TYPE].sort();
    const stored = [...tournamentType.enumValues].sort();
    expect(partition).toEqual(stored);
  });
});
