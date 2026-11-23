import React from 'react';
import { GameColor } from '../shared/types';

export const COLOR_META: Record<
  GameColor,
  {
    label: string;
    hex: string;
    bgSoft: string;
    bgSolid: string;
    borderActive: string;
    borderIdle: string;
    textAccent: string;
    ringClass: string;
    glowShadow: string;
  }
> = {
  GREEN: {
    label: 'GREEN',
    hex: '#10B981',
    bgSoft: 'bg-emerald-500/18',
    bgSolid: 'bg-emerald-600 hover:bg-emerald-500',
    borderActive: 'border-emerald-400',
    borderIdle: 'border-white/10 hover:border-emerald-400/50',
    textAccent: 'text-emerald-300',
    ringClass: 'focus-visible:ring-emerald-400',
    glowShadow: 'shadow-[0_0_24px_rgba(16,185,129,0.28)]',
  },
  BLUE: {
    label: 'BLUE',
    hex: '#3B82F6',
    bgSoft: 'bg-blue-500/18',
    bgSolid: 'bg-blue-600 hover:bg-blue-500',
    borderActive: 'border-blue-400',
    borderIdle: 'border-white/10 hover:border-blue-400/50',
    textAccent: 'text-blue-300',
    ringClass: 'focus-visible:ring-blue-400',
    glowShadow: 'shadow-[0_0_24px_rgba(59,130,246,0.28)]',
  },
  ORANGE: {
    label: 'ORANGE',
    hex: '#F97316',
    bgSoft: 'bg-orange-500/18',
    bgSolid: 'bg-orange-600 hover:bg-orange-500',
    borderActive: 'border-orange-400',
    borderIdle: 'border-white/10 hover:border-orange-400/50',
    textAccent: 'text-orange-300',
    ringClass: 'focus-visible:ring-orange-400',
    glowShadow: 'shadow-[0_0_24px_rgba(249,115,22,0.28)]',
  },
};

export const ColorShapeIcon: React.FC<{ color: GameColor; className?: string }> = ({
  color,
  className = 'w-5 h-5',
}) => {
  if (color === 'GREEN') {
    // Diamond emblem
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
        <path
          d="M12 2.5L21.5 12L12 21.5L2.5 12L12 2.5Z"
          fill="#10B981"
          fillOpacity="0.24"
          stroke="#10B981"
          strokeWidth="2"
        />
        <path d="M12 7L17 12L12 17L7 12L12 7Z" fill="#10B981" />
      </svg>
    );
  }
  if (color === 'BLUE') {
    // Concentric circle emblem
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="#3B82F6"
          fillOpacity="0.24"
          stroke="#3B82F6"
          strokeWidth="2"
        />
        <circle cx="12" cy="12" r="4.5" fill="#3B82F6" />
      </svg>
    );
  }
  // Triangle emblem for ORANGE
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M12 3L21 19.5H3L12 3Z"
        fill="#F97316"
        fillOpacity="0.24"
        stroke="#F97316"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M12 9.5L16 16.5H8L12 9.5Z" fill="#F97316" />
    </svg>
  );
};
