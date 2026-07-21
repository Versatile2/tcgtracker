export type LeaderDTO = { id: string; name: string; colors: string[]; isCustom: boolean; ownerId: string | null };
export type SetDTO = { id: string; name: string; code: string | null; isCustom: boolean; ownerId: string | null };
export type RoundDTO = {
  id: string; tournamentId: string; roundNumber: number;
  myLeaderId: string; opponentLeaderId: string;
  result: 'win' | 'loss' | 'draw'; playOrder: 'first' | 'second' | null; notes: string | null;
};
export type RecordDTO = { wins: number; losses: number; draws: number };
export type TournamentType = 'local' | 'treasure_cup' | 'regionals' | 'extra_grand_battle' | 'pirates_party' | 'testing';
export type TournamentSummaryDTO = {
  id: string; type: TournamentType; setId: string | null; name: string | null;
  playedOn: string; status: 'draft' | 'locked'; record: RecordDTO;
};
export type TournamentDetailDTO = Omit<TournamentSummaryDTO, 'record'> & { rounds: RoundDTO[] };

export type OverallStatsDTO = {
  totalTournaments: number;
  wins: number; losses: number; draws: number;
  winRate: number; drawRate: number;
  bestSet: { setId: string | null; name: string; winRate: number; games: number } | null;
  mostPlayedLeader: { leaderId: string; name: string; tournaments: number } | null;
};
export type PerSetStatDTO = {
  setId: string | null; name: string;
  tournaments: number; wins: number; losses: number; draws: number; winRate: number;
};
export type PlayedLeaderDTO = { id: string; name: string };
export type StatsDTO = { overall: OverallStatsDTO; perSet: PerSetStatDTO[]; playedLeaders: PlayedLeaderDTO[] };
export type MatchupResultCountsDTO = { wins: number; losses: number; draws: number; games: number; winRate: number };
export type MatchupOpponentDTO = MatchupResultCountsDTO & { leaderId: string; name: string; verdict: 'favored' | 'even' | 'unfavored' };
export type MatchupStatsDTO = {
  opponents: MatchupOpponentDTO[];
  turnOrder: { first: MatchupResultCountsDTO; second: MatchupResultCountsDTO };
  colorBreakdown: (MatchupResultCountsDTO & { color: string })[];
};
