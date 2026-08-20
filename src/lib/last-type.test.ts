/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { lastType, rememberType, orderTypes } from './last-type';
import type { TournamentType } from './dto';

const TYPES: TournamentType[] = ['local', 'treasure_cup', 'regionals', 'extra_grand_battle', 'pirates_party', 'ranked_sim'];

beforeEach(() => window.localStorage.clear());

describe('the last type', () => {
  it('is null before anything is created', () => {
    expect(lastType('tournament')).toBeNull();
    expect(lastType('freeplay')).toBeNull();
  });

  it('remembers the most recent one', () => {
    rememberType('tournament', 'regionals');
    expect(lastType('tournament')).toBe('regionals');
    rememberType('tournament', 'local');
    expect(lastType('tournament')).toBe('local');
  });

  it('keeps the two segments apart', () => {
    // A Regional logged last week must not open the session form on Ranked
    // Simulator, and a gauntlet must not lead the tournament strip.
    rememberType('tournament', 'regionals');
    rememberType('freeplay', 'freeplay_gauntlet');
    expect(lastType('tournament')).toBe('regionals');
    expect(lastType('freeplay')).toBe('freeplay_gauntlet');
  });

  it('uses the crewstat- prefix the product fixes', () => {
    rememberType('tournament', 'local');
    rememberType('freeplay', 'freeplay_friend');
    expect(window.localStorage.getItem('crewstat-last-tournament-type')).toBe('local');
    expect(window.localStorage.getItem('crewstat-last-freeplay-type')).toBe('freeplay_friend');
  });
});

describe('orderTypes', () => {
  it('leaves the order alone when nothing is remembered', () => {
    expect(orderTypes(TYPES, null)).toEqual(TYPES);
  });

  it('leads with the remembered type, keeping the rest in order', () => {
    expect(orderTypes(TYPES, 'regionals'))
      .toEqual(['regionals', 'local', 'treasure_cup', 'extra_grand_battle', 'pirates_party', 'ranked_sim']);
  });

  it('is a no-op when the remembered type already leads', () => {
    expect(orderTypes(TYPES, 'local')).toEqual(TYPES);
  });

  it('ignores a type that is no longer offered', () => {
    // Testing was a tournament type until it moved to the freeplay segment; a
    // player who created one last must not get an empty lead chip.
    expect(orderTypes(TYPES, 'testing')).toEqual(TYPES);
    expect(orderTypes(TYPES, 'freeplay')).toEqual(TYPES);
    expect(orderTypes(TYPES, 'match')).toEqual(TYPES);
  });

  it('never drops or duplicates a type', () => {
    const out = orderTypes(TYPES, 'pirates_party');
    expect(out).toHaveLength(TYPES.length);
    expect(new Set(out).size).toBe(TYPES.length);
  });
});
