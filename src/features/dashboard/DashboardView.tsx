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

  const handleResumeHomework = async (analysisId: number) => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('vidya-latest-analysis-id', String(analysisId));
    }
    dispatch(setActiveScreen(3));
    try {
      await updateScreen(3);
    } catch (error) {
      console.error('Unable to persist screen change', error);
    }
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
    const normalized = (id ?? '').toLowerCase().trim();
    if (normalized === 'science') return 'sci';
    if (normalized === 'english') return 'eng';
    if (normalized === 'tamil') return 'tam';
    if (normalized === 'history') return 'hist';
    if (normalized === 'maths' || normalized === 'mathematics') return 'math';
    if (normalized === 'geography') return 'geo';
    if (normalized === 'general_knowledge' || normalized === 'general knowledge') return 'gk';
    if (normalized === 'other') return 'other';
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

          {/* Recent Homework Section */}
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider">
                Recent Homework
              </h4>
              <span className="text-[10px] font-black bg-brand-purpleLight text-brand-purple px-2 py-0.5 rounded-full uppercase">
                History
              </span>
            </div>

            {dashboard?.recentHomework && dashboard.recentHomework.length > 0 ? (
              <div className="space-y-3">
                {dashboard.recentHomework.map((hw) => {
                  const uploadDate = new Date(hw.createdAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  });
                  const lastViewedDate = hw.lastViewedAt
                    ? new Date(hw.lastViewedAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Not viewed yet';

                  return (
                    <div
                      key={hw.analysisId}
                      className="group rounded-2xl border border-gray-100 p-4 bg-gray-50/40 hover:bg-gray-50 transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="text-2xl p-2.5 rounded-xl bg-white border border-gray-100 shrink-0 shadow-sm group-hover:scale-105 transition-transform duration-200">
                          {hw.subjectEmoji}
                        </div>
                        <div className="min-w-0 space-y-1">
                          <h5 className="text-sm font-black text-gray-800 leading-snug truncate pr-2">
                            {hw.title}
                          </h5>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-gray-500">
                            <span>Uploaded: <span className="text-gray-700">{uploadDate}</span></span>
                            <span className="w-1 h-1 rounded-full bg-gray-300 hidden sm:inline" />
                            <span>Last viewed: <span className="text-brand-purple">{lastViewedDate}</span></span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
                        <Badge variant={getBadgeVariant(hw.subjectId) as any} className="text-[10px] uppercase font-extrabold px-2.5 py-0.5">
                          {hw.subjectEmoji} {hw.subjectName}
                        </Badge>
                        <button
                          type="button"
                          onClick={() => handleResumeHomework(hw.analysisId)}
                          className="bg-brand-orange text-white border-none py-1.5 px-4 rounded-xl text-xs font-black shadow-[0_3px_0_#C84B1E] hover:translate-y-[1px] hover:shadow-[0_2px_0_#C84B1E] active:translate-y-[3px] active:shadow-none transition-all cursor-pointer outline-none"
                        >
                          Resume ⚡
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center py-6 space-y-3">
                <div className="text-4xl">📚</div>
                <div className="space-y-1">
                  <div className="text-sm font-black text-gray-700">No Homework Session Yet</div>
                  <div className="text-xs text-gray-500 font-semibold leading-relaxed max-w-xs">
                    Your sessions history will appear here once you upload homework.
                  </div>
                </div>
              </div>
            )}
          </div>

          <div ref={studyPlanRef} className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider">
                Today's Study Plan
              </h4>
              <button
                type="button"
                onClick={() => void handleActionClick(7)}
                className="text-xs font-bold text-brand-orange hover:underline flex items-center gap-1"
              >
                Open Planner →
              </button>
            </div>

            {planItems.length > 0 ? (
              <div className="space-y-3">
                {planItems.slice(0, 4).map((item) => (
                  <div key={item.id} className="rounded-2xl border border-gray-100 p-4 bg-gray-50/70">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-black leading-snug ${item.progress === 100 ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                          {item.title}
                        </div>
                        <div className="text-xs text-gray-500 font-semibold mt-0.5 truncate">{item.description}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {item.progress === 100 && (
                          <span className="text-[10px] font-black bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full uppercase">Done ✓</span>
                        )}
                        <Badge
                          variant={item.priority === 'high' ? 'orange' : item.priority === 'medium' ? 'default' : 'green'}
                          className="shrink-0 text-[10px] font-black"
                        >
                          {item.priority}
                        </Badge>
                      </div>
                    </div>
                    <div className="mt-3">
                      <ProgressCard
                        name={item.title}
                        emoji={item.progress === 100 ? '✅' : '📘'}
                        progress={item.progress}
                        barColor={item.priority === 'high' ? 'orange' : item.priority === 'medium' ? 'purple' : 'green'}
                      />
                    </div>
                  </div>
                ))}
                {planItems.length > 4 && (
                  <button
                    type="button"
                    onClick={() => void handleActionClick(7)}
                    className="w-full text-xs font-bold text-brand-orange hover:underline text-center py-1"
                  >
                    + {planItems.length - 4} more tasks — View full plan →
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center py-6 space-y-4">
                <div className="text-4xl">🗓️</div>
                <div className="space-y-1">
                  <div className="text-sm font-black text-gray-700">No Study Plan Yet</div>
                  <div className="text-xs text-gray-500 font-semibold leading-relaxed max-w-xs">
                    Upload your syllabus or textbook and let Vidya AI build a personalized day-by-day study schedule.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleActionClick(7)}
                  className="text-xs font-black text-white bg-brand-orange hover:bg-brand-orangeDark px-5 py-2.5 rounded-xl transition-all shadow-sm active:scale-95"
                >
                  Create My Study Plan ✨
                </button>
              </div>
            )}
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
