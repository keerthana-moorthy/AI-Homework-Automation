import React from 'react';
import { useAppDispatch, useAppSelector } from '../../store';
import { setActiveScreen } from '../../store/slices/appSlice';
import { SUBJECTS, ACTION_CARDS } from '../../constants/mockData';
import ActionCard from '../../components/common/ActionCard';
import ProgressCard from '../../components/common/ProgressCard';
import Badge from '../../components/common/Badge';

export const DashboardView: React.FC = () => {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.app.user);

  const handleActionClick = (targetScreen: number) => {
    dispatch(setActiveScreen(targetScreen));
  };

  // Helper to map color strings to ProgressBar component colors
  const getBarColor = (id: string): 'orange' | 'purple' | 'green' | 'blue' => {
    if (id === 'maths') return 'orange';
    if (id === 'science') return 'purple';
    if (id === 'english') return 'green';
    return 'blue';
  };

  // Helper to resolve badge variants matching subject IDs
  const getBadgeVariant = (id: string) => {
    if (['maths', 'sci', 'eng', 'tam', 'hist'].includes(id)) {
      if (id === 'science') return 'sci';
      if (id === 'english') return 'eng';
      if (id === 'tamil') return 'tam';
      if (id === 'history') return 'hist';
      return 'math';
    }
    return 'default';
  };

  return (
    <div className="space-y-6">
      
      {/* Welcome Banner Card */}
      <div className="bg-gradient-to-r from-brand-orange to-brand-amber rounded-3xl p-6 md:p-8 text-white relative overflow-hidden shadow-sm">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h3 className="text-xl md:text-2xl font-black mb-1">Good morning, {user.name}! 👋</h3>
            <p className="text-xs md:text-sm text-white/90 font-semibold">{user.className} • Today's homework is ready</p>
          </div>
          <div className="flex gap-4 items-center bg-white/15 backdrop-blur-sm rounded-2xl px-5 py-3 border border-white/10 shrink-0">
            <div className="text-center border-r border-white/20 pr-4">
              <div className="text-xl md:text-2xl font-black">🔥 {user.streak}</div>
              <div className="text-[9px] uppercase tracking-wider font-extrabold text-white/80">Day Streak</div>
            </div>
            <div className="text-center pr-4 border-r border-white/20">
              <div className="text-xl md:text-2xl font-black">⭐ {user.xpPoints}</div>
              <div className="text-[9px] uppercase tracking-wider font-extrabold text-white/80">XP Points</div>
            </div>
            <div className="text-center">
              <div className="text-xl md:text-2xl font-black">🏆</div>
              <div className="text-[9px] uppercase tracking-wider font-extrabold text-white/80">{user.level}</div>
            </div>
          </div>
        </div>
        {/* Abstract background blobs */}
        <div className="absolute right-0 top-0 w-48 h-48 bg-white/5 rounded-full blur-2xl -mr-16 -mt-16 pointer-events-none" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Quick Actions & Subjects */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Quick Actions Grid */}
          <div>
            <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3.5">
              Quick Actions
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {ACTION_CARDS.map((card) => (
                <ActionCard
                  key={card.id}
                  emoji={card.emoji}
                  label={card.label}
                  subtext={card.subtext}
                  cardType={card.cardType}
                  onClick={() => handleActionClick(card.targetScreen)}
                />
              ))}
            </div>
          </div>

          {/* Subjects Badge Bar */}
          <div>
            <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3">
              Your Subjects
            </h4>
            <div className="flex gap-2.5 flex-wrap">
              {SUBJECTS.map((sub) => (
                <Badge 
                  key={sub.id} 
                  variant={getBadgeVariant(sub.id) as any}
                  className="cursor-pointer py-1.5 px-4 text-xs font-extrabold hover:scale-105 transition-transform"
                >
                  {sub.emoji} {sub.name}
                </Badge>
              ))}
            </div>
          </div>

        </div>

        {/* Right Column: Weekly Progress Widget */}
        <div className="lg:col-span-4 space-y-4">
          <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider">
            This Week's Progress
          </h4>
          
          <div className="space-y-3.5">
            {SUBJECTS.slice(0, 3).map((sub) => (
              <ProgressCard
                key={sub.id}
                name={sub.name}
                emoji={sub.emoji}
                progress={sub.progress}
                barColor={getBarColor(sub.id)}
              />
            ))}
          </div>
        </div>

      </div>

    </div>
  );
};

export default DashboardView;
