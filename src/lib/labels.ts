import type { TournamentType, RoundKind } from './dto';

export const TOURNAMENT_TYPE_LABELS: Record<TournamentType, string> = {
  local: 'Local',
  treasure_cup: 'Treasure Cup',
  regionals: 'Regionals',
  extra_grand_battle: 'Extra Grand Battle',
  pirates_party: 'Pirates Party',
  testing: 'Testing',
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
