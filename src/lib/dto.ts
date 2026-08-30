export type LeaderImageDTO = { id: string; label: string };
export type LeaderDTO = {
  id: string; name: string; colors: string[]; setCode: string | null;
  isCustom: boolean; ownerId: string | null;
  /** The printing shown to a player who has chosen none. Null for a leader with no art. */
  defaultImageId: string | null;
  /** Every printing this leader has, base first. Empty for custom leaders. */
  images: LeaderImageDTO[];
};
export type MetaDTO = { id: string; name: string; code: string | null; isCustom: boolean; ownerId: string | null };
/** Leader id → the image id this player chose. A missing key means the default. */
export type LeaderArtMapDTO = Record<string, string>;
export type RoundKind = 'swiss' | 'top_cut' | 'bye' | 'no_show';
export type GameLog = { result: 'win' | 'loss'; playOrder: 'first' | 'second' | null };
export type RoundDTO = {
  id: string; tournamentId: string; roundNumber: number; kind: RoundKind;
  opponentLeaderId: string | null; opponentMetaId: string | null;
  // Set only on a session swiss/top_cut round; null otherwise (including on
  // session byes/no-shows, which are not games).
  myLeaderId: string | null;
  result: 'win' | 'loss' | 'draw'; playOrder: 'first' | 'second' | null;
  wonDieRoll: boolean | null;
  games: GameLog[] | null; notes: string | null;
};
export type RecordDTO = { wins: number; losses: number; draws: number };
export type TournamentType = 'local' | 'treasure_cup' | 'regionals' | 'extra_grand_battle' | 'pirates_party' | 'testing' | 'ranked_sim' | 'session' | 'session_sim' | 'session_sim_casual' | 'session_friend' | 'session_locals' | 'session_gauntlet' | 'session_teaching' | 'match';
// playOrder rides along so the client can evaluate achievements from its own
// cache — without it, unlocks could only be discovered on the next server read.
export type MatchSummaryDTO = {
  opponentLeaderId: string | null;
  /** The deck played this round. Set on session rounds, null elsewhere — the
   *  tournament's own `myLeaderId` covers those. */
  myLeaderId: string | null;
  /** This round's meta, when it carries one; falls back to the tournament's. */
  opponentMetaId: string | null;
  result: 'win' | 'loss' | 'draw';
  kind: RoundKind;
  playOrder: 'first' | 'second' | null;
};
export type TournamentSummaryDTO = {
  id: string; type: TournamentType; myLeaderId: string | null; metaId: string | null; name: string | null; notes: string | null;
  placement: number | null; fieldSize: number | null;
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
export type AchievementProgressDTO = { current: number; target: number };
export type AchievementDTO = { key: string; name: string; description: string; unlocked: boolean; progress: AchievementProgressDTO | null };
export type AchievementsResponseDTO = { achievements: AchievementDTO[]; unlockedCount: number; total: number };
