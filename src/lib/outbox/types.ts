import type { CreateRoundInput, UpdateRoundInput } from '@/lib/validation/round';
import type { CreateTournamentInput, UpdateTournamentInput, ConvertTournamentInput } from '@/lib/validation/tournament';

/** Create payloads inside the outbox always carry their client-generated id. */
export type CreateTournamentPayload = CreateTournamentInput & { id: string };
export type CreateRoundPayload = CreateRoundInput & { id: string };

/**
 * A single pending write. Every op carries `tournamentId` — even the round ops,
 * which do not need it to reach the API — because both the coalescing rules and
 * the "this tournament has unsynced changes" indicator key off it.
 */
export type OutboxOp =
  | { kind: 'tournament.create'; tournamentId: string; payload: CreateTournamentPayload }
  | { kind: 'tournament.update'; tournamentId: string; payload: UpdateTournamentInput }
  | { kind: 'tournament.delete'; tournamentId: string }
  | { kind: 'tournament.finish'; tournamentId: string }
  | { kind: 'tournament.reopen'; tournamentId: string }
  | { kind: 'tournament.convert'; tournamentId: string; payload: ConvertTournamentInput }
  | { kind: 'round.create'; tournamentId: string; roundId: string; payload: CreateRoundPayload }
  | { kind: 'round.update'; tournamentId: string; roundId: string; payload: UpdateRoundInput }
  | { kind: 'round.delete'; tournamentId: string; roundId: string };

export type OutboxEntry = {
  opId: string;
  /** Epoch ms, for ordering and for showing how long something has been stuck. */
  createdAt: number;
  /** Failed delivery attempts so far; drives the "parked" UI state. */
  attempts: number;
  op: OutboxOp;
};

/** Attempts after which an entry is surfaced as stuck rather than retried silently. */
export const MAX_QUIET_ATTEMPTS = 5;

export function isRoundOp(
  op: OutboxOp
): op is Extract<OutboxOp, { roundId: string }> {
  return op.kind.startsWith('round.');
}
