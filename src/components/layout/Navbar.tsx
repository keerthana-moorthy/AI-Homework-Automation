import React from 'react';
import { useAppSelector } from '../../store';
import { Menu } from 'lucide-react';

interface NavbarProps {
  onMenuClick: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onMenuClick }) => {
  const activeScreen = useAppSelector((state) => state.app.activeScreen);
  const user = useAppSelector((state) => state.app.user);

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
        return 'Parent Monitoring Portal';
      case 1:
        return 'Vidya AI Intro Tour';
      default:
        return 'Vidya Homework Assistant';
    }
  };

  return (
    <header className="h-16 bg-white border-b border-gray-150 flex items-center justify-between px-6 shrink-0 z-20">
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
      <div className="flex items-center gap-3 md:gap-5 font-nunito select-none">
        {/* Streak */}
        <div className="flex items-center gap-1.5 bg-orange-50 px-3 py-1.5 rounded-full border border-orange-100/70" title="Daily Streak">
          <span className="text-base select-none">🔥</span>
          <span className="text-xs md:text-sm font-black text-brand-orange">{user.streak}</span>
          <span className="hidden md:inline text-[10px] text-brand-orange font-bold uppercase tracking-wider">Days</span>
        </div>

        {/* XP Points */}
        <div className="flex items-center gap-1.5 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-100/70" title="XP Points">
          <span className="text-base select-none">⭐</span>
          <span className="text-xs md:text-sm font-black text-brand-amber">{user.xpPoints}</span>
          <span className="hidden md:inline text-[10px] text-brand-amber font-bold uppercase tracking-wider">XP</span>
        </div>

        {/* Badge Level */}
        <div className="hidden sm:flex items-center gap-1 bg-yellow-50 text-brand-yellowDark border border-brand-yellowBorder px-3 py-1 rounded-full text-xs font-black">
          🏆 {user.level}
        </div>

        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-brand-orange/10 border-2 border-brand-orange flex items-center justify-center text-lg">
          {user.avatar}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
