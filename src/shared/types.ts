export type GameColor = 'GREEN' | 'BLUE' | 'ORANGE';

export const GAME_COLORS: readonly GameColor[] = ['GREEN', 'BLUE', 'ORANGE'] as const;

export type RoundPhase = 'BETTING' | 'COLOR_DRAW' | 'PICKING' | 'REVEAL';

export type BetSlotIndex = 1 | 2;

export type BetStatus = 'pending' | 'won' | 'lost';

export type TransactionType = 'deposit' | 'withdrawal' | 'bet' | 'win' | 'adjustment';

export type TransactionStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'completed';

export type UserRole = 'player' | 'admin';

export interface GameSettings {
  bettingDurationSec: number;
  colorDrawDurationSec: number;
  pickingDurationSec: number;
  revealDurationSec: number;
  minBet: number;
  maxBet: number;
  payoutMultiplier: number;
  houseBalance: number;
  totalVolume: number;
  houseProfit: number;
  maintenanceMode: boolean;
  leaderboardVisible: boolean;
  updatedAt: string;
}

export interface PlayerProfile {
  userId: string;
  username: string;
  email?: string;
  balance: number;
  totalWagered: number;
  totalWon: number;
  winsCount: number;
  gamesPlayed: number;
  isBanned: boolean;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface BetRecord {
  betId: string;
  userId: string;
  username: string;
  roundId: string;
  roundNumber: number;
  slotIndex: BetSlotIndex;
  selectedColor: GameColor;
  stake: number;
  status: BetStatus;
  payout: number;
  createdAt: string;
  settledAt?: string;
}

export interface TransactionRecord {
  txId: string;
  userId: string;
  username: string;
  type: TransactionType;
  amount: number;
  status: TransactionStatus;
  note: string;
  createdAt: string;
  processedAt?: string;
  processedBy?: string;
}

export interface RoundSummary {
  roundId: string;
  roundNumber: number;
  phase: RoundPhase;
  commitHash: string;
  winningColor?: GameColor;
  revealSalt?: string;
  totalPool: number;
  totalPayout: number;
  betCount: number;
  poolByColor: Record<GameColor, number>;
  startedAt: string;
  settledAt?: string;
}

export interface PublicRoundState {
  roundId: string;
  roundNumber: number;
  phase: RoundPhase;
  phaseStartedAt: number;
  phaseEndsAt: number;
  serverNow: number;
  secondsRemaining: number;
  commitHash: string;
  winningColor: GameColor | null;
  revealSalt: string | null;
  totalPool: number;
  betCount: number;
  poolByColor: Record<GameColor, number>;
  settings: GameSettings;
  recentRounds: RoundSummary[];
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  winsCount: number;
  gamesPlayed: number;
  winRate: number;
}

export interface FinancialReport {
  houseBalance: number;
  totalVolume: number;
  totalPayouts: number;
  houseProfit: number;
  totalApprovedDeposits: number;
  totalApprovedWithdrawals: number;
  pendingDepositsCount: number;
  pendingDepositsAmount: number;
  pendingWithdrawalsCount: number;
  pendingWithdrawalsAmount: number;
  completedRoundsCount: number;
  colorDistribution: Record<GameColor, number>;
}
