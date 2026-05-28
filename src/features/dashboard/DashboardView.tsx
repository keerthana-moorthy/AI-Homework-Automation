import React, { useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../store';
import { hydrateSession, setActiveScreen, setSelectedSubjectId } from '../../store/slices/appSlice';
import { SUBJECTS, ACTION_CARDS } from '../../constants/mockData';
import ActionCard from '../../components/common/ActionCard';
import ProgressCard from '../../components/common/ProgressCard';
import Badge from '../../components/common/Badge';
import { getDashboard, getQuiz, toUserState, updateScreen, updateSubject } from '../../services/api';

export const DashboardView: React.FC = () => {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.app.user);
  const selectedSubjectId = useAppSelector((state) => state.app.selectedSubjectId);
  const studyPlanRef = useRef<HTMLDivElement>(null);
  const [dashboard, setDashboard] = useState<Awaited<ReturnType<typeof getDashboard>> | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadDashboard = async () => {
      try {
        const response = await getDashboard();
        if (!mounted) return;
        setDashboard(response);
      } catch (error) {
        console.error('Unable to load dashboard', error);
      }
    };

    void loadDashboard();

    return () => {
      mounted = false;
    };
  }, []);

  const handleActionClick = async (targetScreen: number) => {
    if (targetScreen === 0) {
      studyPlanRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (targetScreen === 4) {
      try {
        await getQuiz();
      } catch (error) {
        console.error('Unable to prepare quiz', error);
      }
    }

    dispatch(setActiveScreen(targetScreen));
    void updateScreen(targetScreen).catch((error) => {
      console.error('Unable to persist screen change', error);
    });
  };

  const handleSubjectClick = async (subjectId: string) => {
    dispatch(setSelectedSubjectId(subjectId));
    try {
      const response = await updateSubject(subjectId);
      dispatch(
        hydrateSession({
          loggedIn: response.session.loggedIn,
          activeScreen: response.session.activeScreen,
          language: response.session.language,
          selectedSubjectId: response.session.selectedSubjectId,
          user: toUserState(response.user),
        })
      );
      const refreshedDashboard = await getDashboard();
      setDashboard(refreshedDashboard);
    } catch (error) {
      console.error('Unable to update subject', error);
    }
  };

  // Helper to map color strings to ProgressBar component colors
  const getBarColor = (id: string): 'orange' | 'purple' | 'green' | 'blue' => {
    if (id === 'maths') return 'orange';
    if (id === 'science') return 'purple';
    if (id === 'english') return 'green';
    if (id === 'tamil') return 'blue';
    return 'orange';
  };

  // Helper to resolve badge variants matching subject IDs
  const getBadgeVariant = (id: string) => {
    if (id === 'science') return 'sci';
    if (id === 'english') return 'eng';
    if (id === 'tamil') return 'tam';
    if (id === 'history') return 'hist';
    if (id === 'maths') return 'math';
    return 'default';
  };

  const dashboardSubjects = dashboard?.subjects ?? SUBJECTS;
  const dashboardActions = dashboard?.actionCards ?? ACTION_CARDS;
  const weeklyProgress = dashboard?.weeklyProgress ?? SUBJECTS.slice(0, 3);
  const planItems = dashboard?.studyPlan ?? [];
  const dashboardUser = dashboard?.user ?? user;

  return (
    <div className="space-y-6">
      
      {/* Welcome Banner Card */}
      <div className="bg-gradient-to-r from-brand-orange to-brand-amber rounded-3xl p-6 md:p-8 text-white relative overflow-hidden shadow-sm">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h3 className="text-xl md:text-2xl font-black mb-1">Good morning, {dashboardUser.name}! 👋</h3>
            <p className="text-xs md:text-sm text-white/90 font-semibold">{dashboardUser.className} • Today's homework is ready</p>
          </div>
          <div className="flex gap-4 items-center bg-white/15 backdrop-blur-sm rounded-2xl px-5 py-3 border border-white/10 shrink-0">
            <div className="text-center border-r border-white/20 pr-4">
              <div className="text-xl md:text-2xl font-black">🔥 {dashboardUser.streak}</div>
              <div className="text-[9px] uppercase tracking-wider font-extrabold text-white/80">Day Streak</div>
            </div>
            <div className="text-center pr-4 border-r border-white/20">
              <div className="text-xl md:text-2xl font-black">⭐ {dashboardUser.xpPoints}</div>
              <div className="text-[9px] uppercase tracking-wider font-extrabold text-white/80">XP Points</div>
            </div>
            <div className="text-center">
              <div className="text-xl md:text-2xl font-black">🏆</div>
              <div className="text-[9px] uppercase tracking-wider font-extrabold text-white/80">{dashboardUser.level}</div>
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
              {dashboardActions.map((card) => (
                <ActionCard
                  key={card.id}
                  emoji={card.emoji}
                  label={card.label}
                  subtext={card.subtext}
                  cardType={card.cardType}
                  onClick={() => void handleActionClick(card.targetScreen)}
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
              {dashboardSubjects.map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => void handleSubjectClick(sub.id)}
                  className="bg-transparent border-none p-0 cursor-pointer"
                >
                  <Badge 
                    variant={getBadgeVariant(sub.id) as any}
                    className={`py-1.5 px-4 text-xs font-extrabold hover:scale-105 transition-transform ${
                      selectedSubjectId === sub.id ? 'ring-2 ring-brand-purple ring-offset-2 ring-offset-white' : ''
                    }`}
                  >
                    {sub.emoji} {sub.name}
                  </Badge>
                </button>
              ))}
            </div>
          </div>

          <div ref={studyPlanRef} className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider">
                Today's Study Plan
              </h4>
              <button
                type="button"
                onClick={() => void handleActionClick(0)}
                className="text-xs font-bold text-brand-purple hover:underline"
              >
                Jump to plan
              </button>
            </div>

            <div className="space-y-3">
              {planItems.map((item) => (
                <div key={item.id} className="rounded-2xl border border-gray-100 p-4 bg-gray-50/70">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-gray-800">{item.title}</div>
                      <div className="text-xs text-gray-500 font-semibold mt-1">{item.description}</div>
                    </div>
                    <Badge variant="default" className="shrink-0">
                      {item.priority}
                    </Badge>
                  </div>
                  <div className="mt-3">
                    <ProgressCard
                      name={item.title}
                      emoji="📘"
                      progress={item.progress}
                      barColor={item.priority === 'high' ? 'orange' : item.priority === 'medium' ? 'purple' : 'green'}
                    />
                  </div>
                </div>
              ))}

              {planItems.length === 0 && (
                <div className="text-sm text-gray-500 font-semibold">
                  Your plan will appear here once the backend sends the latest recommendations.
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Right Column: Weekly Progress Widget */}
        <div className="lg:col-span-4 space-y-4">
          <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider">
            This Week's Progress
          </h4>
          
          <div className="space-y-3.5">
            {weeklyProgress.map((sub) => (
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
