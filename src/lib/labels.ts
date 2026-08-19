import type { TournamentType, RoundKind } from './dto';

export const TOURNAMENT_TYPE_LABELS: Record<TournamentType, string> = {
  local: 'Local',
  treasure_cup: 'Treasure Cup',
  regionals: 'Regionals',
  extra_grand_battle: 'Extra Grand Battle',
  pirates_party: 'Pirates Party',
  testing: 'Testing',
  // One label, two stored values: the same event read differently depending on
  // which segment it was logged in.
  ranked_sim: 'Ranked Simulator',
  freeplay: 'Freeplay',
  freeplay_sim: 'Ranked Simulator',
  match: 'Match',
};

export function tournamentTypeLabel(type: TournamentType): string {
  return TOURNAMENT_TYPE_LABELS[type];
}

export const ROUND_KIND_LABELS: Record<RoundKind, string> = {
  swiss: 'Swiss',
  top_cut: 'Top Cut',
  bye: 'BYE',
  no_show: 'No Show',
};

export const ROUND_KIND_SUBTITLES: Record<RoundKind, string> = {
  swiss: 'Regular tournament round',
  top_cut: 'Playoff round (best of 3)',
  bye: 'Skip round',
  no_show: 'Didn’t show up',
};

export function roundKindLabel(kind: RoundKind): string {
  return ROUND_KIND_LABELS[kind];
}

/**
 * Metas display as their set code alone — "OP01", not "OP01 Romance Dawn".
 * Custom metas have no code, so their full name is the label.
 */
export function metaLabel(meta: { name: string; code?: string | null }): string {
  return meta.code ?? meta.name;
}

/** "5 decks" / "1 deck" — the distinct-deck count for a freeplay session. */
export function deckCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'deck' : 'decks'}`;
}
