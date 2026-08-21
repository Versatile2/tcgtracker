import { describe, it, expect } from 'vitest';
import { isSession, SESSION_TYPES, CASUAL_TYPES, TOURNAMENT_TYPES, MATCH_TYPE } from './tournament-kinds';
import { tournamentType } from '../db/schema';
import type { TournamentType } from './dto';

/*
 * Ranked Simulator is one kind of event with two stored values, because the
 * segment it was logged in — not its label — decides whether it counts. These
 * tests hold that split in place: the tournament one is competitive, the
 * session one is not.
 *
 * Testing holds the opposite lesson: one stored value can change segment
 * outright. It was a tournament type only because session used to be a
 * single option, forcing a deck-testing night to declare a leader it never
 * needed. These tests also hold its move into the session segment in place.
 */
describe('tournament kinds', () => {
  it('puts both session flavours in the session segment', () => {
    expect(isSession('session')).toBe(true);
    expect(isSession('session_sim')).toBe(true);
  });

  it('keeps every event type out of it', () => {
    for (const t of TOURNAMENT_TYPES) expect(isSession(t)).toBe(false);
    expect(isSession(MATCH_TYPE)).toBe(false);
  });

  it('counts a ranked simulator tournament as competitive', () => {
    // The whole point: the same games logged as an event count, and logged as
    // a session do not.
    expect(CASUAL_TYPES).not.toContain('ranked_sim');
    expect(CASUAL_TYPES).toContain('session_sim');
  });

  it('offers the simulator when creating a tournament', () => {
    expect(TOURNAMENT_TYPES).toContain('ranked_sim');
    expect(TOURNAMENT_TYPES).not.toContain('session');
    expect(TOURNAMENT_TYPES).not.toContain(MATCH_TYPE);
  });

  it('treats every casual type alike, session and match both', () => {
    expect(CASUAL_TYPES).toEqual([...SESSION_TYPES, MATCH_TYPE]);
  });

  it('puts every new session flavour in the session segment', () => {
    const added: TournamentType[] = [
      'session_sim_casual', 'session_friend', 'session_locals', 'session_gauntlet', 'session_teaching',
    ];
    for (const t of added) {
      expect(isSession(t)).toBe(true);
      expect(CASUAL_TYPES).toContain(t);
      expect(TOURNAMENT_TYPES).not.toContain(t);
    }
  });

  it('moves testing out of the competitive record', () => {
    // Testing was always testing; the tournament segment only ever gave it a
    // leader it did not need.
    expect(isSession('testing')).toBe(true);
    expect(CASUAL_TYPES).toContain('testing');
    expect(TOURNAMENT_TYPES).not.toContain('testing');
  });

  it('offers the session strip in the order the product fixes', () => {
    expect(SESSION_TYPES).toEqual([
      'session', 'session_sim', 'session_sim_casual', 'session_friend',
      'session_locals', 'session_gauntlet', 'testing', 'session_teaching',
    ]);
  });

  // TOURNAMENT_TYPES and SESSION_TYPES are what every type strip and filter
  // row actually renders from — the TournamentType union, the Zod enum and the
  // two label Records can all agree on a value and it would still never appear
  // in a picker if nobody had also added it to one of these two arrays. The
  // type-glyph test cannot catch that: it iterates these same arrays, so a type
  // missing from both is missing from its own check too. The database enum is
  // the one declaration site independent of these lists, so it is the source
  // of truth this partition is checked against.
  it('partitions every stored type between the two segments and match', () => {
    const partition = [...TOURNAMENT_TYPES, ...SESSION_TYPES, MATCH_TYPE].sort();
    const stored = [...tournamentType.enumValues].sort();
    expect(partition).toEqual(stored);
  });
});
