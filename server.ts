import crypto from 'node:crypto';
import path from 'node:path';
import express from 'express';
import dotenv from 'dotenv';
import { store, type StoredUser } from './server/store.ts';
import {
  type AuthenticatedRequest,
  hashSecret,
  isAdminSetupRequired,
  optionalAuth,
  requireAdmin,
  requireAuth,
  signSessionToken,
  verifyEnvPasscode,
  verifyFirebaseUser,
  verifySecret,
} from './server/auth.ts';
import { gameEngine } from './server/gameEngine.ts';
import {
  buildLeaderboard,
  canCancelWithdrawal,
  computeHouseReport,
  roundCurrency,
  validateDepositRequest,
  validateUsername,
  validateWithdrawalRequest,
} from './src/shared/gameRules.ts';
import type { TransactionRecord } from './src/shared/types.ts';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '256kb' }));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'b-will' });
});

// --- Public Game State & SSE ---
app.get('/api/game/state', optionalAuth, (req: AuthenticatedRequest, res) => {
  const round = gameEngine.getPublicState();
  const recentRounds = store.state.rounds.slice(0, 20);
  const myBets = req.auth && req.auth.role === 'player'
    ? gameEngine.getUserActiveBets(req.auth.userId)
    : { slot1: null, slot2: null };

  res.json({
    round,
    recentRounds,
    myBets,
  });
});

app.get('/api/game/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  gameEngine.addSseClient(res);

  req.on('close', () => {
    gameEngine.removeSseClient(res);
  });
});

app.get('/api/leaderboard', (_req, res) => {
  if (!store.state.settings.leaderboardVisible) {
    return res.json({ visible: false, entries: [] });
  }
  const entries = buildLeaderboard(Object.values(store.state.users), 25);
  res.json({ visible: true, entries });
});

// --- Player Authentication ---
app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const usernameCheck = validateUsername(username);
  if (!usernameCheck.ok) {
    return res.status(400).json({ error: usernameCheck.error });
  }
  if (password.length < 6 || password.length > 128) {
    return res.status(400).json({ error: 'Password must be between 6 and 128 characters.' });
  }

  const lower = usernameCheck.clean.toLowerCase();
  if (store.state.usernames[lower]) {
    return res.status(409).json({ error: 'That username is already taken. Choose another.' });
  }

  const nowIso = new Date().toISOString();
  const userId = `plr-${crypto.randomBytes(8).toString('hex')}`;
  const { hash, salt } = hashSecret(password);

  const newUser: StoredUser = {
    userId,
    username: usernameCheck.clean,
    balance: 0,
    totalWagered: 0,
    totalWon: 0,
    winsCount: 0,
    gamesPlayed: 0,
    isBanned: false,
    role: 'player',
    passwordHash: hash,
    passwordSalt: salt,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  store.state.users[userId] = newUser;
  store.state.usernames[lower] = userId;
  store.save();

  const token = signSessionToken({
    userId,
    username: newUser.username,
    role: 'player',
  });

  res.status(201).json({
    token,
    user: store.toPublicProfile(newUser),
  });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const userId = store.state.usernames[username.trim().toLowerCase()];
  if (!userId) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  const user = store.state.users[userId];
  if (!user || !user.passwordHash || !user.passwordSalt) {
    return res.status(401).json({ error: 'This account uses Google Sign-In.' });
  }

  if (!verifySecret(password, user.passwordHash, user.passwordSalt)) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  if (user.isBanned) {
    return res.status(403).json({ error: 'This account has been suspended by an administrator.' });
  }

  const token = signSessionToken({
    userId: user.userId,
    username: user.username,
    role: user.role,
  });

  res.json({
    token,
    user: store.toPublicProfile(user),
  });
});

app.post('/api/auth/firebase', async (req, res) => {
  const { idToken, username } = req.body || {};
  if (typeof idToken !== 'string' || !idToken.trim()) {
    return res.status(400).json({ error: 'Firebase ID token is required.' });
  }

  try {
    const fbUser = await verifyFirebaseUser(idToken);
    let existing = Object.values(store.state.users).find((u) => u.firebaseUid === fbUser.uid);

    if (!existing) {
      if (typeof username !== 'string' || !username.trim()) {
        return res.status(200).json({
          needsUsername: true,
          email: fbUser.email,
          isOwnerAdmin: fbUser.isOwnerAdmin,
        });
      }

      const usernameCheck = validateUsername(username);
      if (!usernameCheck.ok) {
        return res.status(400).json({ error: usernameCheck.error });
      }
      const lower = usernameCheck.clean.toLowerCase();
      if (store.state.usernames[lower]) {
        return res.status(409).json({ error: 'That username is already taken.' });
      }

      const nowIso = new Date().toISOString();
      const userId = `fb-${fbUser.uid.slice(0, 20)}`;
      existing = {
        userId,
        firebaseUid: fbUser.uid,
        username: usernameCheck.clean,
        email: fbUser.email,
        balance: 0,
        totalWagered: 0,
        totalWon: 0,
        winsCount: 0,
        gamesPlayed: 0,
        isBanned: false,
        role: fbUser.isOwnerAdmin ? 'admin' : 'player',
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      store.state.users[userId] = existing;
      store.state.usernames[lower] = userId;
      store.save();
    } else if (fbUser.isOwnerAdmin && existing.role !== 'admin') {
      existing.role = 'admin';
      store.save();
    }

    if (existing.isBanned) {
      return res.status(403).json({ error: 'This account has been suspended.' });
    }

    const token = signSessionToken({
      userId: existing.userId,
      username: existing.username,
      role: existing.role,
    });

    res.json({
      needsUsername: false,
      token,
      user: store.toPublicProfile(existing),
    });
  } catch (error) {
    console.error('Firebase token verification failed:', error);
    res.status(401).json({ error: 'Invalid or expired Google session.' });
  }
});

// --- Authenticated Player Routes ---
app.get('/api/player/me', requireAuth, (req: AuthenticatedRequest, res) => {
  if (req.auth!.role === 'admin' && !store.state.users[req.auth!.userId]) {
    return res.json({
      user: null,
      activeBets: { slot1: null, slot2: null },
      bets: [],
      transactions: [],
    });
  }

  const user = store.state.users[req.auth!.userId];
  if (!user) {
    return res.status(404).json({ error: 'Player not found.' });
  }

  const activeBets = gameEngine.getUserActiveBets(user.userId);
  const bets = store.state.bets
    .filter((b) => b.userId === user.userId)
    .slice(0, 60);
  const transactions = store.state.transactions
    .filter((t) => t.userId === user.userId)
    .slice(0, 60);

  res.json({
    user: store.toPublicProfile(user),
    activeBets,
    bets,
    transactions,
  });
});

app.post('/api/game/bet', requireAuth, (req: AuthenticatedRequest, res) => {
  const { slotIndex, color, stake } = req.body || {};
  const result = gameEngine.placeBet({
    userId: req.auth!.userId,
    slotIndex: Number(slotIndex),
    color,
    stake: Number(stake),
  });

  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }

  res.status(201).json({
    bet: result.bet,
    balance: result.balance,
    activeBets: gameEngine.getUserActiveBets(req.auth!.userId),
  });
});

app.post('/api/game/pick', requireAuth, (req: AuthenticatedRequest, res) => {
  const { slotIndex, color } = req.body || {};
  const result = gameEngine.updatePick({
    userId: req.auth!.userId,
    slotIndex: Number(slotIndex),
    color,
  });

  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }

  res.json({
    bet: result.bet,
    activeBets: gameEngine.getUserActiveBets(req.auth!.userId),
  });
});

// --- Player Wallet (Deposits, Withdrawals, Cancellation) ---
app.post('/api/wallet/deposit', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = store.state.users[req.auth!.userId];
  if (!user) {
    return res.status(404).json({ error: 'Player account not found.' });
  }
  if (user.isBanned) {
    return res.status(403).json({ error: 'Suspended accounts cannot submit deposit requests.' });
  }

  const amount = Number(req.body?.amount);
  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 240) : '';
  const check = validateDepositRequest(amount);
  if (!check.ok) {
    return res.status(400).json({ error: check.error });
  }

  const tx: TransactionRecord = {
    txId: `tx-dep-${crypto.randomBytes(6).toString('hex')}`,
    userId: user.userId,
    username: user.username,
    type: 'deposit',
    amount: check.amount,
    status: 'pending',
    note: note || 'Player deposit request',
    createdAt: new Date().toISOString(),
  };

  store.state.transactions.unshift(tx);
  store.save();

  res.status(201).json({
    transaction: tx,
    balance: user.balance,
  });
});

app.post('/api/wallet/withdraw', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = store.state.users[req.auth!.userId];
  if (!user) {
    return res.status(404).json({ error: 'Player account not found.' });
  }
  if (user.isBanned) {
    return res.status(403).json({ error: 'Suspended accounts cannot request withdrawals.' });
  }

  const amount = Number(req.body?.amount);
  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 240) : '';
  const check = validateWithdrawalRequest(amount, user.balance);
  if (!check.ok) {
    return res.status(400).json({ error: check.error });
  }

  // Reserve funds immediately so player cannot double-spend pending withdrawal
  user.balance = roundCurrency(user.balance - check.amount);
  user.updatedAt = new Date().toISOString();

  const tx: TransactionRecord = {
    txId: `tx-wd-${crypto.randomBytes(6).toString('hex')}`,
    userId: user.userId,
    username: user.username,
    type: 'withdrawal',
    amount: check.amount,
    status: 'pending',
    note: note || 'Player withdrawal request',
    createdAt: new Date().toISOString(),
  };

  store.state.transactions.unshift(tx);
  store.save();

  res.status(201).json({
    transaction: tx,
    balance: user.balance,
  });
});

app.post('/api/wallet/withdraw/:txId/cancel', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = store.state.users[req.auth!.userId];
  if (!user) {
    return res.status(404).json({ error: 'Player account not found.' });
  }

  const tx = store.state.transactions.find((t) => t.txId === req.params.txId);
  const check = canCancelWithdrawal(tx, user.userId);
  if (!check.ok) {
    return res.status(400).json({ error: check.error });
  }

  const nowIso = new Date().toISOString();
  tx!.status = 'cancelled';
  tx!.processedAt = nowIso;
  tx!.processedBy = user.userId;

  // Refund reserved amount back to available balance
  user.balance = roundCurrency(user.balance + tx!.amount);
  user.updatedAt = nowIso;
  store.save();

  res.json({
    transaction: tx,
    balance: user.balance,
  });
});

// --- Admin Authentication & Dashboard Routes ---
app.get('/api/admin/status', (_req, res) => {
  res.json(isAdminSetupRequired());
});

app.post('/api/admin/claim', (req, res) => {
  const { requiresSetup } = isAdminSetupRequired();
  if (!requiresSetup) {
    return res.status(409).json({ error: 'Administrator credentials are already configured.' });
  }

  const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode : '';
  if (passcode.length < 6 || passcode.length > 128) {
    return res.status(400).json({ error: 'Admin passcode must be between 6 and 128 characters.' });
  }

  const { hash, salt } = hashSecret(passcode);
  store.state.adminCredential = {
    passHash: hash,
    passSalt: salt,
    claimedAt: new Date().toISOString(),
  };
  store.save();

  const token = signSessionToken({
    userId: 'admin-console',
    username: 'Administrator',
    role: 'admin',
  });

  res.status(201).json({ token });
});

app.post('/api/admin/login', (req, res) => {
  const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode : '';
  if (!passcode) {
    return res.status(400).json({ error: 'Passcode is required.' });
  }

  const envPass = (process.env.ADMIN_PASSCODE || '').trim();
  let authorized = false;

  if (envPass.length > 0) {
    authorized = verifyEnvPasscode(passcode, envPass);
  } else if (store.state.adminCredential) {
    authorized = verifySecret(
      passcode,
      store.state.adminCredential.passHash,
      store.state.adminCredential.passSalt
    );
  } else {
    return res.status(400).json({ error: 'Admin setup has not been claimed yet.' });
  }

  if (!authorized) {
    return res.status(401).json({ error: 'Invalid administrator passcode.' });
  }

  const token = signSessionToken({
    userId: 'admin-console',
    username: 'Administrator',
    role: 'admin',
  });

  res.json({ token });
});

app.get('/api/admin/overview', requireAdmin, (_req, res) => {
  const players = Object.values(store.state.users)
    .map((u) => store.toPublicProfile(u))
    .sort((a, b) => b.balance - a.balance);

  const pendingDecisions = store.state.transactions.filter(
    (t) => (t.type === 'deposit' || t.type === 'withdrawal') && t.status === 'pending'
  );

  const recentTransactions = store.state.transactions.slice(0, 80);
  const completedRounds = store.state.rounds.slice(0, 50);
  const report = computeHouseReport(
    store.state.rounds,
    store.state.transactions,
    store.state.settings
  );
  const leaderboard = buildLeaderboard(Object.values(store.state.users), 25);

  res.json({
    report,
    settings: store.state.settings,
    players,
    pendingDecisions,
    recentTransactions,
    completedRounds,
    leaderboard,
  });
});

app.post('/api/admin/transactions/:txId/decision', requireAdmin, (req: AuthenticatedRequest, res) => {
  const { decision } = req.body || {};
  if (decision !== 'approve' && decision !== 'reject') {
    return res.status(400).json({ error: 'Decision must be "approve" or "reject".' });
  }

  const tx = store.state.transactions.find((t) => t.txId === req.params.txId);
  if (!tx) {
    return res.status(404).json({ error: 'Transaction not found.' });
  }
  if (tx.status !== 'pending') {
    return res.status(400).json({ error: `Transaction is already ${tx.status}.` });
  }
  if (tx.type !== 'deposit' && tx.type !== 'withdrawal') {
    return res.status(400).json({ error: 'Only deposit or withdrawal requests require decisions.' });
  }

  const user = store.state.users[tx.userId];
  if (!user) {
    return res.status(404).json({ error: 'Player account for this transaction not found.' });
  }

  const nowIso = new Date().toISOString();
  tx.status = decision === 'approve' ? 'approved' : 'rejected';
  tx.processedAt = nowIso;
  tx.processedBy = req.auth!.username;

  if (tx.type === 'deposit' && decision === 'approve') {
    user.balance = roundCurrency(user.balance + tx.amount);
    user.updatedAt = nowIso;
  } else if (tx.type === 'withdrawal' && decision === 'reject') {
    // Refund reserved withdrawal funds back to player
    user.balance = roundCurrency(user.balance + tx.amount);
    user.updatedAt = nowIso;
  }

  store.save();
  res.json({
    transaction: tx,
    player: store.toPublicProfile(user),
  });
});

app.patch('/api/admin/settings', requireAdmin, (req, res) => {
  const s = store.state.settings;
  const body = req.body || {};

  const num = (v: unknown, fallback: number, min: number, max: number) => {
    if (v === undefined) return fallback;
    const parsed = Number(v);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      throw new Error(`Value out of range [${min}, ${max}]`);
    }
    return parsed;
  };

  try {
    const bettingDurationSec = Math.round(num(body.bettingDurationSec, s.bettingDurationSec, 5, 120));
    const colorDrawDurationSec = Math.round(num(body.colorDrawDurationSec, s.colorDrawDurationSec, 2, 30));
    const pickingDurationSec = Math.round(num(body.pickingDurationSec, s.pickingDurationSec, 5, 120));
    const revealDurationSec = Math.round(num(body.revealDurationSec, s.revealDurationSec, 3, 30));
    const minBet = roundCurrency(num(body.minBet, s.minBet, 1, 10000));
    const maxBet = roundCurrency(num(body.maxBet, s.maxBet, minBet, 100000));
    const payoutMultiplier = roundCurrency(num(body.payoutMultiplier, s.payoutMultiplier, 1.1, 10));

    s.bettingDurationSec = bettingDurationSec;
    s.colorDrawDurationSec = colorDrawDurationSec;
    s.pickingDurationSec = pickingDurationSec;
    s.revealDurationSec = revealDurationSec;
    s.minBet = minBet;
    s.maxBet = maxBet;
    s.payoutMultiplier = payoutMultiplier;
    if (typeof body.maintenanceMode === 'boolean') s.maintenanceMode = body.maintenanceMode;
    if (typeof body.leaderboardVisible === 'boolean') s.leaderboardVisible = body.leaderboardVisible;
    s.updatedAt = new Date().toISOString();

    store.save();
    gameEngine.broadcastState();
    res.json({ settings: s });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid settings values.' });
  }
});

app.patch('/api/admin/players/:userId', requireAdmin, (req: AuthenticatedRequest, res) => {
  const user = store.state.users[req.params.userId];
  if (!user) {
    return res.status(404).json({ error: 'Player not found.' });
  }

  const body = req.body || {};
  const nowIso = new Date().toISOString();

  if (typeof body.isBanned === 'boolean') {
    user.isBanned = body.isBanned;
  }

  if (body.resetStats === true) {
    user.totalWagered = 0;
    user.totalWon = 0;
    user.winsCount = 0;
    user.gamesPlayed = 0;
  }

  if (body.balanceDelta !== undefined) {
    const delta = roundCurrency(Number(body.balanceDelta));
    if (!Number.isFinite(delta) || delta === 0) {
      return res.status(400).json({ error: 'Balance adjustment must be a non-zero number.' });
    }
    const nextBalance = roundCurrency(user.balance + delta);
    if (nextBalance < 0) {
      return res.status(400).json({ error: 'Adjustment would result in a negative player balance.' });
    }
    user.balance = nextBalance;

    const adjTx: TransactionRecord = {
      txId: `tx-adj-${crypto.randomBytes(6).toString('hex')}`,
      userId: user.userId,
      username: user.username,
      type: 'adjustment',
      amount: Math.abs(delta),
      status: 'completed',
      note:
        typeof body.note === 'string' && body.note.trim()
          ? body.note.trim().slice(0, 240)
          : `Admin balance ${delta > 0 ? 'credit' : 'debit'} (${delta > 0 ? '+' : '-'}$${Math.abs(delta).toFixed(2)})`,
      createdAt: nowIso,
      processedAt: nowIso,
      processedBy: req.auth!.username,
    };
    store.state.transactions.unshift(adjTx);
  }

  user.updatedAt = nowIso;
  store.save();

  res.json({ player: store.toPublicProfile(user) });
});

app.post('/api/admin/house/adjust', requireAdmin, (req, res) => {
  const delta = roundCurrency(Number(req.body?.delta));
  if (!Number.isFinite(delta) || delta === 0) {
    return res.status(400).json({ error: 'House balance adjustment must be non-zero.' });
  }
  const next = roundCurrency(store.state.settings.houseBalance + delta);
  if (next < 0) {
    return res.status(400).json({ error: 'House balance cannot go below $0.00.' });
  }
  store.state.settings.houseBalance = next;
  store.state.settings.updatedAt = new Date().toISOString();
  store.save();
  res.json({ houseBalance: next });
});

// --- Server Boot & Vite / Static Middleware ---
async function startServer() {
  gameEngine.start();

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`B-WILL server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
