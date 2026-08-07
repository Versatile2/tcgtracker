import type { RoundDTO } from './dto';
import type { CreateRoundInput } from './validation/round';
import { matchResultFromGames } from './validation/round';

/** The stored shape of a round, minus the fields the tournament owns. */
export type RoundFields = Omit<RoundDTO, 'id' | 'tournamentId' | 'roundNumber'>;

/**
 * Normalize a validated round payload into its stored fields. Shared by the
 * write service and the offline cache so a round logged on a phone looks
 * exactly like the row the server will later produce for it — otherwise the
 * round would visibly change when the queue drains.
 */
export function roundFieldsFromInput(input: CreateRoundInput): RoundFields {
  switch (input.kind) {
    case 'swiss':
      return {
        kind: 'swiss',
        opponentLeaderId: input.opponentLeaderId,
        opponentMetaId: input.opponentMetaId ?? null,
        result: input.result,
        playOrder: input.playOrder ?? null,
        wonDieRoll: input.wonDieRoll ?? null,
        games: null,
        notes: input.notes ?? null,
      };
    case 'top_cut': {
      const games = input.games.map((g) => ({ result: g.result, playOrder: g.playOrder ?? null }));
      return {
        kind: 'top_cut',
        opponentLeaderId: input.opponentLeaderId,
        opponentMetaId: input.opponentMetaId ?? null,
        result: matchResultFromGames(games),
        playOrder: null,
        wonDieRoll: null,
        games,
        notes: input.notes ?? null,
      };
    }
    case 'bye':
    case 'no_show':
      return {
        kind: input.kind,
        opponentLeaderId: null,
        opponentMetaId: null,
        result: 'win',
        playOrder: null,
        wonDieRoll: null,
        games: null,
        notes: input.notes ?? null,
      };
  }
}
