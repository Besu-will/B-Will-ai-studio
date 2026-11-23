import React from 'react';
import { LeaderboardEntry } from '../shared/types';

interface LeaderboardViewProps {
  visible: boolean;
  entries: LeaderboardEntry[];
  loading: boolean;
  currentUserId?: string;
}

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({
  visible,
  entries,
  loading,
  currentUserId,
}) => {
  if (loading) {
    return (
      <div className="bg-[#121821] border border-white/10 rounded-xl p-6 space-y-3">
        <div className="h-5 w-48 bg-slate-800 rounded animate-pulse" />
        <div className="h-10 bg-slate-800/70 rounded animate-pulse" />
        <div className="h-10 bg-slate-800/70 rounded animate-pulse" />
        <div className="h-10 bg-slate-800/70 rounded animate-pulse" />
      </div>
    );
  }

  if (!visible) {
    return (
      <div className="bg-[#121821] border border-white/10 rounded-xl p-8 text-center space-y-2">
        <h2 className="text-lg font-display font-bold text-white">Leaderboard Disabled</h2>
        <p className="text-sm text-slate-400">
          Public leaderboard display is currently paused by an administrator.
        </p>
      </div>
    );
  }

  return (
    <section className="bg-[#121821] border border-white/10 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-display font-bold text-white">Player Leaderboard</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Ranked by total wins and win rate across settled rounds.
          </p>
        </div>
        <span className="text-xs font-mono text-slate-400 tabular-nums">
          Top {entries.length} Players
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-400">
          No ranked players yet. Complete rounds to appear on the leaderboard.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-400 border-b border-white/10 bg-[#0E131B]">
              <tr>
                <th className="py-3 px-4 font-medium">Rank</th>
                <th className="py-3 px-4 font-medium">Player</th>
                <th className="py-3 px-4 font-medium text-right">Games</th>
                <th className="py-3 px-4 font-medium text-right">Wins</th>
                <th className="py-3 px-4 font-medium text-right">Win Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {entries.map((entry) => {
                const isSelf = entry.userId === currentUserId;
                return (
                  <tr
                    key={entry.userId}
                    className={isSelf ? 'bg-emerald-500/10' : 'hover:bg-white/[0.02]'}
                  >
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-300">
                      #{entry.rank}
                    </td>
                    <td className="py-3 px-4 font-semibold text-white">
                      {entry.username}
                      {isSelf && (
                        <span className="ml-2 text-xs font-mono text-emerald-300">(You)</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">
                      {entry.gamesPlayed}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-300 font-semibold">
                      {entry.winsCount}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">
                      {entry.winRate.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
