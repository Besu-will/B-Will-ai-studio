import {
  GAME_COLORS,
  type BetRecord,
  type BetSlotIndex,
  type FinancialReport,
  type GameColor,
  type GameSettings,
  type LeaderboardEntry,
  type PlayerProfile,
  type RoundPhase,
  type RoundSummary,
  type TransactionRecord,
} from './types.ts';

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function adjustStakeAmount(
  currentRaw: string,
  delta: number,
  minBet: number,
  maxBet: number
): number {
  const parsed = Number(currentRaw);
  const base = Number.isFinite(parsed) && parsed > 0 ? parsed : minBet;
  const next = roundCurrency(base + delta);
  if (next < minBet) return roundCurrency(minBet);
  if (next > maxBet) return roundCurrency(maxBet);
  return next;
}

export function shouldTriggerAutoBet(params: {
  mode: 'manual' | 'auto';
  autoArmed: boolean;
  autoColor: GameColor | null;
  autoStake: number;
  roundId: string;
  lastTriggeredRoundId: string | null;
  phase: RoundPhase;
  hasActiveBet: boolean;
  isAuthenticated: boolean;
  isBusy: boolean;
  balance: number;
  minBet: number;
  maxBet: number;
}): { trigger: true } | { trigger: false; disarm?: boolean; reason?: string } {
  const {
    mode,
    autoArmed,
    autoColor,
    autoStake,
    roundId,
    lastTriggeredRoundId,
    phase,
    hasActiveBet,
    isAuthenticated,
    isBusy,
    balance,
    minBet,
    maxBet,
  } = params;

  if (mode !== 'auto' || !autoArmed || !autoColor || !isAuthenticated) {
    return { trigger: false };
  }
  if (phase !== 'BETTING' || hasActiveBet || isBusy || lastTriggeredRoundId === roundId) {
    return { trigger: false };
  }
  if (!Number.isFinite(autoStake) || autoStake < minBet || autoStake > maxBet) {
    return {
      trigger: false,
      disarm: true,
      reason: `Auto bet stopped: stake must be between $${minBet.toFixed(2)} and $${maxBet.toFixed(2)}.`,
    };
  }
  if (roundCurrency(balance) < roundCurrency(autoStake)) {
    return {
      trigger: false,
      disarm: true,
      reason: 'Auto bet stopped: insufficient balance.',
    };
  }
  return { trigger: true };
}

export function isValidColor(color: unknown): color is GameColor {
  return typeof color === 'string' && (GAME_COLORS as readonly string[]).includes(color);
}

export function validateUsername(username: string): { ok: true; clean: string } | { ok: false; error: string } {
  const clean = username.trim();
  if (clean.length < 3 || clean.length > 20) {
    return { ok: false, error: 'Username must be between 3 and 20 characters.' };
  }
  if (!/^[a-zA-Z0-9_]+$/.test(clean)) {
    return { ok: false, error: 'Username may only contain letters, numbers, and underscores.' };
  }
  return { ok: true, clean };
}

export function validateBetInput(params: {
  phase: RoundPhase;
  balance: number;
  stake: number;
  color: unknown;
  slotIndex: unknown;
  existingBetInSlot: BetRecord | undefined;
  minBet: number;
  maxBet: number;
  isBanned: boolean;
  maintenanceMode: boolean;
}): { ok: true; stake: number; color: GameColor; slotIndex: BetSlotIndex } | { ok: false; error: string } {
  const { phase, balance, stake, color, slotIndex, existingBetInSlot, minBet, maxBet, isBanned, maintenanceMode } = params;

  if (maintenanceMode) {
    return { ok: false, error: 'Betting is temporarily paused for platform maintenance.' };
  }
  if (isBanned) {
    return { ok: false, error: 'This account is suspended from placing bets.' };
  }
  if (phase !== 'BETTING') {
    return { ok: false, error: 'New bets can only be placed during the BETTING phase.' };
  }
  if (slotIndex !== 1 && slotIndex !== 2) {
    return { ok: false, error: 'Invalid betting slot. Choose Slot 1 or Slot 2.' };
  }
  if (!isValidColor(color)) {
    return { ok: false, error: 'Select a valid color: GREEN, BLUE, or ORANGE.' };
  }
  if (existingBetInSlot) {
    return { ok: false, error: `Slot ${slotIndex} already has an active bet for this round.` };
  }
  if (!Number.isFinite(stake) || stake <= 0) {
    return { ok: false, error: 'Stake must be a positive number.' };
  }
  const cleanStake = roundCurrency(stake);
  if (cleanStake < minBet) {
    return { ok: false, error: `Minimum stake is $${minBet.toFixed(2)}.` };
  }
  if (cleanStake > maxBet) {
    return { ok: false, error: `Maximum stake is $${maxBet.toFixed(2)}.` };
  }
  if (cleanStake > roundCurrency(balance)) {
    return { ok: false, error: 'Insufficient balance for this stake.' };
  }

  return { ok: true, stake: cleanStake, color, slotIndex };
}

export function validatePickChange(params: {
  phase: RoundPhase;
  existingBet: BetRecord | undefined;
  newColor: unknown;
  isBanned: boolean;
}): { ok: true; color: GameColor } | { ok: false; error: string } {
  const { phase, existingBet, newColor, isBanned } = params;

  if (isBanned) {
    return { ok: false, error: 'This account is suspended.' };
  }
  if (phase !== 'PICKING') {
    return { ok: false, error: 'Final color selections can only be updated during the PICKING phase.' };
  }
  if (!existingBet || existingBet.status !== 'pending') {
    return { ok: false, error: 'No active pending bet in this slot to update.' };
  }
  if (!isValidColor(newColor)) {
    return { ok: false, error: 'Select a valid color: GREEN, BLUE, or ORANGE.' };
  }

  return { ok: true, color: newColor };
}

export function calculatePayout(
  stake: number,
  selectedColor: GameColor,
  winningColor: GameColor,
  multiplier: number
): number {
  if (selectedColor !== winningColor) {
    return 0;
  }
  return roundCurrency(stake * multiplier);
}

export function settleRoundBets(
  bets: BetRecord[],
  winningColor: GameColor,
  multiplier: number,
  settledAtIso: string
): {
  settledBets: BetRecord[];
  totalPool: number;
  totalPayout: number;
  houseDelta: number;
} {
  let totalPool = 0;
  let totalPayout = 0;

  const settledBets = bets.map((bet) => {
    totalPool = roundCurrency(totalPool + bet.stake);
    const payout = calculatePayout(bet.stake, bet.selectedColor, winningColor, multiplier);
    totalPayout = roundCurrency(totalPayout + payout);
    return {
      ...bet,
      status: payout > 0 ? ('won' as const) : ('lost' as const),
      payout,
      settledAt: settledAtIso,
    };
  });

  const houseDelta = roundCurrency(totalPool - totalPayout);
  return { settledBets, totalPool, totalPayout, houseDelta };
}

export function validateDepositRequest(amount: number): { ok: true; amount: number } | { ok: false; error: string } {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'Deposit amount must be greater than zero.' };
  }
  const clean = roundCurrency(amount);
  if (clean < 5) {
    return { ok: false, error: 'Minimum deposit request is $5.00.' };
  }
  if (clean > 50000) {
    return { ok: false, error: 'Maximum single deposit request is $50,000.00.' };
  }
  return { ok: true, amount: clean };
}

export function validateWithdrawalRequest(
  amount: number,
  balance: number
): { ok: true; amount: number } | { ok: false; error: string } {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'Withdrawal amount must be greater than zero.' };
  }
  const clean = roundCurrency(amount);
  if (clean < 5) {
    return { ok: false, error: 'Minimum withdrawal request is $5.00.' };
  }
  if (clean > roundCurrency(balance)) {
    return { ok: false, error: 'Insufficient available balance for withdrawal.' };
  }
  return { ok: true, amount: clean };
}

export function canCancelWithdrawal(
  tx: TransactionRecord | undefined,
  userId: string
): { ok: true } | { ok: false; error: string } {
  if (!tx) {
    return { ok: false, error: 'Transaction not found.' };
  }
  if (tx.userId !== userId) {
    return { ok: false, error: 'You cannot cancel another player’s withdrawal.' };
  }
  if (tx.type !== 'withdrawal') {
    return { ok: false, error: 'Only withdrawal requests can be cancelled.' };
  }
  if (tx.status !== 'pending') {
    return { ok: false, error: `Withdrawal is already ${tx.status} and cannot be cancelled.` };
  }
  return { ok: true };
}

export function nextPhaseAfter(current: RoundPhase): { phase: RoundPhase; isNewRound: boolean } {
  switch (current) {
    case 'BETTING':
      return { phase: 'COLOR_DRAW', isNewRound: false };
    case 'COLOR_DRAW':
      return { phase: 'PICKING', isNewRound: false };
    case 'PICKING':
      return { phase: 'REVEAL', isNewRound: false };
    case 'REVEAL':
      return { phase: 'BETTING', isNewRound: true };
  }
}

export function phaseDurationMs(phase: RoundPhase, settings: GameSettings): number {
  switch (phase) {
    case 'BETTING':
      return settings.bettingDurationSec * 1000;
    case 'COLOR_DRAW':
      return settings.colorDrawDurationSec * 1000;
    case 'PICKING':
      return settings.pickingDurationSec * 1000;
    case 'REVEAL':
      return settings.revealDurationSec * 1000;
  }
}

export function buildLeaderboard(players: PlayerProfile[], limit = 25): LeaderboardEntry[] {
  const active = players
    .filter((p) => p.role !== 'admin' && !p.isBanned)
    .map((p) => {
      const winRate = p.gamesPlayed > 0 ? Math.round((p.winsCount / p.gamesPlayed) * 1000) / 10 : 0;
      return {
        userId: p.userId,
        username: p.username,
        winsCount: p.winsCount,
        gamesPlayed: p.gamesPlayed,
        winRate,
      };
    })
    .sort((a, b) => {
      if (b.winsCount !== a.winsCount) return b.winsCount - a.winsCount;
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      if (b.gamesPlayed !== a.gamesPlayed) return b.gamesPlayed - a.gamesPlayed;
      return a.username.localeCompare(b.username);
    })
    .slice(0, limit);

  return active.map((entry, idx) => ({
    rank: idx + 1,
    ...entry,
  }));
}

export function computeHouseReport(
  rounds: RoundSummary[],
  transactions: TransactionRecord[],
  settings: GameSettings
): FinancialReport {
  const completedRounds = rounds.filter((r) => r.phase === 'REVEAL' && r.winningColor);
  const colorDistribution: Record<GameColor, number> = {
    GREEN: 0,
    BLUE: 0,
    ORANGE: 0,
  };

  let totalPayouts = 0;
  for (const r of completedRounds) {
    if (r.winningColor) {
      colorDistribution[r.winningColor] += 1;
    }
    totalPayouts = roundCurrency(totalPayouts + r.totalPayout);
  }

  let totalApprovedDeposits = 0;
  let totalApprovedWithdrawals = 0;
  let pendingDepositsCount = 0;
  let pendingDepositsAmount = 0;
  let pendingWithdrawalsCount = 0;
  let pendingWithdrawalsAmount = 0;

  for (const tx of transactions) {
    if (tx.type === 'deposit') {
      if (tx.status === 'approved') {
        totalApprovedDeposits = roundCurrency(totalApprovedDeposits + tx.amount);
      } else if (tx.status === 'pending') {
        pendingDepositsCount += 1;
        pendingDepositsAmount = roundCurrency(pendingDepositsAmount + tx.amount);
      }
    } else if (tx.type === 'withdrawal') {
      if (tx.status === 'approved') {
        totalApprovedWithdrawals = roundCurrency(totalApprovedWithdrawals + tx.amount);
      } else if (tx.status === 'pending') {
        pendingWithdrawalsCount += 1;
        pendingWithdrawalsAmount = roundCurrency(pendingWithdrawalsAmount + tx.amount);
      }
    }
  }

  return {
    houseBalance: roundCurrency(settings.houseBalance),
    totalVolume: roundCurrency(settings.totalVolume),
    totalPayouts,
    houseProfit: roundCurrency(settings.houseProfit),
    totalApprovedDeposits,
    totalApprovedWithdrawals,
    pendingDepositsCount,
    pendingDepositsAmount,
    pendingWithdrawalsCount,
    pendingWithdrawalsAmount,
    completedRoundsCount: completedRounds.length,
    colorDistribution,
  };
}
