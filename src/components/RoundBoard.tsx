import React from 'react';
import { GAME_COLORS, GameColor, PublicRoundState } from '../shared/types';
import { COLOR_META, ColorShapeIcon } from './ColorMark';
import { Lock, CheckCircle2 } from 'lucide-react';

interface RoundBoardProps {
  round: PublicRoundState;
  pendingColor: GameColor | null;
  canPickColors: boolean;
  onSelectColor: (color: GameColor) => void;
}

export const RoundBoard: React.FC<RoundBoardProps> = ({
  round,
  pendingColor,
  canPickColors,
  onSelectColor,
}) => {
  return (
    <section
      aria-label="Static Three Colors"
      className="bg-[#121821] border border-white/10 rounded-xl p-2 sm:p-4 min-w-0 shrink-0"
    >
      {/* Static Three-Color Board — Visual light guides selection, goes neutral after bet/reveal */}
      <div
        data-testid="static-color-board"
        className="grid grid-cols-3 gap-1.5 sm:gap-3.5"
        aria-label="Three Static Color Choices"
      >
        {GAME_COLORS.map((color) => {
          const meta = COLOR_META[color];
          const isWinner = round.phase === 'REVEAL' && round.winningColor === color;
          const isDimmed = round.phase === 'REVEAL' && round.winningColor !== color;
          const isLit = isWinner || (round.phase !== 'REVEAL' && pendingColor === color);
          const poolAmount = round.poolByColor[color] || 0;

          return (
            <button
              key={color}
              type="button"
              disabled={!canPickColors}
              onClick={() => onSelectColor(color)}
              data-testid={`board-color-${color.toLowerCase()}`}
              data-lit={isLit ? 'true' : 'false'}
              aria-pressed={pendingColor === color}
              aria-label={`Choose ${color}`}
              className={`text-left rounded-lg sm:rounded-xl border p-2 sm:p-4 transition-all duration-300 ease-out min-w-0 focus-visible:outline-none focus-visible:ring-2 ${meta.ringClass} ${
                isLit
                  ? `${meta.bgSoft} ${meta.borderActive} ${meta.glowShadow}`
                  : isDimmed
                    ? 'bg-[#0D1219] border-white/5 opacity-45'
                    : `bg-[#0E141C] ${meta.borderIdle}`
              } ${canPickColors ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1 sm:gap-2.5 min-w-0">
                  <ColorShapeIcon color={color} className="w-3.5 h-3.5 sm:w-6 sm:h-6 shrink-0" />
                  <span className="text-[11px] sm:text-base font-display font-bold tracking-tight text-white whitespace-nowrap">
                    {meta.label}
                  </span>
                </div>
                {isWinner ? (
                  <CheckCircle2
                    className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${meta.textAccent}`}
                    aria-label="Winning color"
                  />
                ) : round.phase === 'COLOR_DRAW' ? (
                  <Lock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400 shrink-0" aria-label="Draw locked" />
                ) : null}
              </div>

              <div className="mt-1.5 sm:mt-3 pt-1.5 sm:pt-2.5 border-t border-white/8 flex items-center justify-between text-[11px] sm:text-xs">
                <span className="text-slate-400 hidden sm:inline">Round Pool</span>
                <span className="text-slate-400 sm:hidden">Pool</span>
                <span className="font-mono font-semibold tabular-nums text-slate-200">
                  ${poolAmount.toFixed(2)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};
