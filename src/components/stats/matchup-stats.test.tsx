/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MatchupStats } from './matchup-stats';
import type { LeaderDTO, TournamentSummaryDTO } from '@/lib/dto';

afterEach(cleanup);

const ZORO = '11111111-1111-4111-8111-111111111111';
const KAIDO = '22222222-2222-4222-8222-222222222222';

const leaders = [
  { id: ZORO, name: 'Roronoa Zoro', colors: ['red'], setCode: 'OP01-001', isCustom: false, ownerId: null },
  { id: KAIDO, name: 'Kaido', colors: ['purple'], setCode: 'OP01-061', isCustom: false, ownerId: null },
] as LeaderDTO[];

const tournaments = [{
  id: 't1', type: 'local', myLeaderId: ZORO, metaId: null, name: null, notes: null,
  placement: null, fieldSize: null, playedOn: '2026-08-01', status: 'draft',
  record: { wins: 1, losses: 0, draws: 0 }, deckCount: 0,
  matches: [{ opponentLeaderId: KAIDO, myLeaderId: null, opponentMetaId: null, result: 'win', kind: 'swiss', playOrder: 'first' }],
}] as unknown as TournamentSummaryDTO[];

const played = [{ id: ZORO, name: 'Roronoa Zoro', wins: 1, losses: 0, draws: 0, games: 1, winRate: 1 }];

const renderIt = () => render(
  <MatchupStats tournaments={tournaments} leaders={leaders} segment="tournaments" playedLeaders={played} />,
);

describe('MatchupStats', () => {
  it('opens on the leader you play most, rather than on nothing', () => {
    // This section is the product's first claimed edge and used to render an
    // empty select three screens down — so it only paid out for a reader who
    // already knew to operate it.
    renderIt();
    expect(screen.getByRole('combobox').textContent).toContain('Roronoa Zoro');
    expect(screen.getByText('Kaido')).toBeTruthy();
  });

  it('shows the leader name, not its id', () => {
    /*
     * The bug this pins: Base UI's Select.Value renders the raw value unless it
     * is given a formatting function, so choosing a leader replaced the
     * placeholder with a UUID. Unlike Radix, it does not read the item's text.
     */
    renderIt();
    const trigger = screen.getByRole('combobox');
    expect(trigger.textContent).toContain('Roronoa Zoro');
    expect(trigger.textContent).not.toContain(ZORO);
  });

  it('withholds a verdict on a single game', () => {
    // One win used to render "favored" in confident green. The badge now says
    // what is true: there is not enough here to judge.
    renderIt();
    expect(screen.getByText('Too early')).toBeTruthy();
    expect(screen.queryByText('Favoured')).toBeNull();
  });

  it('renders nothing at all when no leader has played here', () => {
    // A segment with no games should not offer an empty picker.
    const { container } = render(
      <MatchupStats tournaments={tournaments} leaders={leaders} segment="sessions" playedLeaders={[]} />,
    );
    expect(container.innerHTML).toBe('');
  });
});
