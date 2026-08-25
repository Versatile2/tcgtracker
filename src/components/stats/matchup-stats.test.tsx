/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
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

const played = [{ id: ZORO, name: 'Roronoa Zoro' }];

const renderIt = () => render(
  <MatchupStats tournaments={tournaments} leaders={leaders} segment="tournaments" playedLeaders={played} />,
);

describe('MatchupStats', () => {
  it('shows the placeholder before a leader is chosen', () => {
    renderIt();
    expect(screen.getByText('Pick one of your leaders')).toBeTruthy();
  });

  it('shows the leader name once chosen, not its id', () => {
    /*
     * The bug this pins: Base UI's Select.Value renders the raw value unless it
     * is given a formatting function, so choosing a leader replaced the
     * placeholder with a UUID. Unlike Radix, it does not read the item's text.
     */
    renderIt();
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'Roronoa Zoro' }));
    const trigger = screen.getByRole('combobox');
    expect(trigger.textContent).toContain('Roronoa Zoro');
    expect(trigger.textContent).not.toContain(ZORO);
  });

  it('renders that leader’s matchups after choosing', () => {
    renderIt();
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'Roronoa Zoro' }));
    expect(screen.getByText('Kaido')).toBeTruthy();
    expect(screen.getByText('favored')).toBeTruthy();
  });

  it('renders nothing at all when no leader has played here', () => {
    // A segment with no games should not offer an empty picker.
    const { container } = render(
      <MatchupStats tournaments={tournaments} leaders={leaders} segment="sessions" playedLeaders={[]} />,
    );
    expect(container.innerHTML).toBe('');
  });
});
