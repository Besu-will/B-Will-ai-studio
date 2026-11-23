import React, { useState } from 'react';
import { BetRecord, PlayerProfile, TransactionRecord } from '../shared/types';
import { api } from '../lib/api';
import { COLOR_META, ColorShapeIcon } from './ColorMark';

interface WalletViewProps {
  user: PlayerProfile | null;
  bets: BetRecord[];
  transactions: TransactionRecord[];
  onRequireAuth: () => void;
  onRefresh: () => Promise<void>;
}

export const WalletView: React.FC<WalletViewProps> = ({
  user,
  bets,
  transactions,
  onRequireAuth,
  onRefresh,
}) => {
  const [depositAmount, setDepositAmount] = useState('100');
  const [depositNote, setDepositNote] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('50');
  const [withdrawNote, setWithdrawNote] = useState('');
  const [activeTab, setActiveTab] = useState<'transactions' | 'bets'>('transactions');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  if (!user) {
    return (
      <section className="bg-[#121821] border border-white/10 rounded-xl p-8 text-center space-y-4">
        <h2 className="text-xl font-display font-bold text-white">Player Account & Wallet</h2>
        <p className="text-sm text-slate-400 max-w-md mx-auto">
          Sign in or register a unique username to manage your balance, submit deposit or withdrawal
          requests, and inspect your betting ledger.
        </p>
        <button
          type="button"
          onClick={onRequireAuth}
          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
        >
          Sign In / Register
        </button>
      </section>
    );
  }

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setBusyAction('deposit');
    try {
      await api.requestDeposit(Number(depositAmount), depositNote);
      setDepositNote('');
      setFeedback({
        type: 'success',
        text: `Deposit request for $${Number(depositAmount).toFixed(2)} submitted for admin approval.`,
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to submit deposit request.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setBusyAction('withdraw');
    try {
      await api.requestWithdrawal(Number(withdrawAmount), withdrawNote);
      setWithdrawNote('');
      setFeedback({
        type: 'success',
        text: `Withdrawal request for $${Number(withdrawAmount).toFixed(2)} submitted.`,
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to submit withdrawal request.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleCancelWithdrawal = async (txId: string) => {
    setFeedback(null);
    setBusyAction(`cancel-${txId}`);
    try {
      await api.cancelWithdrawal(txId);
      setFeedback({
        type: 'success',
        text: 'Pending withdrawal cancelled and funds returned to your available balance.',
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to cancel withdrawal.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Player Profile Summary Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#121821] border border-white/10 rounded-xl p-4">
          <div className="text-xs text-slate-400">Available Balance</div>
          <div
            data-testid="wallet-balance"
            className="text-2xl font-mono font-bold tabular-nums text-emerald-300 mt-1"
          >
            ${user.balance.toFixed(2)}
          </div>
        </div>
        <div className="bg-[#121821] border border-white/10 rounded-xl p-4">
          <div className="text-xs text-slate-400">Total Wagered</div>
          <div className="text-2xl font-mono font-bold tabular-nums text-white mt-1">
            ${user.totalWagered.toFixed(2)}
          </div>
        </div>
        <div className="bg-[#121821] border border-white/10 rounded-xl p-4">
          <div className="text-xs text-slate-400">Total Won</div>
          <div className="text-2xl font-mono font-bold tabular-nums text-blue-300 mt-1">
            ${user.totalWon.toFixed(2)}
          </div>
        </div>
        <div className="bg-[#121821] border border-white/10 rounded-xl p-4">
          <div className="text-xs text-slate-400">Record (Wins / Bets)</div>
          <div className="text-2xl font-mono font-bold tabular-nums text-white mt-1">
            {user.winsCount} / {user.gamesPlayed}
          </div>
        </div>
      </section>

      {feedback && (
        <div
          role="status"
          className={`rounded-lg px-4 py-3 text-sm border ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
              : 'bg-rose-950/40 border-rose-500/30 text-rose-200'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Deposit & Withdrawal Forms */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <form
          onSubmit={handleDeposit}
          className="bg-[#121821] border border-white/10 rounded-xl p-5 space-y-4"
        >
          <div>
            <h3 className="text-base font-display font-bold text-white">Deposit Request</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Funds are credited once approved by an administrator.
            </p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="deposit-amount" className="block text-xs font-medium text-slate-300">
              Deposit Amount ($)
            </label>
            <input
              id="deposit-amount"
              type="number"
              min={5}
              max={50000}
              step="0.01"
              required
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              className="w-full bg-[#0B0F14] border border-white/15 rounded-lg px-3.5 py-2.5 text-sm font-mono tabular-nums text-white focus:outline-none focus:border-emerald-400"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="deposit-note" className="block text-xs font-medium text-slate-300">
              Reference Note (Optional)
            </label>
            <input
              id="deposit-note"
              type="text"
              maxLength={240}
              value={depositNote}
              onChange={(e) => setDepositNote(e.target.value)}
              placeholder="Transfer reference or memo"
              className="w-full bg-[#0B0F14] border border-white/15 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400"
            />
          </div>
          <button
            type="submit"
            disabled={busyAction !== null}
            className="w-full min-h-[42px] bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
          >
            {busyAction === 'deposit' ? 'Submitting...' : 'Submit Deposit Request'}
          </button>
        </form>

        <form
          onSubmit={handleWithdraw}
          className="bg-[#121821] border border-white/10 rounded-xl p-5 space-y-4"
        >
          <div>
            <h3 className="text-base font-display font-bold text-white">Withdrawal Request</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Reserved immediately. You can cancel while status remains pending.
            </p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="withdraw-amount" className="block text-xs font-medium text-slate-300">
              Withdrawal Amount ($)
            </label>
            <input
              id="withdraw-amount"
              type="number"
              min={5}
              step="0.01"
              required
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              className="w-full bg-[#0B0F14] border border-white/15 rounded-lg px-3.5 py-2.5 text-sm font-mono tabular-nums text-white focus:outline-none focus:border-blue-400"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="withdraw-note" className="block text-xs font-medium text-slate-300">
              Payout Destination / Note (Optional)
            </label>
            <input
              id="withdraw-note"
              type="text"
              maxLength={240}
              value={withdrawNote}
              onChange={(e) => setWithdrawNote(e.target.value)}
              placeholder="Account or payout instructions"
              className="w-full bg-[#0B0F14] border border-white/15 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-400"
            />
          </div>
          <button
            type="submit"
            disabled={busyAction !== null}
            className="w-full min-h-[42px] bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
          >
            {busyAction === 'withdraw' ? 'Submitting...' : 'Request Withdrawal'}
          </button>
        </form>
      </div>

      {/* History Switcher & Tables */}
      <section className="bg-[#121821] border border-white/10 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
          <div className="flex items-center gap-1 p-1 bg-[#0B0F14] border border-white/10 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab('transactions')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                activeTab === 'transactions'
                  ? 'bg-[#1D2736] text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Transaction History ({transactions.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('bets')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                activeTab === 'bets'
                  ? 'bg-[#1D2736] text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Betting History ({bets.length})
            </button>
          </div>
        </div>

        {activeTab === 'transactions' ? (
          <div className="overflow-x-auto">
            {transactions.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">
                No transactions yet. Submit a deposit request or place a bet to begin.
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-slate-400 border-b border-white/10 bg-[#0E131B]">
                  <tr>
                    <th className="py-3 px-4 font-medium">Type</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium">Note</th>
                    <th className="py-3 px-4 font-medium text-right">Amount</th>
                    <th className="py-3 px-4 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {transactions.map((tx) => (
                    <tr key={tx.txId} className="hover:bg-white/[0.02]">
                      <td className="py-3 px-4 font-mono text-xs uppercase text-slate-200">
                        {tx.type}
                      </td>
                      <td className="py-3 px-4 text-xs font-mono">
                        <span
                          className={
                            tx.status === 'approved' || tx.status === 'completed'
                              ? 'text-emerald-300'
                              : tx.status === 'pending'
                                ? 'text-amber-300'
                                : 'text-rose-300'
                          }
                        >
                          {tx.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-300 max-w-xs truncate">
                        {tx.note}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-white">
                        ${tx.amount.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {tx.type === 'withdrawal' && tx.status === 'pending' ? (
                          <button
                            type="button"
                            disabled={busyAction !== null}
                            onClick={() => handleCancelWithdrawal(tx.txId)}
                            className="px-2.5 py-1 text-xs font-medium bg-rose-600/20 hover:bg-rose-600/35 border border-rose-500/40 text-rose-200 rounded-md transition-colors cursor-pointer"
                          >
                            {busyAction === `cancel-${tx.txId}` ? 'Cancelling...' : 'Cancel'}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-500">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            {bets.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">
                No bets recorded yet. Place a bet in Slot 1 or Slot 2 on the Game Arena.
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-slate-400 border-b border-white/10 bg-[#0E131B]">
                  <tr>
                    <th className="py-3 px-4 font-medium">Round</th>
                    <th className="py-3 px-4 font-medium">Slot</th>
                    <th className="py-3 px-4 font-medium">Color</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium text-right">Stake</th>
                    <th className="py-3 px-4 font-medium text-right">Payout</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {bets.map((b) => (
                    <tr key={b.betId} className="hover:bg-white/[0.02]">
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-200">
                        #{b.roundNumber}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-300">
                        Slot {b.slotIndex}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 font-mono text-xs font-semibold ${COLOR_META[b.selectedColor].textAccent}`}
                        >
                          <ColorShapeIcon color={b.selectedColor} className="w-3.5 h-3.5" />
                          {b.selectedColor}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs">
                        <span
                          className={
                            b.status === 'won'
                              ? 'text-emerald-300'
                              : b.status === 'lost'
                                ? 'text-rose-300'
                                : 'text-amber-300'
                          }
                        >
                          {b.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-200">
                        ${b.stake.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-300">
                        ${b.payout.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
