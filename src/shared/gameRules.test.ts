import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adjustStakeAmount,
  buildLeaderboard,
  calculatePayout,
  canCancelWithdrawal,
  computeHouseReport,
  nextPhaseAfter,
  settleRoundBets,
  shouldTriggerAutoBet,
  validateBetInput,
  validateDepositRequest,
  validatePickChange,
  validateUsername,
  validateWithdrawalRequest,
} from './gameRules';
import { BetRecord, GameSettings, PlayerProfile, RoundSummary, TransactionRecord } from './types';

const baseSettings: GameSettings = {
  bettingDurationSec: 15,
  colorDrawDurationSec: 4,
  pickingDurationSec: 10,
  revealDurationSec: 6,
  minBet: 5,
  maxBet: 1000,
  payoutMultiplier: 2.75,
  houseBalance: 25000,
  totalVolume: 1000,
  houseProfit: 175,
  maintenanceMode: false,
  leaderboardVisible: true,
  updatedAt: '2026-11-23T10:00:00.000Z',
};

test('validateUsername enforces length and character constraints', () => {
  assert.equal(validateUsername('ab').ok, false);
  assert.equal(validateUsername('bad name!').ok, false);
  const ok = validateUsername('  Ace_Player7 ');
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.clean, 'Ace_Player7');
  }
});

test('validateBetInput allows valid Slot 1 and Slot 2 bets only in BETTING phase', () => {
  const valid = validateBetInput({
    phase: 'BETTING',
    balance: 200,
    stake: 50,
    color: 'GREEN',
    slotIndex: 1,
    existingBetInSlot: undefined,
    minBet: 5,
    maxBet: 1000,
    isBanned: false,
    maintenanceMode: false,
  });
  assert.equal(valid.ok, true);

  const wrongPhase = validateBetInput({
    phase: 'PICKING',
    balance: 200,
    stake: 50,
    color: 'BLUE',
    slotIndex: 2,
    existingBetInSlot: undefined,
    minBet: 5,
    maxBet: 1000,
    isBanned: false,
    maintenanceMode: false,
  });
  assert.equal(wrongPhase.ok, false);

  const lowBalance = validateBetInput({
    phase: 'BETTING',
    balance: 20,
    stake: 50,
    color: 'ORANGE',
    slotIndex: 1,
    existingBetInSlot: undefined,
    minBet: 5,
    maxBet: 1000,
    isBanned: false,
    maintenanceMode: false,
  });
  assert.equal(lowBalance.ok, false);
});

test('validatePickChange allows updating color only during PICKING phase for an active pending bet', () => {
  const activeBet: BetRecord = {
    betId: 'bet-1',
    userId: 'u1',
    username: 'alice',
    roundId: 'r-1',
    roundNumber: 1,
    slotIndex: 1,
    selectedColor: 'GREEN',
    stake: 50,
    status: 'pending',
    payout: 0,
    createdAt: '2026-11-23T10:00:00.000Z',
  };

  const allowed = validatePickChange({
    phase: 'PICKING',
    existingBet: activeBet,
    newColor: 'ORANGE',
    isBanned: false,
  });
  assert.equal(allowed.ok, true);

  const blocked = validatePickChange({
    phase: 'REVEAL',
    existingBet: activeBet,
    newColor: 'BLUE',
    isBanned: false,
  });
  assert.equal(blocked.ok, false);
});

test('settleRoundBets calculates exact payouts and house profit delta', () => {
  const bets: BetRecord[] = [
    {
      betId: 'b1',
      userId: 'u1',
      username: 'alice',
      roundId: 'r1',
      roundNumber: 1,
      slotIndex: 1,
      selectedColor: 'GREEN',
      stake: 100,
      status: 'pending',
      payout: 0,
      createdAt: '2026-11-23T10:00:00.000Z',
    },
    {
      betId: 'b2',
      userId: 'u1',
      username: 'alice',
      roundId: 'r1',
      roundNumber: 1,
      slotIndex: 2,
      selectedColor: 'BLUE',
      stake: 50,
      status: 'pending',
      payout: 0,
      createdAt: '2026-11-23T10:00:00.000Z',
    },
  ];

  assert.equal(calculatePayout(100, 'GREEN', 'GREEN', 2.75), 275);
  assert.equal(calculatePayout(50, 'BLUE', 'GREEN', 2.75), 0);

  const result = settleRoundBets(bets, 'GREEN', 2.75, '2026-11-23T10:01:00.000Z');
  assert.equal(result.totalPool, 150);
  assert.equal(result.totalPayout, 275);
  assert.equal(result.houseDelta, -125);
  assert.equal(result.settledBets[0].status, 'won');
  assert.equal(result.settledBets[1].status, 'lost');
});

test('deposit, withdrawal, and withdrawal cancellation enforce ownership and pending status', () => {
  assert.equal(validateDepositRequest(2).ok, false);
  assert.equal(validateDepositRequest(250).ok, true);
  assert.equal(validateWithdrawalRequest(500, 100).ok, false);
  assert.equal(validateWithdrawalRequest(75, 100).ok, true);

  const pendingWd: TransactionRecord = {
    txId: 'tx1',
    userId: 'u1',
    username: 'alice',
    type: 'withdrawal',
    amount: 75,
    status: 'pending',
    note: 'Bank transfer',
    createdAt: '2026-11-23T10:00:00.000Z',
  };

  assert.equal(canCancelWithdrawal(pendingWd, 'u1').ok, true);
  assert.equal(canCancelWithdrawal(pendingWd, 'u2').ok, false);
  assert.equal(canCancelWithdrawal({ ...pendingWd, status: 'approved' }, 'u1').ok, false);
});

test('phase progression cycles through BETTING -> COLOR_DRAW -> PICKING -> REVEAL -> BETTING', () => {
  assert.deepEqual(nextPhaseAfter('BETTING'), { phase: 'COLOR_DRAW', isNewRound: false });
  assert.deepEqual(nextPhaseAfter('COLOR_DRAW'), { phase: 'PICKING', isNewRound: false });
  assert.deepEqual(nextPhaseAfter('PICKING'), { phase: 'REVEAL', isNewRound: false });
  assert.deepEqual(nextPhaseAfter('REVEAL'), { phase: 'BETTING', isNewRound: true });
});

test('buildLeaderboard and computeHouseReport aggregate player stats and house metrics', () => {
  const players: PlayerProfile[] = [
    {
      userId: 'u1',
      username: 'alice',
      balance: 400,
      totalWagered: 300,
      totalWon: 550,
      winsCount: 4,
      gamesPlayed: 6,
      isBanned: false,
      role: 'player',
      createdAt: '2026-11-23T10:00:00.000Z',
      updatedAt: '2026-11-23T10:00:00.000Z',
    },
    {
      userId: 'u2',
      username: 'bob',
      balance: 200,
      totalWagered: 500,
      totalWon: 250,
      winsCount: 2,
      gamesPlayed: 8,
      isBanned: false,
      role: 'player',
      createdAt: '2026-11-23T10:00:00.000Z',
      updatedAt: '2026-11-23T10:00:00.000Z',
    },
  ];
  const board = buildLeaderboard(players);
  assert.equal(board.length, 2);
  assert.equal(board[0].username, 'alice');
  assert.equal(board[0].winsCount, 4);
  assert.equal('totalWon' in board[0], false);
  assert.equal('totalWagered' in board[0], false);
  assert.equal('netProfit' in board[0], false);

  const rounds: RoundSummary[] = [
    {
      roundId: 'r1',
      roundNumber: 1,
      phase: 'REVEAL',
      commitHash: 'a'.repeat(64),
      winningColor: 'ORANGE',
      revealSalt: 'salt1234',
      totalPool: 1000,
      totalPayout: 825,
      betCount: 10,
      poolByColor: { GREEN: 300, BLUE: 400, ORANGE: 300 },
      startedAt: '2026-11-23T10:00:00.000Z',
      settledAt: '2026-11-23T10:01:00.000Z',
    },
  ];

  const report = computeHouseReport(rounds, [], baseSettings);
  assert.equal(report.completedRoundsCount, 1);
  assert.equal(report.colorDistribution.ORANGE, 1);
  assert.equal(report.totalPayouts, 825);
});

test('adjustStakeAmount steps up/down, handles custom decimals, and clamps to [minBet, maxBet]', () => {
  assert.equal(adjustStakeAmount('25', 1, 5, 2500), 26);
  assert.equal(adjustStakeAmount('25', -1, 5, 2500), 24);
  assert.equal(adjustStakeAmount('25', 5, 5, 2500), 30);
  assert.equal(adjustStakeAmount('25', -5, 5, 2500), 20);
  assert.equal(adjustStakeAmount('25', 10, 5, 2500), 35);
  assert.equal(adjustStakeAmount('25', -10, 5, 2500), 15);
  assert.equal(adjustStakeAmount('5', -1, 5, 2500), 5);
  assert.equal(adjustStakeAmount('2498', 5, 5, 2500), 2500);
  assert.equal(adjustStakeAmount('12.5', 5, 5, 2500), 17.5);
  assert.equal(adjustStakeAmount('', 5, 5, 2500), 10);
  assert.equal(adjustStakeAmount('abc', -5, 5, 2500), 5);
});

test('shouldTriggerAutoBet fires once per BETTING round and disarms on low balance', () => {
  const base = {
    mode: 'auto' as const,
    autoArmed: true,
    autoColor: 'BLUE' as const,
    autoStake: 25,
    roundId: 'round-10',
    lastTriggeredRoundId: null as string | null,
    phase: 'BETTING' as const,
    hasActiveBet: false,
    isAuthenticated: true,
    isBusy: false,
    balance: 100,
    minBet: 5,
    maxBet: 2500,
  };

  assert.deepEqual(shouldTriggerAutoBet(base), { trigger: true });
  assert.deepEqual(shouldTriggerAutoBet({ ...base, lastTriggeredRoundId: 'round-10' }), { trigger: false });
  assert.deepEqual(shouldTriggerAutoBet({ ...base, phase: 'COLOR_DRAW' }), { trigger: false });
  assert.deepEqual(shouldTriggerAutoBet({ ...base, mode: 'manual' }), { trigger: false });

  const lowBal = shouldTriggerAutoBet({ ...base, balance: 10 });
  assert.equal(lowBal.trigger, false);
  if (!lowBal.trigger) {
    assert.equal(lowBal.disarm, true);
  }
});
