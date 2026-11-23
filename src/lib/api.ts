import {
  BetRecord,
  BetSlotIndex,
  FinancialReport,
  GameColor,
  GameSettings,
  LeaderboardEntry,
  PlayerProfile,
  PublicRoundState,
  RoundSummary,
  TransactionRecord,
} from '../shared/types';

// Keep tokens strictly in memory (never in localStorage or sessionStorage)
let playerToken: string | null = null;
let adminToken: string | null = null;

export function setPlayerToken(token: string | null): void {
  playerToken = token;
}

export function getPlayerToken(): string | null {
  return playerToken;
}

export function setAdminToken(token: string | null): void {
  adminToken = token;
}

export function getAdminToken(): string | null {
  return adminToken;
}

async function request<T>(
  url: string,
  options: RequestInit = {},
  authMode: 'none' | 'player' | 'admin' = 'none'
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (authMode === 'player' && playerToken) {
    headers.set('Authorization', `Bearer ${playerToken}`);
  } else if (authMode === 'admin' && adminToken) {
    headers.set('Authorization', `Bearer ${adminToken}`);
  }

  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  if (!res.ok) {
    const message =
      typeof data.error === 'string' && data.error
        ? data.error
        : `Request failed with status ${res.status}`;
    throw new Error(message);
  }

  return data as T;
}

export interface GameStateResponse {
  round: PublicRoundState;
  recentRounds: RoundSummary[];
  myBets: {
    slot1: BetRecord | null;
    slot2: BetRecord | null;
  };
}

export interface PlayerDashboardResponse {
  user: PlayerProfile | null;
  activeBets: {
    slot1: BetRecord | null;
    slot2: BetRecord | null;
  };
  bets: BetRecord[];
  transactions: TransactionRecord[];
}

export interface AdminOverviewResponse {
  report: FinancialReport;
  settings: GameSettings;
  players: PlayerProfile[];
  pendingDecisions: TransactionRecord[];
  recentTransactions: TransactionRecord[];
  completedRounds: RoundSummary[];
  leaderboard: LeaderboardEntry[];
}

export const api = {
  getGameState: () =>
    request<GameStateResponse>('/api/game/state', {}, playerToken ? 'player' : 'none'),

  getLeaderboard: () =>
    request<{ visible: boolean; entries: LeaderboardEntry[] }>('/api/leaderboard'),

  register: (username: string, password: string) =>
    request<{ token: string; user: PlayerProfile }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  login: (username: string, password: string) =>
    request<{ token: string; user: PlayerProfile }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  firebaseAuth: (idToken: string, username?: string) =>
    request<{
      needsUsername: boolean;
      email?: string;
      isOwnerAdmin?: boolean;
      token?: string;
      user?: PlayerProfile;
    }>('/api/auth/firebase', {
      method: 'POST',
      body: JSON.stringify({ idToken, username }),
    }),

  getMyProfile: () => request<PlayerDashboardResponse>('/api/player/me', {}, 'player'),

  placeBet: (slotIndex: BetSlotIndex, color: GameColor, stake: number) =>
    request<{
      bet: BetRecord;
      balance: number;
      activeBets: { slot1: BetRecord | null; slot2: BetRecord | null };
    }>(
      '/api/game/bet',
      {
        method: 'POST',
        body: JSON.stringify({ slotIndex, color, stake }),
      },
      'player'
    ),

  updatePick: (slotIndex: BetSlotIndex, color: GameColor) =>
    request<{
      bet: BetRecord;
      activeBets: { slot1: BetRecord | null; slot2: BetRecord | null };
    }>(
      '/api/game/pick',
      {
        method: 'POST',
        body: JSON.stringify({ slotIndex, color }),
      },
      'player'
    ),

  requestDeposit: (amount: number, note: string) =>
    request<{ transaction: TransactionRecord; balance: number }>(
      '/api/wallet/deposit',
      {
        method: 'POST',
        body: JSON.stringify({ amount, note }),
      },
      'player'
    ),

  requestWithdrawal: (amount: number, note: string) =>
    request<{ transaction: TransactionRecord; balance: number }>(
      '/api/wallet/withdraw',
      {
        method: 'POST',
        body: JSON.stringify({ amount, note }),
      },
      'player'
    ),

  cancelWithdrawal: (txId: string) =>
    request<{ transaction: TransactionRecord; balance: number }>(
      `/api/wallet/withdraw/${encodeURIComponent(txId)}/cancel`,
      { method: 'POST' },
      'player'
    ),

  getAdminStatus: () =>
    request<{ requiresSetup: boolean; envConfigured: boolean }>('/api/admin/status'),

  claimAdmin: (passcode: string) =>
    request<{ token: string }>('/api/admin/claim', {
      method: 'POST',
      body: JSON.stringify({ passcode }),
    }),

  loginAdmin: (passcode: string) =>
    request<{ token: string }>('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ passcode }),
    }),

  getAdminOverview: () => request<AdminOverviewResponse>('/api/admin/overview', {}, 'admin'),

  decideTransaction: (txId: string, decision: 'approve' | 'reject') =>
    request<{ transaction: TransactionRecord; player: PlayerProfile }>(
      `/api/admin/transactions/${encodeURIComponent(txId)}/decision`,
      {
        method: 'POST',
        body: JSON.stringify({ decision }),
      },
      'admin'
    ),

  updateSettings: (payload: Partial<GameSettings>) =>
    request<{ settings: GameSettings }>(
      '/api/admin/settings',
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
      'admin'
    ),

  updatePlayerAdmin: (
    userId: string,
    payload: { isBanned?: boolean; resetStats?: boolean; balanceDelta?: number; note?: string }
  ) =>
    request<{ player: PlayerProfile }>(
      `/api/admin/players/${encodeURIComponent(userId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
      'admin'
    ),

  adjustHouseBalance: (delta: number) =>
    request<{ houseBalance: number }>(
      '/api/admin/house/adjust',
      {
        method: 'POST',
        body: JSON.stringify({ delta }),
      },
      'admin'
    ),
};
