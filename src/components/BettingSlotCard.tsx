import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { BetRecord, BetSlotIndex, GameColor, RoundPhase } from '../shared/types';
import { adjustStakeAmount, shouldTriggerAutoBet } from '../shared/gameRules';
import { COLOR_META } from './ColorMark';

type SlotMode = 'manual' | 'auto';

interface BettingSlotCardProps {
  slotIndex: BetSlotIndex;
  roundId: string;
  phase: RoundPhase;
  winningColor: GameColor | null;
  pendingColor: GameColor | null;
  activeBet: BetRecord | null;
  balance: number;
  minBet: number;
  maxBet: number;
  isAuthenticated: boolean;
  isBusy: boolean;
  onPlaceBet: (slotIndex: BetSlotIndex, color: GameColor, stake: number) => Promise<void>;
  onUpdatePick: (slotIndex: BetSlotIndex, color: GameColor) => Promise<void>;
  onRequireAuth: () => void;
}

const QUICK_STAKES = [10, 25, 50, 100];

export const BettingSlotCard: React.FC<BettingSlotCardProps> = ({
  slotIndex,
  roundId,
  phase,
  winningColor,
  pendingColor,
  activeBet,
  balance,
  minBet,
  maxBet,
  isAuthenticated,
  isBusy,
  onPlaceBet,
  onUpdatePick,
  onRequireAuth,
}) => {
  const [mode, setMode] = useState<SlotMode>('manual');
  const [stakeInput, setStakeInput] = useState<string>('25');
  const [autoArmed, setAutoArmed] = useState<boolean>(false);
  const [autoColor, setAutoColor] = useState<GameColor | null>(null);
  const [autoStake, setAutoStake] = useState<number>(25);
  const [localError, setLocalError] = useState<string | null>(null);
  const lastAutoRoundRef = useRef<string | null>(null);

  useEffect(() => {
    if (activeBet) {
      setStakeInput(String(activeBet.stake));
    }
  }, [activeBet?.betId, activeBet?.stake]);

  // Disarm auto if user logs out
  useEffect(() => {
    if (!isAuthenticated && autoArmed) {
      setAutoArmed(false);
      setAutoColor(null);
      lastAutoRoundRef.current = null;
    }
  }, [isAuthenticated, autoArmed]);

  // Execute armed auto-bet once per BETTING round
  useEffect(() => {
    const decision = shouldTriggerAutoBet({
      mode,
      autoArmed,
      autoColor,
      autoStake,
      roundId,
      lastTriggeredRoundId: lastAutoRoundRef.current,
      phase,
      hasActiveBet: Boolean(activeBet),
      isAuthenticated,
      isBusy,
      balance,
      minBet,
      maxBet,
    });

    if (!decision.trigger) {
      if (decision.disarm) {
        setAutoArmed(false);
        setAutoColor(null);
        setLocalError(decision.reason ?? 'Auto bet stopped.');
      }
      return;
    }

    lastAutoRoundRef.current = roundId;
    onPlaceBet(slotIndex, autoColor!, autoStake).catch((err) => {
      setAutoArmed(false);
      setAutoColor(null);
      setLocalError(err instanceof Error ? err.message : 'Auto bet failed and was stopped.');
    });
  }, [
    mode,
    autoArmed,
    autoColor,
    autoStake,
    roundId,
    phase,
    activeBet,
    isAuthenticated,
    isBusy,
    balance,
    minBet,
    maxBet,
    slotIndex,
    onPlaceBet,
  ]);

  const stepAmount = minBet >= 5 ? minBet : 5;
  const isStakeLocked = phase !== 'BETTING' || Boolean(activeBet) || autoArmed;
  const parsedStakeNumeric = Number(stakeInput);
  const isAtMin = Number.isFinite(parsedStakeNumeric) && parsedStakeNumeric <= minBet;
  const isAtMax = Number.isFinite(parsedStakeNumeric) && parsedStakeNumeric >= maxBet;

  const handleStepStake = (delta: number) => {
    setLocalError(null);
    const next = adjustStakeAmount(stakeInput, delta, minBet, maxBet);
    setStakeInput(String(next));
  };

  const handleModeChange = (nextMode: SlotMode) => {
    setLocalError(null);
    setMode(nextMode);
    if (nextMode === 'manual' && autoArmed) {
      setAutoArmed(false);
      setAutoColor(null);
      lastAutoRoundRef.current = null;
    }
  };

  // Visual light color applies ONLY to the BET/AUTO/STOP button (outer slot card remains neutral)
  const placedColor: GameColor | null = activeBet ? activeBet.selectedColor : null;
  const previewColor: GameColor | null =
    activeBet && phase === 'PICKING' && pendingColor
      ? pendingColor
      : !activeBet && phase === 'BETTING'
        ? pendingColor
        : null;

  const buttonLightColor: GameColor | null =
    mode === 'auto' && autoArmed
      ? autoColor
      : activeBet && phase === 'PICKING' && pendingColor
        ? pendingColor
        : placedColor ?? previewColor;

  const handlePrimaryAction = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }

    if (mode === 'auto') {
      if (autoArmed) {
        setAutoArmed(false);
        setAutoColor(null);
        lastAutoRoundRef.current = null;
        return;
      }

      const chosenColor = pendingColor;
      if (!chosenColor) {
        setLocalError('Select a color above first.');
        return;
      }
      const parsedStake = Number(stakeInput);
      if (!Number.isFinite(parsedStake) || parsedStake <= 0) {
        setLocalError('Enter a valid stake amount.');
        return;
      }
      if (parsedStake < minBet || parsedStake > maxBet) {
        setLocalError(`Stake must be between $${minBet.toFixed(2)} and $${maxBet.toFixed(2)}.`);
        return;
      }
      if (parsedStake > balance) {
        setLocalError('Insufficient balance. Request a deposit in your Wallet.');
        return;
      }

      setAutoColor(chosenColor);
      setAutoStake(parsedStake);
      setAutoArmed(true);
      return;
    }

    if (phase === 'BETTING' && !activeBet) {
      if (!pendingColor) {
        setLocalError('Select a color above first.');
        return;
      }
      const parsedStake = Number(stakeInput);
      if (!Number.isFinite(parsedStake) || parsedStake <= 0) {
        setLocalError('Enter a valid stake amount.');
        return;
      }
      if (parsedStake < minBet || parsedStake > maxBet) {
        setLocalError(`Stake must be between $${minBet.toFixed(2)} and $${maxBet.toFixed(2)}.`);
        return;
      }
      if (parsedStake > balance) {
        setLocalError('Insufficient balance. Request a deposit in your Wallet.');
        return;
      }
      try {
        await onPlaceBet(slotIndex, pendingColor, parsedStake);
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : 'Unable to place bet.');
      }
      return;
    }

    if (phase === 'PICKING' && activeBet && pendingColor) {
      try {
        await onUpdatePick(slotIndex, pendingColor);
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : 'Unable to update color pick.');
      }
    }
  };

  const buttonDisabled =
    isBusy ||
    (isAuthenticated &&
      !(mode === 'auto' && autoArmed) &&
      ((phase === 'BETTING' && Boolean(activeBet)) ||
        phase === 'COLOR_DRAW' ||
        (phase === 'PICKING' && (!activeBet || !pendingColor)) ||
        phase === 'REVEAL'));

  let buttonText = mode === 'auto' ? 'AUTO' : 'BET';
  if (isAuthenticated) {
    if (mode === 'auto') {
      buttonText = autoArmed ? 'STOP' : 'AUTO';
    } else if (phase === 'BETTING') {
      buttonText = 'BET';
    } else if (phase === 'COLOR_DRAW') {
      buttonText = 'LOCKED';
    } else if (phase === 'PICKING') {
      buttonText = activeBet && pendingColor ? 'CONFIRM' : activeBet ? 'BET' : 'CLOSED';
    } else if (activeBet) {
      if (activeBet.status === 'won') {
        buttonText = `WON +$${activeBet.payout.toFixed(2)}`;
      } else if (activeBet.status === 'lost') {
        buttonText = `LOST -$${activeBet.stake.toFixed(2)}`;
      } else if (winningColor) {
        buttonText = activeBet.selectedColor === winningColor ? 'WON' : 'LOST';
      } else {
        buttonText = 'SETTLED';
      }
    } else {
      buttonText = 'CLOSED';
    }
  }

  const btnMeta = buttonLightColor ? COLOR_META[buttonLightColor] : null;
  const smallStep = stepAmount;
  const largeStep = stepAmount * 2;

  return (
    <form
      onSubmit={handlePrimaryAction}
      data-testid={`bet-slot-${slotIndex}`}
      data-mode={mode}
      data-auto-armed={autoArmed ? 'true' : 'false'}
      data-card-lit="false"
      className="bg-[#121821] border border-white/10 rounded-xl p-3 sm:p-5 space-y-2.5 sm:space-y-4 flex flex-col justify-between min-w-0"
    >
      {/* Middle-Top Mode Toggle: Balanced equal-width Self (left) | Auto (right) */}
      <div className="flex items-center justify-center pb-2 sm:pb-3 border-b border-white/10">
        <div
          role="tablist"
          aria-label={`Slot ${slotIndex} betting mode`}
          className="inline-grid grid-cols-2 p-0.5 rounded-lg bg-[#0B0F14] border border-white/10"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'manual'}
            data-testid={`slot-${slotIndex}-mode-self`}
            onClick={() => handleModeChange('manual')}
            className={`w-[68px] sm:w-[76px] py-1 text-center text-xs sm:text-sm font-display font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              mode === 'manual'
                ? 'bg-[#1B2432] text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Self
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'auto'}
            data-testid={`slot-${slotIndex}-mode-auto`}
            onClick={() => handleModeChange('auto')}
            className={`w-[68px] sm:w-[76px] py-1 text-center text-xs sm:text-sm font-display font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              mode === 'auto'
                ? 'bg-[#1B2432] text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Auto
          </button>
        </div>
      </div>

      {/* Compact Stake Stepper (-10 / -5 / [centered stake + up/down arrows] / +5 / +10) + 25%-Width BET Button */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-0.5 sm:gap-1 min-w-0">
            <button
              type="button"
              disabled={isStakeLocked || isAtMin}
              onClick={() => handleStepStake(-largeStep)}
              data-testid={`slot-${slotIndex}-decrease-10`}
              aria-label={`Decrease slot ${slotIndex} stake by $${largeStep}`}
              className="px-1 sm:px-1.5 py-0.5 sm:py-1 rounded bg-[#0B0F14] border border-white/15 text-[10px] sm:text-[11px] font-mono font-semibold tabular-nums leading-none text-slate-200 hover:border-white/35 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              -{largeStep}
            </button>

            <button
              type="button"
              disabled={isStakeLocked || isAtMin}
              onClick={() => handleStepStake(-smallStep)}
              data-testid={`slot-${slotIndex}-decrease-5`}
              aria-label={`Decrease slot ${slotIndex} stake by $${smallStep}`}
              className="px-1 sm:px-1.5 py-0.5 sm:py-1 rounded bg-[#0B0F14] border border-white/15 text-[10px] sm:text-[11px] font-mono font-semibold tabular-nums leading-none text-slate-200 hover:border-white/35 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              -{smallStep}
            </button>

            {/* Shrunk stake box: value centered inside its own input area excluding the arrows column */}
            <div
              data-testid={`slot-${slotIndex}-stake-box`}
              className={`flex items-stretch w-[64px] sm:w-[72px] h-[38px] sm:h-[40px] bg-[#0B0F14] border border-white/15 rounded-lg overflow-hidden focus-within:border-white/40 transition-colors shrink-0 ${
                isStakeLocked ? 'opacity-60' : ''
              }`}
            >
              <input
                id={`stake-slot-${slotIndex}`}
                aria-label={`Slot ${slotIndex} stake amount`}
                type="number"
                min={minBet}
                max={maxBet}
                step="0.01"
                disabled={isStakeLocked}
                value={stakeInput}
                onChange={(e) => {
                  setLocalError(null);
                  setStakeInput(e.target.value);
                }}
                className="flex-1 min-w-0 bg-transparent px-1 text-center text-xs sm:text-sm font-mono tabular-nums text-white placeholder-slate-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                placeholder="25"
              />
              <div
                data-testid={`slot-${slotIndex}-arrows`}
                className="flex flex-col w-5 sm:w-6 border-l border-white/10 shrink-0"
              >
                <button
                  type="button"
                  disabled={isStakeLocked || isAtMax}
                  onClick={() => handleStepStake(1)}
                  data-testid={`slot-${slotIndex}-step-up`}
                  aria-label={`Increase slot ${slotIndex} stake by $1`}
                  className="flex-1 flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed transition-colors border-b border-white/10 cursor-pointer"
                >
                  <ChevronUp className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                </button>
                <button
                  type="button"
                  disabled={isStakeLocked || isAtMin}
                  onClick={() => handleStepStake(-1)}
                  data-testid={`slot-${slotIndex}-step-down`}
                  aria-label={`Decrease slot ${slotIndex} stake by $1`}
                  className="flex-1 flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <ChevronDown className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                </button>
              </div>
            </div>

            <button
              type="button"
              disabled={isStakeLocked || isAtMax}
              onClick={() => handleStepStake(smallStep)}
              data-testid={`slot-${slotIndex}-increase-5`}
              aria-label={`Increase slot ${slotIndex} stake by $${smallStep}`}
              className="px-1 sm:px-1.5 py-0.5 sm:py-1 rounded bg-[#0B0F14] border border-white/15 text-[10px] sm:text-[11px] font-mono font-semibold tabular-nums leading-none text-slate-200 hover:border-white/35 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              +{smallStep}
            </button>

            <button
              type="button"
              disabled={isStakeLocked || isAtMax}
              onClick={() => handleStepStake(largeStep)}
              data-testid={`slot-${slotIndex}-increase-10`}
              aria-label={`Increase slot ${slotIndex} stake by $${largeStep}`}
              className="px-1 sm:px-1.5 py-0.5 sm:py-1 rounded bg-[#0B0F14] border border-white/15 text-[10px] sm:text-[11px] font-mono font-semibold tabular-nums leading-none text-slate-200 hover:border-white/35 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              +{largeStep}
            </button>
          </div>

          <button
            type="submit"
            disabled={buttonDisabled}
            data-testid={`slot-${slotIndex}-submit`}
            data-button-color={buttonLightColor ?? 'neutral'}
            className={`w-[38%] sm:w-[44%] min-w-[96px] h-[48px] sm:h-[54px] px-3 sm:px-5 rounded-lg font-display font-bold text-sm sm:text-base tracking-wide transition-all duration-300 ease-out whitespace-nowrap shrink-0 ${
              btnMeta
                ? `${btnMeta.bgSolid} ${btnMeta.glowShadow} text-white ${buttonDisabled ? 'opacity-90 cursor-default' : 'cursor-pointer'}`
                : buttonDisabled
                  ? 'bg-slate-800 text-slate-400 cursor-not-allowed border border-white/5'
                  : 'bg-[#1B2432] hover:bg-[#243044] text-slate-100 border border-white/15 cursor-pointer'
            }`}
          >
            {isBusy ? '...' : buttonText}
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 flex-wrap">
          {QUICK_STAKES.map((amt) => (
            <button
              key={amt}
              type="button"
              disabled={isStakeLocked}
              onClick={() => {
                setLocalError(null);
                setStakeInput(String(amt));
              }}
              className="px-2.5 py-1 text-xs font-mono tabular-nums rounded-md bg-[#0B0F14] border border-white/10 text-slate-300 hover:border-white/25 hover:text-white disabled:opacity-40 transition-colors cursor-pointer"
            >
              ${amt}
            </button>
          ))}
          <button
            type="button"
            disabled={isStakeLocked || balance <= 0}
            onClick={() => {
              setLocalError(null);
              const capped = Math.min(balance, maxBet);
              setStakeInput(String(Math.floor(capped * 100) / 100));
            }}
            className="px-2.5 py-1 text-xs font-mono rounded-md bg-[#0B0F14] border border-white/10 text-slate-300 hover:border-white/25 hover:text-white disabled:opacity-40 transition-colors cursor-pointer"
          >
            Max
          </button>
        </div>
      </div>

      {localError && (
        <p role="alert" className="text-[11px] sm:text-xs text-rose-300 bg-rose-950/40 border border-rose-500/25 rounded-md px-2.5 py-1">
          {localError}
        </p>
      )}
    </form>
  );
};
