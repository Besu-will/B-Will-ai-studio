import crypto from 'node:crypto';
import { Response } from 'express';
import { store } from './store.ts';
import {
  BetRecord,
  BetSlotIndex,
  GAME_COLORS,
  GameColor,
  PublicRoundState,
  RoundPhase,
  RoundSummary,
  TransactionRecord,
} from '../src/shared/types.ts';
import {
  nextPhaseAfter,
  phaseDurationMs,
  roundCurrency,
  settleRoundBets,
  validateBetInput,
  validatePickChange,
} from '../src/shared/gameRules.ts';

interface ActiveRoundInternal {
  roundId: string;
  roundNumber: number;
  phase: RoundPhase;
  phaseStartedAt: number;
  phaseEndsAt: number;
  commitHash: string;
  // Strictly server-only until REVEAL
  secretWinningColor: GameColor;
  secretRevealSalt: string;
  startedAtIso: string;
}

class GameEngine {
  private activeRound: ActiveRoundInternal;
  private clients: Set<Response> = new Set();
  private tickTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.activeRound = this.createRound();
  }

  private createRound(): ActiveRoundInternal {
    const roundNumber = store.state.nextRoundNumber;
    store.state.nextRoundNumber += 1;
    store.save();

    const roundId = `round-${String(roundNumber).padStart(4, '0')}`;
    const colorIndex = crypto.randomInt(0, GAME_COLORS.length);
    const secretWinningColor = GAME_COLORS[colorIndex];
    const secretRevealSalt = crypto.randomBytes(16).toString('hex');
    const commitHash = crypto
      .createHash('sha256')
      .update(`${roundId}:${secretWinningColor}:${secretRevealSalt}`)
      .digest('hex');

    const now = Date.now();
    const duration = phaseDurationMs('BETTING', store.state.settings);

    return {
      roundId,
      roundNumber,
      phase: 'BETTING',
      phaseStartedAt: now,
      phaseEndsAt: now + duration,
      commitHash,
      secretWinningColor,
      secretRevealSalt,
      startedAtIso: new Date(now).toISOString(),
    };
  }

  start(): void {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => {
      this.tick();
    }, 500);
  }

  stop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  private tick(): void {
    const now = Date.now();
    if (now >= this.activeRound.phaseEndsAt) {
      this.advancePhase(now);
    } else {
      this.broadcastState();
    }
  }

  private advancePhase(now: number): void {
    const { phase: nextPhase, isNewRound } = nextPhaseAfter(this.activeRound.phase);

    if (isNewRound) {
      this.activeRound = this.createRound();
      this.broadcastState();
      return;
    }

    this.activeRound.phase = nextPhase;
    this.activeRound.phaseStartedAt = now;
    this.activeRound.phaseEndsAt = now + phaseDurationMs(nextPhase, store.state.settings);

    if (nextPhase === 'REVEAL') {
      this.settleActiveRound(now);
    }

    this.broadcastState();
  }

  private settleActiveRound(now: number): void {
    const settledAtIso = new Date(now).toISOString();
    const roundId = this.activeRound.roundId;
    const roundBets = store.state.bets.filter(
      (b) => b.roundId === roundId && b.status === 'pending'
    );

    const { settledBets, totalPool, totalPayout, houseDelta } = settleRoundBets(
      roundBets,
      this.activeRound.secretWinningColor,
      store.state.settings.payoutMultiplier,
      settledAtIso
    );

    const settledById = new Map(settledBets.map((b) => [b.betId, b]));
    store.state.bets = store.state.bets.map((b) => settledById.get(b.betId) || b);

    const poolByColor: Record<GameColor, number> = { GREEN: 0, BLUE: 0, ORANGE: 0 };
    for (const bet of settledBets) {
      poolByColor[bet.selectedColor] = roundCurrency(poolByColor[bet.selectedColor] + bet.stake);

      const user = store.state.users[bet.userId];
      if (user) {
        user.gamesPlayed += 1;
        if (bet.payout > 0) {
          user.balance = roundCurrency(user.balance + bet.payout);
          user.totalWon = roundCurrency(user.totalWon + bet.payout);
          user.winsCount += 1;

          const winTx: TransactionRecord = {
            txId: `tx-win-${crypto.randomBytes(6).toString('hex')}`,
            userId: user.userId,
            username: user.username,
            type: 'win',
            amount: bet.payout,
            status: 'completed',
            note: `Round #${this.activeRound.roundNumber} Slot ${bet.slotIndex} (${bet.selectedColor}) payout`,
            createdAt: settledAtIso,
            processedAt: settledAtIso,
            processedBy: 'engine',
          };
          store.state.transactions.unshift(winTx);
        }
        user.updatedAt = settledAtIso;
      }
    }

    store.state.settings.houseBalance = roundCurrency(store.state.settings.houseBalance + houseDelta);
    store.state.settings.houseProfit = roundCurrency(store.state.settings.houseProfit + houseDelta);
    store.state.settings.updatedAt = settledAtIso;

    const summary: RoundSummary = {
      roundId,
      roundNumber: this.activeRound.roundNumber,
      phase: 'REVEAL',
      commitHash: this.activeRound.commitHash,
      winningColor: this.activeRound.secretWinningColor,
      revealSalt: this.activeRound.secretRevealSalt,
      totalPool,
      totalPayout,
      betCount: settledBets.length,
      poolByColor,
      startedAt: this.activeRound.startedAtIso,
      settledAt: settledAtIso,
    };

    store.state.rounds.unshift(summary);
    if (store.state.rounds.length > 200) {
      store.state.rounds = store.state.rounds.slice(0, 200);
    }
    store.save();
  }

  getPublicState(): PublicRoundState {
    const now = Date.now();
    const roundBets = store.state.bets.filter((b) => b.roundId === this.activeRound.roundId);
    const poolByColor: Record<GameColor, number> = { GREEN: 0, BLUE: 0, ORANGE: 0 };
    let totalPool = 0;

    for (const bet of roundBets) {
      poolByColor[bet.selectedColor] = roundCurrency(poolByColor[bet.selectedColor] + bet.stake);
      totalPool = roundCurrency(totalPool + bet.stake);
    }

    const isRevealed = this.activeRound.phase === 'REVEAL';

    return {
      roundId: this.activeRound.roundId,
      roundNumber: this.activeRound.roundNumber,
      phase: this.activeRound.phase,
      phaseStartedAt: this.activeRound.phaseStartedAt,
      phaseEndsAt: this.activeRound.phaseEndsAt,
      serverNow: now,
      secondsRemaining: Math.max(0, Math.ceil((this.activeRound.phaseEndsAt - now) / 1000)),
      commitHash: this.activeRound.commitHash,
      // CRITICAL: Secret winning color and salt are NEVER exposed before REVEAL
      winningColor: isRevealed ? this.activeRound.secretWinningColor : null,
      revealSalt: isRevealed ? this.activeRound.secretRevealSalt : null,
      totalPool,
      betCount: roundBets.length,
      poolByColor,
      settings: store.state.settings,
      recentRounds: store.state.rounds.slice(0, 12),
    };
  }

  getUserActiveBets(userId: string): { slot1: BetRecord | null; slot2: BetRecord | null } {
    const bets = store.state.bets.filter(
      (b) => b.userId === userId && b.roundId === this.activeRound.roundId
    );
    return {
      slot1: bets.find((b) => b.slotIndex === 1) || null,
      slot2: bets.find((b) => b.slotIndex === 2) || null,
    };
  }

  placeBet(params: {
    userId: string;
    slotIndex: unknown;
    color: unknown;
    stake: number;
  }): { ok: true; bet: BetRecord; balance: number } | { ok: false; error: string; status: number } {
    const user = store.state.users[params.userId];
    if (!user) {
      return { ok: false, error: 'Player account not found.', status: 404 };
    }

    const slot = params.slotIndex as BetSlotIndex;
    const existingBetInSlot = store.state.bets.find(
      (b) =>
        b.userId === user.userId &&
        b.roundId === this.activeRound.roundId &&
        b.slotIndex === slot
    );

    const validation = validateBetInput({
      phase: this.activeRound.phase,
      balance: user.balance,
      stake: params.stake,
      color: params.color,
      slotIndex: params.slotIndex,
      existingBetInSlot,
      minBet: store.state.settings.minBet,
      maxBet: store.state.settings.maxBet,
      isBanned: user.isBanned,
      maintenanceMode: store.state.settings.maintenanceMode,
    });

    if (!validation.ok) {
      return { ok: false, error: validation.error, status: 400 };
    }

    const nowIso = new Date().toISOString();
    user.balance = roundCurrency(user.balance - validation.stake);
    user.totalWagered = roundCurrency(user.totalWagered + validation.stake);
    user.updatedAt = nowIso;

    store.state.settings.totalVolume = roundCurrency(
      store.state.settings.totalVolume + validation.stake
    );
    store.state.settings.updatedAt = nowIso;

    const bet: BetRecord = {
      betId: `bet-${crypto.randomBytes(6).toString('hex')}`,
      userId: user.userId,
      username: user.username,
      roundId: this.activeRound.roundId,
      roundNumber: this.activeRound.roundNumber,
      slotIndex: validation.slotIndex,
      selectedColor: validation.color,
      stake: validation.stake,
      status: 'pending',
      payout: 0,
      createdAt: nowIso,
    };

    const betTx: TransactionRecord = {
      txId: `tx-bet-${crypto.randomBytes(6).toString('hex')}`,
      userId: user.userId,
      username: user.username,
      type: 'bet',
      amount: validation.stake,
      status: 'completed',
      note: `Round #${this.activeRound.roundNumber} Slot ${validation.slotIndex} (${validation.color})`,
      createdAt: nowIso,
      processedAt: nowIso,
      processedBy: 'engine',
    };

    store.state.bets.unshift(bet);
    store.state.transactions.unshift(betTx);
    store.save();
    this.broadcastState();

    return { ok: true, bet, balance: user.balance };
  }

  updatePick(params: {
    userId: string;
    slotIndex: unknown;
    color: unknown;
  }): { ok: true; bet: BetRecord } | { ok: false; error: string; status: number } {
    const user = store.state.users[params.userId];
    if (!user) {
      return { ok: false, error: 'Player account not found.', status: 404 };
    }

    if (params.slotIndex !== 1 && params.slotIndex !== 2) {
      return { ok: false, error: 'Invalid slot index.', status: 400 };
    }

    const existingBet = store.state.bets.find(
      (b) =>
        b.userId === user.userId &&
        b.roundId === this.activeRound.roundId &&
        b.slotIndex === params.slotIndex
    );

    const validation = validatePickChange({
      phase: this.activeRound.phase,
      existingBet,
      newColor: params.color,
      isBanned: user.isBanned,
    });

    if (!validation.ok) {
      return { ok: false, error: validation.error, status: 400 };
    }

    existingBet!.selectedColor = validation.color;
    store.save();
    this.broadcastState();

    return { ok: true, bet: existingBet! };
  }

  addSseClient(res: Response): void {
    this.clients.add(res);
    const payload = JSON.stringify(this.getPublicState());
    res.write(`event: round\ndata: ${payload}\n\n`);
  }

  removeSseClient(res: Response): void {
    this.clients.delete(res);
  }

  broadcastState(): void {
    if (this.clients.size === 0) return;
    const payload = JSON.stringify(this.getPublicState());
    for (const res of this.clients) {
      res.write(`event: round\ndata: ${payload}\n\n`);
    }
  }
}

export const gameEngine = new GameEngine();
