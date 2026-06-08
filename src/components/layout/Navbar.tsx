import React, { useEffect, useRef, useState } from 'react';
import { useAppSelector } from '../../store';
import { Menu } from 'lucide-react';

interface NavbarProps {
  onMenuClick: () => void;
}

// XP thresholds per level
const LEVEL_CONFIG: Record<string, {
  label: string;
  emoji: string;
  minXp: number;
  maxXp: number;
  bgClass: string;
  textClass: string;
  borderClass: string;
  pillBg: string;
  pillText: string;
  pillBorder: string;
}> = {
  Bronze: {
    label: 'Bronze',
    emoji: '🥉',
    minXp: 0,
    maxXp: 400,
    bgClass: 'bg-[#FFF4E6]',
    textClass: 'text-[#8B4513]',
    borderClass: 'border-[#D4956A]',
    pillBg: 'bg-[#FFF4E6]',
    pillText: 'text-[#8B4513]',
    pillBorder: 'border-[#D4956A]',
  },
  Silver: {
    label: 'Silver',
    emoji: '🥈',
    minXp: 400,
    maxXp: 800,
    bgClass: 'bg-[#F4F4F4]',
    textClass: 'text-[#5A5A5A]',
    borderClass: 'border-[#B0B0B0]',
    pillBg: 'bg-[#F4F4F4]',
    pillText: 'text-[#5A5A5A]',
    pillBorder: 'border-[#B0B0B0]',
  },
  Gold: {
    label: 'Gold',
    emoji: '🥇',
    minXp: 800,
    maxXp: 1200,
    bgClass: 'bg-yellow-50',
    textClass: 'text-[#F57F17]',
    borderClass: 'border-[#FFE082]',
    pillBg: 'bg-yellow-50',
    pillText: 'text-[#F57F17]',
    pillBorder: 'border-[#FFE082]',
  },
  Diamond: {
    label: 'Diamond',
    emoji: '💎',
    minXp: 1200,
    maxXp: 1600,
    bgClass: 'bg-[#E8F4FF]',
    textClass: 'text-[#1565C0]',
    borderClass: 'border-[#90CAF9]',
    pillBg: 'bg-[#E8F4FF]',
    pillText: 'text-[#1565C0]',
    pillBorder: 'border-[#90CAF9]',
  },
  Platinum: {
    label: 'Platinum',
    emoji: '👑',
    minXp: 1600,
    maxXp: 2400,
    bgClass: 'bg-[#F0ECFF]',
    textClass: 'text-[#5E35B1]',
    borderClass: 'border-[#CE93D8]',
    pillBg: 'bg-[#F0ECFF]',
    pillText: 'text-[#5E35B1]',
    pillBorder: 'border-[#CE93D8]',
  },
};

/** Animated number that counts up/down when value changes */
function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const [displayed, setDisplayed] = useState(value);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const prevRef = useRef(value);

  useEffect(() => {
    if (value === prevRef.current) return;
    const direction = value > prevRef.current ? 'up' : 'down';
    setFlash(direction);

    // Count animation
    const start = prevRef.current;
    const end = value;
    const diff = end - start;
    const steps = Math.min(Math.abs(diff), 20);
    const stepValue = diff / steps;
    let current = start;
    let step = 0;

    const interval = setInterval(() => {
      step++;
      current += stepValue;
      setDisplayed(Math.round(step === steps ? end : current));
      if (step >= steps) clearInterval(interval);
    }, 30);

    const flashTimer = setTimeout(() => setFlash(null), 800);
    prevRef.current = value;

    return () => {
      clearInterval(interval);
      clearTimeout(flashTimer);
    };
  }, [value]);

  return (
    <span
      className={`transition-colors duration-300 ${
        flash === 'up'
          ? 'text-green-500'
          : flash === 'down'
          ? 'text-red-400'
          : ''
      } ${className ?? ''}`}
    >
      {displayed.toLocaleString()}
    </span>
  );
}

export const Navbar: React.FC<NavbarProps> = ({ onMenuClick }) => {
  const activeScreen = useAppSelector((state) => state.app.activeScreen);
  const user = useAppSelector((state) => state.app.user);

  const level = user.level ?? 'Gold';
  const lvlCfg = LEVEL_CONFIG[level] ?? LEVEL_CONFIG.Gold;

  // XP progress toward next level
  const xpInLevel = user.xpPoints - lvlCfg.minXp;
  const xpRange = lvlCfg.maxXp - lvlCfg.minXp;
  const xpPct = Math.min(100, Math.max(0, Math.round((xpInLevel / xpRange) * 100)));
  const xpToNext = Math.max(0, lvlCfg.maxXp - user.xpPoints);
  const isMaxLevel = level === 'Platinum';
  const getScreenTitle = () => {
    switch (activeScreen) {
      case 0:
        return 'Student Dashboard';
      case 2:
        return 'Scan Homework';
      case 3:
        return 'Step-by-Step Explanation';
      case 4:
        return 'Daily Practice Quiz';
      case 5:
        return 'My Progress';
      case 6:
        return 'Vidya AI Tutor';
      case 7:
        return 'Study Plan';
      default:
        return 'Vidya Homework Assistant';
    }
  };

  return (
    <header className="h-16 bg-white border-b border-gray-100 flex items-center justify-between px-6 shrink-0 z-20">
      {/* Screen Title & Hamburger */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
          aria-label="Open navigation sidebar"
        >
          <Menu className="w-6 h-6" />
        </button>
        <h2 className="font-nunito font-black text-base md:text-lg text-gray-800 leading-none">
          {getScreenTitle()}
        </h2>
      </div>

      {/* User Stats Widgets */}
      <div className="flex items-center gap-2 md:gap-3 font-nunito select-none">

        {/* ── Streak ── */}
        <div
          className="flex items-center gap-1.5 bg-orange-50 px-3 py-1.5 rounded-full border border-orange-100/70 transition-all"
          title={`${user.streak}-day study streak 🔥`}
        >
          <span className="text-base select-none">🔥</span>
          <AnimatedNumber
            value={user.streak}
            className="text-xs md:text-sm font-black text-brand-orange"
          />
          <span className="hidden md:inline text-[10px] text-brand-orange font-bold uppercase tracking-wider">
            Days
          </span>
        </div>

        {/* ── XP Points with progress ring tooltip ── */}
        <div
          className="relative group flex items-center gap-1.5 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-100/70 cursor-default"
          title={isMaxLevel ? '👑 Max Level Reached!' : `${xpToNext} XP to ${Object.keys(LEVEL_CONFIG)[Object.keys(LEVEL_CONFIG).indexOf(level) + 1]}`}
        >
          <span className="text-base select-none">⭐</span>
          <AnimatedNumber
            value={user.xpPoints}
            className="text-xs md:text-sm font-black text-brand-amber"
          />
          <span className="hidden md:inline text-[10px] text-brand-amber font-bold uppercase tracking-wider">XP</span>

          {/* Hover tooltip showing progress */}
          <div className="pointer-events-none absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50 hidden group-hover:flex flex-col items-center gap-1.5 bg-white border border-gray-100 shadow-lg rounded-2xl px-4 py-3 w-52">
            <div className="flex items-center justify-between w-full text-[10px] font-black text-gray-500 uppercase tracking-wider">
              <span>{lvlCfg.emoji} {level}</span>
              <span>{isMaxLevel ? 'MAX' : `→ next level`}</span>
            </div>
            {/* Progress bar */}
            <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-brand-amber transition-all duration-500"
                style={{ width: `${isMaxLevel ? 100 : xpPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between w-full">
              <span className="text-[10px] font-extrabold text-gray-600">
                {user.xpPoints.toLocaleString()} XP
              </span>
              <span className="text-[10px] font-extrabold text-gray-400">
                {isMaxLevel ? '✨ Maxed out!' : `${xpToNext} to go`}
              </span>
            </div>
          </div>
        </div>

        {/* ── Level Badge — fully dynamic per tier ── */}
        <div
          className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-black transition-all duration-500 ${lvlCfg.pillBg} ${lvlCfg.pillText} ${lvlCfg.pillBorder}`}
          title={`You are ${level} rank — ${isMaxLevel ? 'Max level!' : `${xpToNext} XP to next level`}`}
        >
          <span className="text-sm">{lvlCfg.emoji}</span>
          <span>{level}</span>
          {/* Tiny XP ring progress bar underneath label */}
          {!isMaxLevel && (
            <div className="hidden lg:flex items-center gap-1 ml-1">
              <div className="w-12 h-1.5 rounded-full bg-black/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-current opacity-60 transition-all duration-700"
                  style={{ width: `${xpPct}%` }}
                />
              </div>
              <span className="text-[9px] opacity-60">{xpPct}%</span>
            </div>
          )}
        </div>

        {/* ── Avatar ── */}
        <div
          className={`w-9 h-9 rounded-full border-2 flex items-center justify-center text-lg transition-all duration-500 ${lvlCfg.borderClass} bg-white`}
          title={user.name}
        >
          {user.avatar}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
