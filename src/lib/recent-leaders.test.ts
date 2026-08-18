/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { recentLeaders, pushRecentLeader, RECENT_LIMIT } from './recent-leaders';

beforeEach(() => window.localStorage.clear());

describe('recent leaders', () => {
  it('starts empty', () => {
    expect(recentLeaders('my-deck')).toEqual([]);
  });

  it('remembers what was picked, most recent first', () => {
    pushRecentLeader('my-deck', 'a');
    pushRecentLeader('my-deck', 'b');
    expect(recentLeaders('my-deck')).toEqual(['b', 'a']);
  });

  it('moves a repeat pick to the front rather than duplicating it', () => {
    ['a', 'b', 'c'].forEach((id) => pushRecentLeader('my-deck', id));
    pushRecentLeader('my-deck', 'a');
    expect(recentLeaders('my-deck')).toEqual(['a', 'c', 'b']);
  });

  it('caps the list, dropping the oldest', () => {
    for (let i = 0; i < RECENT_LIMIT + 4; i += 1) pushRecentLeader('my-deck', `id-${i}`);
    const out = recentLeaders('my-deck');
    expect(out).toHaveLength(RECENT_LIMIT);
    expect(out[0]).toBe(`id-${RECENT_LIMIT + 3}`);
    expect(out).not.toContain('id-0');
  });

  it('keeps the two pickers apart', () => {
    // Choosing an opponent must never reorder your own decks.
    pushRecentLeader('my-deck', 'mine');
    pushRecentLeader('opponent', 'theirs');
    expect(recentLeaders('my-deck')).toEqual(['mine']);
    expect(recentLeaders('opponent')).toEqual(['theirs']);
  });

  it('remembers nothing without a role', () => {
    expect(pushRecentLeader(undefined, 'a')).toEqual([]);
    expect(recentLeaders(undefined)).toEqual([]);
  });

  it('uses the crewstat- prefix the product fixes', () => {
    pushRecentLeader('my-deck', 'a');
    expect(window.localStorage.getItem('crewstat-recent-leaders-my-deck')).toBe('["a"]');
  });

  it('survives junk in storage rather than throwing', () => {
    window.localStorage.setItem('crewstat-recent-leaders-my-deck', 'not json');
    expect(recentLeaders('my-deck')).toEqual([]);
    window.localStorage.setItem('crewstat-recent-leaders-my-deck', '{"nope":1}');
    expect(recentLeaders('my-deck')).toEqual([]);
    window.localStorage.setItem('crewstat-recent-leaders-my-deck', '["a",5,null,"b"]');
    expect(recentLeaders('my-deck')).toEqual(['a', 'b']);
  });
});
