export type LeaderDTO = { id: string; name: string; colors: string[]; setCode: string | null; isCustom: boolean; ownerId: string | null };
export type MetaDTO = { id: string; name: string; code: string | null; isCustom: boolean; ownerId: string | null };
/** Set code → the leader printing this player chose. A missing key means the base printing. */
export type LeaderArtMapDTO = Record<string, string>;
export type RoundKind = 'swiss' | 'top_cut' | 'bye' | 'no_show';
export type GameLog = { result: 'win' | 'loss'; playOrder: 'first' | 'second' | null };
export type RoundDTO = {
  id: string; tournamentId: string; roundNumber: number; kind: RoundKind;
  opponentLeaderId: string | null; opponentMetaId: string | null;
  // Set only on a freeplay swiss/top_cut round; null otherwise (including on
  // freeplay byes/no-shows, which are not games).
  myLeaderId: string | null;
  result: 'win' | 'loss' | 'draw'; playOrder: 'first' | 'second' | null;
  wonDieRoll: boolean | null;
  games: GameLog[] | null; notes: string | null;
};
export type RecordDTO = { wins: number; losses: number; draws: number };
export type TournamentType = 'local' | 'treasure_cup' | 'regionals' | 'extra_grand_battle' | 'pirates_party' | 'testing' | 'freeplay' | 'match';
// playOrder rides along so the client can evaluate achievements from its own
// cache — without it, unlocks could only be discovered on the next server read.
export type MatchSummaryDTO = { opponentLeaderId: string | null; result: 'win' | 'loss' | 'draw'; kind: RoundKind; playOrder: 'first' | 'second' | null };
export type TournamentSummaryDTO = {
  id: string; type: TournamentType; myLeaderId: string | null; metaId: string | null; name: string | null; notes: string | null;
  playedOn: string; status: 'draft' | 'locked'; record: RecordDTO;
  matches: MatchSummaryDTO[];
  /** Distinct leaders played across the session's rounds; 0 for classic types. */
  deckCount: number;
};
export type TournamentDetailDTO = Omit<TournamentSummaryDTO, 'record'> & { rounds: RoundDTO[] };

export type OverallStatsDTO = {
  totalTournaments: number;
  wins: number; losses: number; draws: number;
  winRate: number; drawRate: number;
  bestMeta: { metaId: string | null; name: string; winRate: number; games: number } | null;
  mostPlayedLeader: { leaderId: string; name: string; tournaments: number } | null;
};
export type PerMetaStatDTO = {
  metaId: string | null; name: string;
  tournaments: number; wins: number; losses: number; draws: number; winRate: number;
};
export type PlayedLeaderDTO = { id: string; name: string };
export type OpponentMetaStatDTO = {
  metaId: string; name: string;
  wins: number; losses: number; draws: number; games: number; winRate: number;
};
export type OpponentLeaderStatDTO = {
  leaderId: string; name: string;
  wins: number; losses: number; draws: number; games: number; winRate: number;
  byMeta: OpponentMetaStatDTO[];
};
export type StatsDTO = {
  overall: OverallStatsDTO; perMeta: PerMetaStatDTO[]; playedLeaders: PlayedLeaderDTO[];
  opponents: OpponentLeaderStatDTO[];
};
export type MatchupResultCountsDTO = { wins: number; losses: number; draws: number; games: number; winRate: number };
export type MatchupOpponentDTO = MatchupResultCountsDTO & { leaderId: string; name: string; verdict: 'favored' | 'even' | 'unfavored' };
export type MatchupStatsDTO = {
  opponents: MatchupOpponentDTO[];
  turnOrder: { first: MatchupResultCountsDTO; second: MatchupResultCountsDTO };
  colorBreakdown: (MatchupResultCountsDTO & { color: string })[];
};
export type AchievementProgressDTO = { current: number; target: number };
export type AchievementDTO = { key: string; name: string; description: string; unlocked: boolean; progress: AchievementProgressDTO | null };
export type AchievementsResponseDTO = { achievements: AchievementDTO[]; unlockedCount: number; total: number };
