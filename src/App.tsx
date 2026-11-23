import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, LogOut, ShieldCheck } from 'lucide-react';
import {
  BetRecord,
  BetSlotIndex,
  GameColor,
  LeaderboardEntry,
  PlayerProfile,
  PublicRoundState,
  TransactionRecord,
} from './shared/types';
import { api, getPlayerToken, setAdminToken, setPlayerToken } from './lib/api';
import { signOutFirebase, testConnection } from './lib/firebase';
import { soundFx } from './lib/sound';
import { RoundBoard } from './components/RoundBoard';
import { BettingSlotCard } from './components/BettingSlotCard';
import { AuthModal } from './components/AuthModal';
import { WalletView } from './components/WalletView';
import { LeaderboardView } from './components/LeaderboardView';
import { AdminDashboard } from './components/AdminDashboard';

type PlayerPage = 'arena' | 'wallet' | 'leaderboard';

export default function App() {
  const [isAdminRoute, setIsAdminRoute] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.location.pathname === '/admin' || window.location.hash === '#admin';
  });

  const [page, setPage] = useState<PlayerPage>('arena');
  const [user, setUser] = useState<PlayerProfile | null>(null);
  const [round, setRound] = useState<PublicRoundState | null>(null);
  const [activeBets, setActiveBets] = useState<{
    slot1: BetRecord | null;
    slot2: BetRecord | null;
  }>({ slot1: null, slot2: null });
  const [myBetsHistory, setMyBetsHistory] = useState<BetRecord[]>([]);
  const [myTransactions, setMyTransactions] = useState<TransactionRecord[]>([]);

  const [leaderboardVisible, setLeaderboardVisible] = useState(true);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<'login' | 'register'>('login');
  const [muted, setMuted] = useState(false);
  const [busySlot, setBusySlot] = useState<BetSlotIndex | null>(null);
  const [pendingColor, setPendingColor] = useState<GameColor | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const lastRoundIdRef = useRef<string | null>(null);
  const lastRevealedRoundRef = useRef<string | null>(null);

  const refreshPlayer = useCallback(async () => {
    if (!getPlayerToken()) return;
    try {
      const data = await api.getMyProfile();
      if (data.user) {
        setUser(data.user);
      }
      setActiveBets(data.activeBets);
      setMyBetsHistory(data.bets);
      setMyTransactions(data.transactions);
    } catch {
      // Ignore transient profile refresh failures
    }
  }, []);

  const refreshGame = useCallback(async () => {
    try {
      const data = await api.getGameState();
      setRound(data.round);
      setActiveBets(data.myBets);
      setGlobalError(null);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Unable to connect to game server.');
    }
  }, []);

  const refreshLeaderboard = useCallback(async () => {
    setLeaderboardLoading(true);
    try {
      const data = await api.getLeaderboard();
      setLeaderboardVisible(data.visible);
      setLeaderboard(data.entries);
    } catch {
      // Ignore transient errors
    } finally {
      setLeaderboardLoading(false);
    }
  }, []);

  // Boot Firestore connection check & initial data load
  useEffect(() => {
    testConnection();
    refreshGame();
    refreshLeaderboard();
  }, [refreshGame, refreshLeaderboard]);

  // Listen for browser navigation between / and /admin
  useEffect(() => {
    const handlePop = () => {
      setIsAdminRoute(
        window.location.pathname === '/admin' || window.location.hash === '#admin'
      );
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  // Subscribe to real-time server-sent events for round ticks & phase changes
  useEffect(() => {
    const es = new EventSource('/api/game/stream');
    es.addEventListener('round', (evt) => {
      try {
        const nextRound = JSON.parse((evt as MessageEvent).data) as PublicRoundState;
        setRound(nextRound);

        if (lastRoundIdRef.current && lastRoundIdRef.current !== nextRound.roundId) {
          // New round started right after REVEAL -> return all lights & slot bets to neutral
          setPendingColor(null);
          setActiveBets({ slot1: null, slot2: null });
          refreshGame();
          if (getPlayerToken()) {
            refreshPlayer();
          }
        }
        lastRoundIdRef.current = nextRound.roundId;

        if (nextRound.phase === 'COLOR_DRAW') {
          setPendingColor(null);
        }

        if (
          nextRound.phase === 'REVEAL' &&
          lastRevealedRoundRef.current !== nextRound.roundId
        ) {
          lastRevealedRoundRef.current = nextRound.roundId;
          setPendingColor(null);
          soundFx.roundReveal();
          refreshGame();
          if (getPlayerToken()) {
            refreshPlayer();
          }
          refreshLeaderboard();
        }
      } catch {
        // Ignore malformed tick
      }
    });

    return () => {
      es.close();
    };
  }, [refreshGame, refreshPlayer, refreshLeaderboard]);

  const navigateAdmin = (enter: boolean) => {
    setIsAdminRoute(enter);
    if (typeof window !== 'undefined') {
      const nextUrl = enter ? '/admin' : '/';
      window.history.pushState({}, '', nextUrl);
    }
  };

  const handleAuthSuccess = async (profile: PlayerProfile) => {
    setUser(profile);
    await Promise.all([refreshGame(), refreshPlayer(), refreshLeaderboard()]);
  };

  const handleLogout = async () => {
    setPlayerToken(null);
    setAdminToken(null);
    setUser(null);
    setActiveBets({ slot1: null, slot2: null });
    setMyBetsHistory([]);
    setMyTransactions([]);
    await signOutFirebase();
  };

  const canPickColors = Boolean(
    round &&
      ((round.phase === 'BETTING' && (!activeBets.slot1 || !activeBets.slot2)) ||
        (round.phase === 'PICKING' && (activeBets.slot1 || activeBets.slot2)))
  );

  const handleDirectColorSelect = (color: GameColor) => {
    if (!canPickColors) return;
    setPendingColor(color);
  };

  const handlePlaceBet = async (slotIndex: BetSlotIndex, color: GameColor, stake: number) => {
    setBusySlot(slotIndex);
    try {
      const res = await api.placeBet(slotIndex, color, stake);
      soundFx.betPlaced();
      setActiveBets(res.activeBets);
      setPendingColor(null);
      setUser((prev) => (prev ? { ...prev, balance: res.balance } : prev));
      await Promise.all([refreshGame(), refreshPlayer()]);
    } finally {
      setBusySlot(null);
    }
  };

  const handleUpdatePick = async (slotIndex: BetSlotIndex, color: GameColor) => {
    setBusySlot(slotIndex);
    try {
      const res = await api.updatePick(slotIndex, color);
      soundFx.pickUpdated();
      setActiveBets(res.activeBets);
      setPendingColor(null);
      await refreshPlayer();
    } finally {
      setBusySlot(null);
    }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    soundFx.setMuted(next);
  };

  if (isAdminRoute) {
    return (
      <AdminDashboard
        onExitAdmin={() => {
          setPage('arena');
          navigateAdmin(false);
          refreshGame();
          refreshPlayer();
        }}
        onRefreshGame={async () => {
          await refreshGame();
          await refreshPlayer();
        }}
      />
    );
  }

  const isArena = page === 'arena';

  return (
    <div
      className={`bg-[#0B0F14] text-slate-100 flex flex-col ${
        isArena ? 'h-dvh overflow-hidden' : 'min-h-screen'
      }`}
    >
      {/* 3-Zone Top Bar for Player Platform */}
      <header className="border-b border-white/10 bg-[#0F151E] px-3 sm:px-4 md:px-8 py-2 sm:py-3 shrink-0 z-30">
        <div className="max-w-6xl mx-auto flex flex-wrap sm:flex-nowrap items-center justify-between gap-x-3 gap-y-1.5 md:gap-8">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => setPage('arena')}
            className="text-lg sm:text-xl font-display font-extrabold tracking-tight text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            B-WILL
          </button>

          {/* Zone 2: Clean Single-Line Navigation Links */}
          <nav
            className="order-3 w-full sm:order-none sm:w-auto flex items-center justify-around sm:justify-center gap-4 md:gap-7 text-xs sm:text-sm font-medium border-t border-white/10 pt-1.5 sm:border-t-0 sm:pt-0"
            aria-label="Player Navigation"
          >
            <button
              type="button"
              onClick={() => setPage('arena')}
              className={`whitespace-nowrap shrink-0 pb-0.5 transition-colors cursor-pointer ${
                page === 'arena'
                  ? 'text-white border-b-2 border-emerald-400'
                  : 'text-slate-400 hover:text-white border-b-2 border-transparent'
              }`}
            >
              Arena
            </button>
            <button
              type="button"
              onClick={() => {
                setPage('wallet');
                refreshPlayer();
              }}
              className={`whitespace-nowrap shrink-0 pb-0.5 transition-colors cursor-pointer ${
                page === 'wallet'
                  ? 'text-white border-b-2 border-emerald-400'
                  : 'text-slate-400 hover:text-white border-b-2 border-transparent'
              }`}
            >
              Wallet
            </button>
            <button
              type="button"
              onClick={() => {
                setPage('leaderboard');
                refreshLeaderboard();
              }}
              className={`whitespace-nowrap shrink-0 pb-0.5 transition-colors cursor-pointer ${
                page === 'leaderboard'
                  ? 'text-white border-b-2 border-emerald-400'
                  : 'text-slate-400 hover:text-white border-b-2 border-transparent'
              }`}
            >
              Leaderboard
            </button>
          </nav>

          {/* Zone 3: Player Account / Balance / Primary Action */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? 'Unmute game audio' : 'Mute game audio'}
              className="p-2 rounded-lg border border-white/10 text-slate-300 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {user ? (
              <div className="flex items-center gap-2 sm:gap-2.5">
                <button
                  type="button"
                  onClick={() => setPage('wallet')}
                  data-testid="header-balance"
                  className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#161F2C] border border-white/10 text-xs font-mono tabular-nums text-white hover:border-emerald-400/50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span className="text-slate-400 mr-1.5 hidden sm:inline">{user.username}</span>
                  <span className="text-emerald-300 font-bold">${user.balance.toFixed(2)}</span>
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  aria-label="Sign out"
                  className="p-2 rounded-lg border border-white/10 text-slate-300 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAuthInitialMode('login');
                  setAuthModalOpen(true);
                }}
                data-testid="header-signin-btn"
                className="px-3 sm:px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Sign In / Register
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main
        className={`flex-1 max-w-6xl w-full mx-auto flex flex-col ${
          isArena
            ? 'px-3 sm:px-4 md:px-8 py-2.5 sm:py-5 gap-2.5 sm:gap-4 min-h-0 overflow-hidden justify-start'
            : 'px-4 md:px-8 py-6 space-y-6'
        }`}
      >
        {globalError && (
          <div
            role="alert"
            className="bg-rose-950/40 border border-rose-500/30 rounded-xl px-3 py-2 text-xs sm:text-sm text-rose-200 flex items-center justify-between gap-3 shrink-0"
          >
            <span>{globalError}</span>
            <button
              type="button"
              onClick={refreshGame}
              className="px-2.5 py-1 text-xs font-semibold bg-rose-600/30 hover:bg-rose-600/50 rounded-md cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {page === 'arena' && (
          <>
            {!round ? (
              <div className="bg-[#121821] border border-white/10 rounded-xl p-6 space-y-3">
                <div className="h-5 w-40 bg-slate-800 rounded animate-pulse" />
                <div className="grid grid-cols-3 gap-3">
                  <div className="h-20 bg-slate-800/70 rounded-xl animate-pulse" />
                  <div className="h-20 bg-slate-800/70 rounded-xl animate-pulse" />
                  <div className="h-20 bg-slate-800/70 rounded-xl animate-pulse" />
                </div>
              </div>
            ) : (
              <>
                <RoundBoard
                  round={round}
                  pendingColor={pendingColor}
                  canPickColors={canPickColors}
                  onSelectColor={handleDirectColorSelect}
                />

                {/* Dual Independent Betting Slots */}
                <section
                  aria-label="Dual Independent Betting Slots"
                  className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-5 min-h-0"
                >
                  <BettingSlotCard
                    slotIndex={1}
                    roundId={round.roundId}
                    phase={round.phase}
                    winningColor={round.winningColor}
                    pendingColor={pendingColor}
                    activeBet={activeBets.slot1}
                    balance={user?.balance ?? 0}
                    minBet={round.settings.minBet}
                    maxBet={round.settings.maxBet}
                    isAuthenticated={Boolean(user)}
                    isBusy={busySlot === 1}
                    onPlaceBet={handlePlaceBet}
                    onUpdatePick={handleUpdatePick}
                    onRequireAuth={() => {
                      setAuthInitialMode('login');
                      setAuthModalOpen(true);
                    }}
                  />
                  <BettingSlotCard
                    slotIndex={2}
                    roundId={round.roundId}
                    phase={round.phase}
                    winningColor={round.winningColor}
                    pendingColor={pendingColor}
                    activeBet={activeBets.slot2}
                    balance={user?.balance ?? 0}
                    minBet={round.settings.minBet}
                    maxBet={round.settings.maxBet}
                    isAuthenticated={Boolean(user)}
                    isBusy={busySlot === 2}
                    onPlaceBet={handlePlaceBet}
                    onUpdatePick={handleUpdatePick}
                    onRequireAuth={() => {
                      setAuthInitialMode('login');
                      setAuthModalOpen(true);
                    }}
                  />
                </section>
              </>
            )}
          </>
        )}

        {page === 'wallet' && (
          <WalletView
            user={user}
            bets={myBetsHistory}
            transactions={myTransactions}
            onRequireAuth={() => {
              setAuthInitialMode('login');
              setAuthModalOpen(true);
            }}
            onRefresh={refreshPlayer}
          />
        )}

        {page === 'leaderboard' && (
          <LeaderboardView
            visible={leaderboardVisible}
            entries={leaderboard}
            loading={leaderboardLoading}
            currentUserId={user?.userId}
          />
        )}
      </main>

      {/* Quiet Footer with Separate Admin Console Portal */}
      <footer
        className={`border-t border-white/10 bg-[#0D1219] px-3 sm:px-4 md:px-8 shrink-0 ${
          isArena ? 'py-1.5 sm:py-3' : 'py-4 mt-8'
        }`}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 text-[11px] sm:text-xs text-slate-500">
          <span className="truncate">B-WILL Three-Color Platform</span>
          <button
            type="button"
            onClick={() => navigateAdmin(true)}
            data-testid="open-admin-console"
            className="inline-flex items-center gap-1.5 text-slate-400 hover:text-amber-300 transition-colors shrink-0 cursor-pointer"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Admin Console
          </button>
        </div>
      </footer>

      <AuthModal
        isOpen={authModalOpen}
        initialMode={authInitialMode}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
      />
    </div>
  );
}
