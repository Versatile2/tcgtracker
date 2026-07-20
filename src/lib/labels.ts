import type { TournamentType } from './dto';

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
