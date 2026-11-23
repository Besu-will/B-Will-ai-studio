import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  BetRecord,
  GameColor,
  GameSettings,
  PlayerProfile,
  RoundSummary,
  TransactionRecord,
} from '../src/shared/types.ts';
import { roundCurrency } from '../src/shared/gameRules.ts';

export interface StoredUser extends PlayerProfile {
  passwordHash?: string;
  passwordSalt?: string;
  firebaseUid?: string;
}

export interface StoreData {
  users: Record<string, StoredUser>;
  usernames: Record<string, string>; // lowercase username -> userId
  rounds: RoundSummary[];
  bets: BetRecord[];
  transactions: TransactionRecord[];
  settings: GameSettings;
  nextRoundNumber: number;
  adminCredential?: {
    passHash: string;
    passSalt: string;
    claimedAt: string;
  };
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'bwill-store.json');

function createSeedStore(): StoreData {
  const now = Date.now();
  const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();

  const demoPlayers: StoredUser[] = [
    {
      userId: 'player-marcus',
      username: 'MarcusV',
      balance: 1420.5,
      totalWagered: 3800,
      totalWon: 4620.5,
      winsCount: 19,
      gamesPlayed: 42,
      isBanned: false,
      role: 'player',
      createdAt: iso(-86400_000 * 14),
      updatedAt: iso(-300_000),
    },
    {
      userId: 'player-elena',
      username: 'Elena_K',
      balance: 965.0,
      totalWagered: 2950,
      totalWon: 3485.0,
      winsCount: 15,
      gamesPlayed: 34,
      isBanned: false,
      role: 'player',
      createdAt: iso(-86400_000 * 11),
      updatedAt: iso(-420_000),
    },
    {
      userId: 'player-soren',
      username: 'Soren99',
      balance: 710.25,
      totalWagered: 2100,
      totalWon: 2490.25,
      winsCount: 11,
      gamesPlayed: 28,
      isBanned: false,
      role: 'player',
      createdAt: iso(-86400_000 * 9),
      updatedAt: iso(-600_000),
    },
    {
      userId: 'player-nadia',
      username: 'Nadia_T',
      balance: 540.0,
      totalWagered: 1650,
      totalWon: 1870.0,
      winsCount: 9,
      gamesPlayed: 22,
      isBanned: false,
      role: 'player',
      createdAt: iso(-86400_000 * 6),
      updatedAt: iso(-900_000),
    },
    {
      userId: 'player-viktor',
      username: 'ViktorR',
      balance: 315.0,
      totalWagered: 1200,
      totalWon: 1125.0,
      winsCount: 5,
      gamesPlayed: 18,
      isBanned: false,
      role: 'player',
      createdAt: iso(-86400_000 * 4),
      updatedAt: iso(-1200_000),
    },
  ];

  const users: Record<string, StoredUser> = {};
  const usernames: Record<string, string> = {};
  for (const p of demoPlayers) {
    users[p.userId] = p;
    usernames[p.username.toLowerCase()] = p.userId;
  }

  const seedColors: GameColor[] = ['GREEN', 'ORANGE', 'BLUE', 'GREEN', 'BLUE', 'ORANGE', 'GREEN', 'BLUE'];
  const rounds: RoundSummary[] = seedColors.map((winningColor, i) => {
    const roundNumber = i + 1;
    const roundId = `round-${String(roundNumber).padStart(4, '0')}`;
    const salt = crypto.createHash('sha256').update(`seed-salt-${roundNumber}`).digest('hex').slice(0, 32);
    const commitHash = crypto.createHash('sha256').update(`${roundId}:${winningColor}:${salt}`).digest('hex');
    const startedAt = iso(-(seedColors.length - i) * 45_000);
    const settledAt = iso(-(seedColors.length - i) * 45_000 + 28_000);
    const poolGreen = 120 + (i * 35) % 180;
    const poolBlue = 140 + (i * 45) % 160;
    const poolOrange = 110 + (i * 25) % 150;
    const totalPool = roundCurrency(poolGreen + poolBlue + poolOrange);
    const winningPool = winningColor === 'GREEN' ? poolGreen : winningColor === 'BLUE' ? poolBlue : poolOrange;
    const totalPayout = roundCurrency(winningPool * 2.75);

    return {
      roundId,
      roundNumber,
      phase: 'REVEAL',
      commitHash,
      winningColor,
      revealSalt: salt,
      totalPool,
      totalPayout,
      betCount: 6 + (i % 5),
      poolByColor: {
        GREEN: poolGreen,
        BLUE: poolBlue,
        ORANGE: poolOrange,
      },
      startedAt,
      settledAt,
    };
  });

  // Sort newest first
  rounds.sort((a, b) => b.roundNumber - a.roundNumber);

  const transactions: TransactionRecord[] = [
    {
      txId: 'tx-seed-dep-1',
      userId: 'player-marcus',
      username: 'MarcusV',
      type: 'deposit',
      amount: 150,
      status: 'pending',
      note: 'Bank wire reference #BW-8412',
      createdAt: iso(-180_000),
    },
    {
      txId: 'tx-seed-wd-1',
      userId: 'player-elena',
      username: 'Elena_K',
      type: 'withdrawal',
      amount: 80,
      status: 'pending',
      note: 'Payout to verified account',
      createdAt: iso(-120_000),
    },
    {
      txId: 'tx-seed-dep-0',
      userId: 'player-soren',
      username: 'Soren99',
      type: 'deposit',
      amount: 500,
      status: 'approved',
      note: 'Initial account funding',
      createdAt: iso(-86400_000 * 2),
      processedAt: iso(-86400_000 * 2 + 60_000),
      processedBy: 'system',
    },
  ];

  const settings: GameSettings = {
    bettingDurationSec: 14,
    colorDrawDurationSec: 3,
    pickingDurationSec: 9,
    revealDurationSec: 5,
    minBet: 5,
    maxBet: 2500,
    payoutMultiplier: 2.75,
    houseBalance: 48500,
    totalVolume: 11700,
    houseProfit: 1425.75,
    maintenanceMode: false,
    leaderboardVisible: true,
    updatedAt: iso(0),
  };

  return {
    users,
    usernames,
    rounds,
    bets: [],
    transactions,
    settings,
    nextRoundNumber: seedColors.length + 1,
  };
}

class Store {
  private data: StoreData;

  constructor() {
    this.data = this.load();
  }

  private load(): StoreData {
    try {
      if (fs.existsSync(STORE_PATH)) {
        const raw = fs.readFileSync(STORE_PATH, 'utf8');
        const parsed = JSON.parse(raw) as StoreData;
        if (parsed && parsed.users && parsed.settings && Array.isArray(parsed.rounds)) {
          return parsed;
        }
      }
    } catch (err) {
      console.error('Failed to load existing store, creating fresh seed store:', err);
    }
    const seed = createSeedStore();
    this.persist(seed);
    return seed;
  }

  private persist(target: StoreData = this.data): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpPath = `${STORE_PATH}.${process.pid}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(target, null, 2), 'utf8');
    fs.renameSync(tmpPath, STORE_PATH);
  }

  get state(): StoreData {
    return this.data;
  }

  save(): void {
    this.persist(this.data);
  }

  toPublicProfile(user: StoredUser): PlayerProfile {
    return {
      userId: user.userId,
      username: user.username,
      balance: roundCurrency(user.balance),
      totalWagered: roundCurrency(user.totalWagered),
      totalWon: roundCurrency(user.totalWon),
      winsCount: user.winsCount,
      gamesPlayed: user.gamesPlayed,
      isBanned: user.isBanned,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}

export const store = new Store();
