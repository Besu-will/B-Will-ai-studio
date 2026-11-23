import React, { useCallback, useEffect, useState } from 'react';
import {
  api,
  AdminOverviewResponse,
  getAdminToken,
  setAdminToken,
} from '../lib/api';
import { signInWithGooglePopup } from '../lib/firebase';
import { GAME_COLORS, GameSettings } from '../shared/types';
import { COLOR_META, ColorShapeIcon } from './ColorMark';
import { ArrowLeft, Shield, RefreshCw } from 'lucide-react';

interface AdminDashboardProps {
  onExitAdmin: () => void;
  onRefreshGame: () => Promise<void>;
}

type AdminSection = 'overview' | 'decisions' | 'players' | 'rounds' | 'settings';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onExitAdmin,
  onRefreshGame,
}) => {
  const [section, setSection] = useState<AdminSection>('overview');
  const [isAuthed, setIsAuthed] = useState<boolean>(Boolean(getAdminToken()));
  const [requiresSetup, setRequiresSetup] = useState<boolean>(false);
  const [passcode, setPasscode] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Settings draft state
  const [settingsDraft, setSettingsDraft] = useState<Partial<GameSettings>>({});
  const [houseDelta, setHouseDelta] = useState('1000');
  const [playerSearch, setPlayerSearch] = useState('');
  const [adjustPlayerId, setAdjustPlayerId] = useState<string | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('100');
  const [adjustNote, setAdjustNote] = useState('');

  const loadOverview = useCallback(async () => {
    setLoadingData(true);
    try {
      const data = await api.getAdminOverview();
      setOverview(data);
      setSettingsDraft(data.settings);
      setIsAuthed(true);
    } catch (err) {
      setIsAuthed(false);
      setAdminToken(null);
      setAuthError(err instanceof Error ? err.message : 'Admin session invalid.');
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (getAdminToken()) {
      loadOverview();
    } else {
      api
        .getAdminStatus()
        .then((res) => setRequiresSetup(res.requiresSetup))
        .catch(() => {});
    }
  }, [loadOverview]);

  const handlePasscodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      const res = requiresSetup
        ? await api.claimAdmin(passcode)
        : await api.loginAdmin(passcode);
      setAdminToken(res.token);
      setPasscode('');
      setIsAuthed(true);
      await loadOverview();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleAdmin = async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const idToken = await signInWithGooglePopup();
      const res = await api.firebaseAuth(idToken);
      if (res.token && res.user?.role === 'admin') {
        setAdminToken(res.token);
        setIsAuthed(true);
        await loadOverview();
      } else {
        setAuthError('This Google account does not have administrator privileges.');
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google Admin verification failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleDecision = async (txId: string, decision: 'approve' | 'reject') => {
    setActionMsg(null);
    try {
      await api.decideTransaction(txId, decision);
      setActionMsg({
        type: 'success',
        text: `Request ${decision === 'approve' ? 'approved' : 'rejected'} successfully.`,
      });
      await loadOverview();
      await onRefreshGame();
    } catch (err) {
      setActionMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to process decision.',
      });
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionMsg(null);
    try {
      await api.updateSettings(settingsDraft);
      setActionMsg({ type: 'success', text: 'Game and betting settings updated.' });
      await loadOverview();
      await onRefreshGame();
    } catch (err) {
      setActionMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update settings.',
      });
    }
  };

  const handleHouseAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionMsg(null);
    try {
      await api.adjustHouseBalance(Number(houseDelta));
      setActionMsg({ type: 'success', text: 'House balance adjusted.' });
      await loadOverview();
    } catch (err) {
      setActionMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to adjust house balance.',
      });
    }
  };

  const handlePlayerUpdate = async (
    userId: string,
    payload: { isBanned?: boolean; resetStats?: boolean; balanceDelta?: number; note?: string }
  ) => {
    setActionMsg(null);
    try {
      await api.updatePlayerAdmin(userId, payload);
      setActionMsg({ type: 'success', text: 'Player account updated.' });
      setAdjustPlayerId(null);
      setAdjustNote('');
      await loadOverview();
    } catch (err) {
      setActionMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update player.',
      });
    }
  };

  // --- Admin Login / Setup Gate ---
  if (!isAuthed) {
    return (
      <div className="min-h-screen bg-[#080B0F] text-slate-100 flex flex-col">
        <header className="border-b border-white/10 bg-[#0D1219] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-amber-400" />
            <span className="font-display font-bold text-lg text-white">B-WILL Admin Console</span>
          </div>
          <button
            type="button"
            onClick={onExitAdmin}
            className="inline-flex items-center gap-2 text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Player Arena
          </button>
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-[#121821] border border-white/15 rounded-xl p-6 space-y-5">
            <div>
              <h1 className="text-xl font-display font-bold text-white">
                {requiresSetup ? 'Claim Administrator Access' : 'Administrator Sign-In'}
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                {requiresSetup
                  ? 'First-run setup: choose an administrator passcode to secure this console.'
                  : 'Enter your administrator passcode or sign in with an authorized Google Admin account.'}
              </p>
            </div>

            <form onSubmit={handlePasscodeSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="admin-passcode" className="block text-xs font-medium text-slate-300">
                  {requiresSetup ? 'New Administrator Passcode' : 'Administrator Passcode'}
                </label>
                <input
                  id="admin-passcode"
                  type="password"
                  required
                  minLength={6}
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full bg-[#0B0F14] border border-white/15 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                />
              </div>

              {authError && (
                <p role="alert" className="text-xs text-rose-300 bg-rose-950/40 border border-rose-500/25 rounded-lg px-3 py-2">
                  {authError}
                </p>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full min-h-[44px] bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold text-sm rounded-lg transition-colors cursor-pointer"
              >
                {authLoading
                  ? 'Verifying...'
                  : requiresSetup
                    ? 'Set Admin Passcode & Enter'
                    : 'Unlock Admin Dashboard'}
              </button>
            </form>

            <div className="relative flex items-center py-1">
              <div className="flex-grow border-t border-white/10" />
              <span className="px-3 text-xs text-slate-500">or</span>
              <div className="flex-grow border-t border-white/10" />
            </div>

            <button
              type="button"
              disabled={authLoading}
              onClick={handleGoogleAdmin}
              className="w-full min-h-[42px] bg-[#0B0F14] hover:bg-[#161E29] border border-white/15 text-slate-200 text-sm font-medium rounded-lg transition-colors cursor-pointer"
            >
              Verify with Google Admin
            </button>
          </div>
        </main>
      </div>
    );
  }

  const filteredPlayers = (overview?.players || []).filter((p) =>
    p.username.toLowerCase().includes(playerSearch.trim().toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#080B0F] text-slate-100 flex flex-col">
      {/* Separate Administrative Top Bar */}
      <header className="border-b border-white/10 bg-[#0D1219] px-4 md:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <Shield className="w-5 h-5 text-amber-400" />
            <span className="font-display font-bold text-lg text-white whitespace-nowrap">
              B-WILL Admin
            </span>
          </div>

          <nav className="flex items-center gap-1 overflow-x-auto max-w-full min-w-0" aria-label="Admin Navigation">
            {(
              [
                ['overview', 'Overview & Reports'],
                ['decisions', `Pending (${overview?.pendingDecisions.length ?? 0})`],
                ['players', 'Players'],
                ['rounds', 'Completed Rounds'],
                ['settings', 'Game Settings'],
              ] as [AdminSection, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSection(key)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  section === key
                    ? 'bg-amber-500/20 text-amber-200 border border-amber-400/40'
                    : 'text-slate-400 hover:text-white border border-transparent'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={loadOverview}
              aria-label="Refresh admin data"
              className="p-2 rounded-lg border border-white/10 text-slate-300 hover:text-white hover:bg-white/5 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loadingData ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onExitAdmin}
              className="px-3.5 py-2 text-xs font-semibold bg-[#18212E] hover:bg-[#222E40] border border-white/10 text-white rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              Exit to Player Arena
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-8 py-6 space-y-6">
        {actionMsg && (
          <div
            role="status"
            className={`rounded-lg px-4 py-3 text-sm border ${
              actionMsg.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
                : 'bg-rose-950/40 border-rose-500/30 text-rose-200'
            }`}
          >
            {actionMsg.text}
          </div>
        )}

        {!overview ? (
          <div className="p-10 text-center text-sm text-slate-400">Loading administrative data...</div>
        ) : (
          <>
            {/* SECTION: OVERVIEW & FINANCIAL REPORTS */}
            {section === 'overview' && (
              <div className="space-y-6">
                <section className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                  <div className="bg-[#121821] border border-white/10 rounded-xl p-4">
                    <div className="text-xs text-slate-400">House Balance</div>
                    <div className="text-2xl font-mono font-bold tabular-nums text-emerald-300 mt-1">
                      ${overview.report.houseBalance.toFixed(2)}
                    </div>
                  </div>
                  <div className="bg-[#121821] border border-white/10 rounded-xl p-4">
                    <div className="text-xs text-slate-400">Total Betting Volume</div>
                    <div className="text-2xl font-mono font-bold tabular-nums text-white mt-1">
                      ${overview.report.totalVolume.toFixed(2)}
                    </div>
                  </div>
                  <div className="bg-[#121821] border border-white/10 rounded-xl p-4">
                    <div className="text-xs text-slate-400">House Net Profit</div>
                    <div
                      className={`text-2xl font-mono font-bold tabular-nums mt-1 ${
                        overview.report.houseProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      {overview.report.houseProfit >= 0 ? '+' : '-'}$
                      {Math.abs(overview.report.houseProfit).toFixed(2)}
                    </div>
                  </div>
                  <div className="bg-[#121821] border border-white/10 rounded-xl p-4">
                    <div className="text-xs text-slate-400">Completed Rounds</div>
                    <div className="text-2xl font-mono font-bold tabular-nums text-blue-300 mt-1">
                      {overview.report.completedRoundsCount}
                    </div>
                  </div>
                  <div className="bg-[#121821] border border-white/10 rounded-xl p-4">
                    <div className="text-xs text-slate-400">Pending Decisions</div>
                    <div className="text-2xl font-mono font-bold tabular-nums text-amber-300 mt-1">
                      {overview.pendingDecisions.length}
                    </div>
                  </div>
                </section>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Financial Summary & House Reserve Control */}
                  <section className="bg-[#121821] border border-white/10 rounded-xl p-5 space-y-4">
                    <h2 className="text-base font-display font-bold text-white">
                      Financial Report & House Reserve
                    </h2>
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <div className="bg-[#0B0F14] border border-white/5 rounded-lg p-3">
                        <dt className="text-xs text-slate-400">Approved Deposits</dt>
                        <dd className="font-mono font-semibold tabular-nums text-emerald-300 mt-1">
                          ${overview.report.totalApprovedDeposits.toFixed(2)}
                        </dd>
                      </div>
                      <div className="bg-[#0B0F14] border border-white/5 rounded-lg p-3">
                        <dt className="text-xs text-slate-400">Approved Withdrawals</dt>
                        <dd className="font-mono font-semibold tabular-nums text-blue-300 mt-1">
                          ${overview.report.totalApprovedWithdrawals.toFixed(2)}
                        </dd>
                      </div>
                      <div className="bg-[#0B0F14] border border-white/5 rounded-lg p-3">
                        <dt className="text-xs text-slate-400">Pending Deposits</dt>
                        <dd className="font-mono font-semibold tabular-nums text-amber-300 mt-1">
                          {overview.report.pendingDepositsCount} ($
                          {overview.report.pendingDepositsAmount.toFixed(2)})
                        </dd>
                      </div>
                      <div className="bg-[#0B0F14] border border-white/5 rounded-lg p-3">
                        <dt className="text-xs text-slate-400">Pending Withdrawals</dt>
                        <dd className="font-mono font-semibold tabular-nums text-amber-300 mt-1">
                          {overview.report.pendingWithdrawalsCount} ($
                          {overview.report.pendingWithdrawalsAmount.toFixed(2)})
                        </dd>
                      </div>
                    </dl>

                    <form onSubmit={handleHouseAdjust} className="pt-3 border-t border-white/10 flex flex-wrap items-end gap-3">
                      <div className="flex-1 min-w-[160px] space-y-1">
                        <label htmlFor="house-delta" className="block text-xs text-slate-300">
                          Adjust House Treasury ($ +/-)
                        </label>
                        <input
                          id="house-delta"
                          type="number"
                          step="0.01"
                          value={houseDelta}
                          onChange={(e) => setHouseDelta(e.target.value)}
                          className="w-full bg-[#0B0F14] border border-white/15 rounded-lg px-3 py-2 text-sm font-mono tabular-nums text-white"
                        />
                      </div>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap shrink-0"
                      >
                        Apply Adjustment
                      </button>
                    </form>
                  </section>

                  {/* Color Outcome Distribution */}
                  <section className="bg-[#121821] border border-white/10 rounded-xl p-5 space-y-4">
                    <h2 className="text-base font-display font-bold text-white">
                      Color Outcome Distribution
                    </h2>
                    <div className="space-y-3">
                      {GAME_COLORS.map((color) => {
                        const count = overview.report.colorDistribution[color] || 0;
                        const total = Math.max(1, overview.report.completedRoundsCount);
                        const pct = Math.round((count / total) * 100);
                        return (
                          <div key={color} className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs font-mono">
                              <span className={`inline-flex items-center gap-2 font-semibold ${COLOR_META[color].textAccent}`}>
                                <ColorShapeIcon color={color} className="w-4 h-4" />
                                {color}
                              </span>
                              <span className="tabular-nums text-slate-300">
                                {count} rounds ({pct}%)
                              </span>
                            </div>
                            <div className="h-2.5 bg-[#0B0F14] rounded-full overflow-hidden border border-white/5">
                              <div
                                className="h-full transition-all"
                                style={{
                                  width: `${pct}%`,
                                  backgroundColor: COLOR_META[color].hex,
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
                      <span>Leaderboard Visibility</span>
                      <button
                        type="button"
                        onClick={() =>
                          api
                            .updateSettings({
                              leaderboardVisible: !overview.settings.leaderboardVisible,
                            })
                            .then(loadOverview)
                        }
                        className="px-3 py-1.5 rounded-md border border-white/15 bg-[#0B0F14] text-slate-200 hover:text-white cursor-pointer"
                      >
                        {overview.settings.leaderboardVisible ? 'Visible (Click to Hide)' : 'Hidden (Click to Show)'}
                      </button>
                    </div>
                  </section>
                </div>
              </div>
            )}

            {/* SECTION: PENDING DECISIONS & LEDGER */}
            {section === 'decisions' && (
              <div className="space-y-6">
                <section className="bg-[#121821] border border-white/10 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-white/10">
                    <h2 className="text-base font-display font-bold text-white">
                      Pending Deposit & Withdrawal Decisions
                    </h2>
                  </div>
                  {overview.pendingDecisions.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-400">
                      No pending deposit or withdrawal decisions at this moment.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="text-xs text-slate-400 border-b border-white/10 bg-[#0E131B]">
                          <tr>
                            <th className="py-3 px-4 font-medium">Player</th>
                            <th className="py-3 px-4 font-medium">Type</th>
                            <th className="py-3 px-4 font-medium">Note</th>
                            <th className="py-3 px-4 font-medium text-right">Amount</th>
                            <th className="py-3 px-4 font-medium text-right">Decision</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {overview.pendingDecisions.map((tx) => (
                            <tr key={tx.txId} className="hover:bg-white/[0.02]">
                              <td className="py-3 px-4 font-semibold text-white">{tx.username}</td>
                              <td className="py-3 px-4 font-mono text-xs uppercase text-amber-300">
                                {tx.type}
                              </td>
                              <td className="py-3 px-4 text-xs text-slate-300">{tx.note}</td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums text-white">
                                ${tx.amount.toFixed(2)}
                              </td>
                              <td className="py-3 px-4 text-right space-x-2">
                                <button
                                  type="button"
                                  onClick={() => handleDecision(tx.txId, 'approve')}
                                  className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-md cursor-pointer"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDecision(tx.txId, 'reject')}
                                  className="px-3 py-1.5 text-xs font-semibold bg-rose-600/25 hover:bg-rose-600/40 border border-rose-500/40 text-rose-200 rounded-md cursor-pointer"
                                >
                                  Reject
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section className="bg-[#121821] border border-white/10 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-white/10">
                    <h2 className="text-base font-display font-bold text-white">
                      Recent Platform Transactions
                    </h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="text-xs text-slate-400 border-b border-white/10 bg-[#0E131B]">
                        <tr>
                          <th className="py-3 px-4 font-medium">Player</th>
                          <th className="py-3 px-4 font-medium">Type</th>
                          <th className="py-3 px-4 font-medium">Status</th>
                          <th className="py-3 px-4 font-medium">Note</th>
                          <th className="py-3 px-4 font-medium text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {overview.recentTransactions.slice(0, 25).map((tx) => (
                          <tr key={tx.txId}>
                            <td className="py-2.5 px-4 text-slate-200">{tx.username}</td>
                            <td className="py-2.5 px-4 font-mono text-xs uppercase text-slate-300">
                              {tx.type}
                            </td>
                            <td className="py-2.5 px-4 font-mono text-xs text-slate-300">
                              {tx.status.toUpperCase()}
                            </td>
                            <td className="py-2.5 px-4 text-xs text-slate-400 max-w-xs truncate">
                              {tx.note}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums text-white">
                              ${tx.amount.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            )}

            {/* SECTION: PLAYER MANAGEMENT */}
            {section === 'players' && (
              <section className="bg-[#121821] border border-white/10 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-white/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <h2 className="text-base font-display font-bold text-white">
                    Player Accounts ({filteredPlayers.length})
                  </h2>
                  <input
                    type="search"
                    value={playerSearch}
                    onChange={(e) => setPlayerSearch(e.target.value)}
                    placeholder="Filter by username..."
                    className="bg-[#0B0F14] border border-white/15 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 w-full sm:w-64"
                  />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs text-slate-400 border-b border-white/10 bg-[#0E131B]">
                      <tr>
                        <th className="py-3 px-4 font-medium">Username</th>
                        <th className="py-3 px-4 font-medium">Status</th>
                        <th className="py-3 px-4 font-medium text-right">Balance</th>
                        <th className="py-3 px-4 font-medium text-right">Wagered</th>
                        <th className="py-3 px-4 font-medium text-right">Won</th>
                        <th className="py-3 px-4 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredPlayers.map((p) => (
                        <React.Fragment key={p.userId}>
                          <tr className="hover:bg-white/[0.02]">
                            <td className="py-3 px-4 font-semibold text-white">{p.username}</td>
                            <td className="py-3 px-4 font-mono text-xs">
                              <span className={p.isBanned ? 'text-rose-300' : 'text-emerald-300'}>
                                {p.isBanned ? 'SUSPENDED' : 'ACTIVE'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-300">
                              ${p.balance.toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">
                              ${p.totalWagered.toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">
                              ${p.totalWon.toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() =>
                                  setAdjustPlayerId(
                                    adjustPlayerId === p.userId ? null : p.userId
                                  )
                                }
                                className="px-2.5 py-1 text-xs bg-[#0B0F14] border border-white/15 rounded hover:border-white/30 text-slate-200 cursor-pointer"
                              >
                                Adjust Balance
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handlePlayerUpdate(p.userId, { isBanned: !p.isBanned })
                                }
                                className="px-2.5 py-1 text-xs bg-[#0B0F14] border border-white/15 rounded hover:border-white/30 text-slate-200 cursor-pointer"
                              >
                                {p.isBanned ? 'Unban' : 'Suspend'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handlePlayerUpdate(p.userId, { resetStats: true })}
                                className="px-2.5 py-1 text-xs bg-[#0B0F14] border border-white/15 rounded hover:border-white/30 text-slate-300 cursor-pointer"
                              >
                                Reset Stats
                              </button>
                            </td>
                          </tr>
                          {adjustPlayerId === p.userId && (
                            <tr className="bg-[#0B0F14]">
                              <td colSpan={6} className="px-4 py-3">
                                <div className="flex flex-wrap items-center gap-3">
                                  <span className="text-xs text-slate-300">
                                    Adjust {p.username} balance ($ +/-):
                                  </span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={adjustAmount}
                                    onChange={(e) => setAdjustAmount(e.target.value)}
                                    className="w-32 bg-[#121821] border border-white/15 rounded px-2.5 py-1.5 text-xs font-mono text-white"
                                  />
                                  <input
                                    type="text"
                                    value={adjustNote}
                                    onChange={(e) => setAdjustNote(e.target.value)}
                                    placeholder="Audit reason"
                                    className="w-56 bg-[#121821] border border-white/15 rounded px-2.5 py-1.5 text-xs text-white"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handlePlayerUpdate(p.userId, {
                                        balanceDelta: Number(adjustAmount),
                                        note: adjustNote,
                                      })
                                    }
                                    className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded cursor-pointer"
                                  >
                                    Save Adjustment
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* SECTION: COMPLETED ROUNDS */}
            {section === 'rounds' && (
              <section className="bg-[#121821] border border-white/10 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-white/10">
                  <h2 className="text-base font-display font-bold text-white">
                    Completed Rounds Audit Log
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs text-slate-400 border-b border-white/10 bg-[#0E131B]">
                      <tr>
                        <th className="py-3 px-4 font-medium">Round</th>
                        <th className="py-3 px-4 font-medium">Winning Color</th>
                        <th className="py-3 px-4 font-medium">Commit Hash</th>
                        <th className="py-3 px-4 font-medium text-right">Bets</th>
                        <th className="py-3 px-4 font-medium text-right">Total Pool</th>
                        <th className="py-3 px-4 font-medium text-right">Total Payout</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {overview.completedRounds.map((r) => {
                        const winColor = r.winningColor || 'GREEN';
                        return (
                          <tr key={r.roundId} className="hover:bg-white/[0.02]">
                            <td className="py-3 px-4 font-mono tabular-nums text-white">
                              #{r.roundNumber}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`inline-flex items-center gap-1.5 font-mono text-xs font-semibold ${COLOR_META[winColor].textAccent}`}
                              >
                                <ColorShapeIcon color={winColor} className="w-3.5 h-3.5" />
                                {winColor}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-mono text-xs text-slate-400">
                              {r.commitHash.slice(0, 18)}...
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">
                              {r.betCount}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-200">
                              ${r.totalPool.toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-300">
                              ${r.totalPayout.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* SECTION: BETTING & GAME SETTINGS */}
            {section === 'settings' && (
              <form
                onSubmit={handleSaveSettings}
                className="bg-[#121821] border border-white/10 rounded-xl p-6 space-y-6 max-w-3xl"
              >
                <div>
                  <h2 className="text-lg font-display font-bold text-white">
                    Betting, Phase & Control Settings
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Changes take effect immediately for upcoming phases and stakes.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="set-betting-sec" className="block text-xs text-slate-300">
                      Betting Phase Duration (sec)
                    </label>
                    <input
                      id="set-betting-sec"
                      type="number"
                      min={5}
                      max={120}
                      value={settingsDraft.bettingDurationSec ?? 14}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          bettingDurationSec: Number(e.target.value),
                        })
                      }
                      className="w-full bg-[#0B0F14] border border-white/15 rounded-lg px-3 py-2 text-sm font-mono text-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="set-draw-sec" className="block text-xs text-slate-300">
                      Color Draw Transition (sec)
                    </label>
                    <input
                      id="set-draw-sec"
                      type="number"
                      min={2}
                      max={30}
                      value={settingsDraft.colorDrawDurationSec ?? 3}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          colorDrawDurationSec: Number(e.target.value),
                        })
                      }
                      className="w-full bg-[#0B0F14] border border-white/15 rounded-lg px-3 py-2 text-sm font-mono text-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="set-picking-sec" className="block text-xs text-slate-300">
                      Picking Phase Duration (sec)
                    </label>
                    <input
                      id="set-picking-sec"
                      type="number"
                      min={5}
                      max={120}
                      value={settingsDraft.pickingDurationSec ?? 9}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          pickingDurationSec: Number(e.target.value),
                        })
                      }
                      className="w-full bg-[#0B0F14] border border-white/15 rounded-lg px-3 py-2 text-sm font-mono text-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="set-reveal-sec" className="block text-xs text-slate-300">
                      Reveal Phase Duration (sec)
                    </label>
                    <input
                      id="set-reveal-sec"
                      type="number"
                      min={3}
                      max={30}
                      value={settingsDraft.revealDurationSec ?? 5}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          revealDurationSec: Number(e.target.value),
                        })
                      }
                      className="w-full bg-[#0B0F14] border border-white/15 rounded-lg px-3 py-2 text-sm font-mono text-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="set-min-bet" className="block text-xs text-slate-300">
                      Minimum Stake ($)
                    </label>
                    <input
                      id="set-min-bet"
                      type="number"
                      min={1}
                      step="0.01"
                      value={settingsDraft.minBet ?? 5}
                      onChange={(e) =>
                        setSettingsDraft({ ...settingsDraft, minBet: Number(e.target.value) })
                      }
                      className="w-full bg-[#0B0F14] border border-white/15 rounded-lg px-3 py-2 text-sm font-mono text-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="set-max-bet" className="block text-xs text-slate-300">
                      Maximum Stake ($)
                    </label>
                    <input
                      id="set-max-bet"
                      type="number"
                      min={5}
                      step="0.01"
                      value={settingsDraft.maxBet ?? 2500}
                      onChange={(e) =>
                        setSettingsDraft({ ...settingsDraft, maxBet: Number(e.target.value) })
                      }
                      className="w-full bg-[#0B0F14] border border-white/15 rounded-lg px-3 py-2 text-sm font-mono text-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="set-multiplier" className="block text-xs text-slate-300">
                      Winning Payout Multiplier (x)
                    </label>
                    <input
                      id="set-multiplier"
                      type="number"
                      min={1.1}
                      max={10}
                      step="0.05"
                      value={settingsDraft.payoutMultiplier ?? 2.75}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          payoutMultiplier: Number(e.target.value),
                        })
                      }
                      className="w-full bg-[#0B0F14] border border-white/15 rounded-lg px-3 py-2 text-sm font-mono text-white"
                    />
                  </div>
                </div>

                <div className="space-y-3 pt-3 border-t border-white/10">
                  <label className="flex items-center justify-between text-sm text-slate-200 cursor-pointer">
                    <span>Platform Maintenance Mode (Pause new bets)</span>
                    <input
                      type="checkbox"
                      checked={Boolean(settingsDraft.maintenanceMode)}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          maintenanceMode: e.target.checked,
                        })
                      }
                      className="w-4 h-4 accent-amber-500"
                    />
                  </label>
                  <label className="flex items-center justify-between text-sm text-slate-200 cursor-pointer">
                    <span>Show Public Leaderboard</span>
                    <input
                      type="checkbox"
                      checked={Boolean(settingsDraft.leaderboardVisible)}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          leaderboardVisible: e.target.checked,
                        })
                      }
                      className="w-4 h-4 accent-emerald-500"
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Save Settings
                </button>
              </form>
            )}
          </>
        )}
      </main>
    </div>
  );
};
