/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { lastTournamentType, rememberTournamentType, orderTypes } from './last-tournament-type';
import type { TournamentType } from './dto';

const TYPES: TournamentType[] = ['local', 'treasure_cup', 'regionals', 'extra_grand_battle', 'pirates_party', 'testing'];

beforeEach(() => window.localStorage.clear());

describe('the last tournament type', () => {
  it('is null before anything is created', () => {
    expect(lastTournamentType()).toBeNull();
  });

  it('remembers the most recent one', () => {
    rememberTournamentType('regionals');
    expect(lastTournamentType()).toBe('regionals');
    rememberTournamentType('testing');
    expect(lastTournamentType()).toBe('testing');
  });

  it('uses the crewstat- prefix the product fixes', () => {
    rememberTournamentType('local');
    expect(window.localStorage.getItem('crewstat-last-tournament-type')).toBe('local');
  });
});

describe('orderTypes', () => {
  it('leaves the order alone when nothing is remembered', () => {
    expect(orderTypes(TYPES, null)).toEqual(TYPES);
  });

  it('leads with the remembered type, keeping the rest in order', () => {
    expect(orderTypes(TYPES, 'regionals'))
      .toEqual(['regionals', 'local', 'treasure_cup', 'extra_grand_battle', 'pirates_party', 'testing']);
  });

  it('is a no-op when the remembered type already leads', () => {
    expect(orderTypes(TYPES, 'local')).toEqual(TYPES);
  });

  it('ignores a type that is no longer offered', () => {
    // Freeplay was a type until it moved to its own tab; a player who created
    // one last must not get an empty lead chip.
    expect(orderTypes(TYPES, 'freeplay')).toEqual(TYPES);
    expect(orderTypes(TYPES, 'match')).toEqual(TYPES);
  });

  it('never drops or duplicates a type', () => {
    const out = orderTypes(TYPES, 'pirates_party');
    expect(out).toHaveLength(TYPES.length);
    expect(new Set(out).size).toBe(TYPES.length);
  });
});
