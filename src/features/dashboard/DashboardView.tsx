import React, { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../store';
import { hydrateSession, setActiveScreen, setSelectedSubjectId, setUser } from '../../store/slices/appSlice';
import { SUBJECTS } from '../../constants/mockData';
import ProgressCard from '../../components/common/ProgressCard';
import Badge from '../../components/common/Badge';
import { getDashboard, getQuiz, toUserState, updateScreen, updateSubject, toggleStudyPlanTask } from '../../services/api';
import { Calendar, BookOpen, Clock, CheckSquare, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';

export const DashboardView: React.FC = () => {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.app.user);
  const selectedSubjectId = useAppSelector((state) => state.app.selectedSubjectId);
  const [dashboard, setDashboard] = useState<Awaited<ReturnType<typeof getDashboard>> | null>(null);
  const [activeTab, setActiveTab] = useState<'actions' | 'homework'>('actions');
  const [loadingData, setLoadingData] = useState(true);
  const [xpAnimation, setXpAnimation] = useState(false);
  const [togglingItemId, setTogglingItemId] = useState<string | null>(null);
  const [carryOverOpen, setCarryOverOpen] = useState(false);

  const getLocalDateString = () => {
    const date = new Date();
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
  };

  const loadDashboardData = async () => {
    try {
      setLoadingData(true);
      const todayStr = getLocalDateString();
      const response = await getDashboard(todayStr);
      setDashboard(response);
    } catch (error) {
      console.error('Unable to load dashboard', error);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    void loadDashboardData();
  }, []);

  const handleActionClick = async (targetScreen: number) => {
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
      const todayStr = getLocalDateString();
      const refreshedDashboard = await getDashboard(todayStr);
      setDashboard(refreshedDashboard);
    } catch (error) {
      console.error('Unable to update subject', error);
    }
  };

  const handleTaskToggle = async (item: any) => {
    if (!dashboard) return;
    setTogglingItemId(item.id);

    const currentCompleted = item.completed;
    const targetCompleted = !currentCompleted;

    // Snapshot current XP for potential revert
    const prevXp = user?.xpPoints ?? 0;
    const prevLevel = user?.level ?? 'Bronze';

    // Optimistic local state update
    const updatedActionItems = (dashboard.todayActionItems ?? []).map((action) => {
      if (action.id === item.id) {
        return { ...action, completed: targetCompleted };
      }
      return action;
    });
    setDashboard({ ...dashboard, todayActionItems: updatedActionItems });

    // Optimistic XP animation only (no Redux dispatch yet — server is authoritative)
    if (targetCompleted) {
      setXpAnimation(true);
      setTimeout(() => setXpAnimation(false), 2000);
    }

    try {
      // API call — backend persists XP and returns updated xpPoints + level
      const response = await toggleStudyPlanTask(item.planId, item.dayNum, item.taskIndex, targetCompleted) as any;

      // Sync Redux with server-authoritative XP so it survives refresh
      if (typeof response?.xpPoints === 'number') {
        dispatch(setUser({ xpPoints: response.xpPoints, level: response.level }));
      }

      // Refresh dashboard to sync all fields (e.g. progress, carry-over)
      const todayStr = getLocalDateString();
      const refreshedDashboard = await getDashboard(todayStr);
      setDashboard(refreshedDashboard);
    } catch (error) {
      console.error('Failed to toggle study plan task', error);
      // Revert local state
      const revertedActionItems = (dashboard.todayActionItems ?? []).map((action) => {
        if (action.id === item.id) {
          return { ...action, completed: currentCompleted };
        }
        return action;
      });
      setDashboard({ ...dashboard, todayActionItems: revertedActionItems });
      // Revert XP to pre-toggle value
      dispatch(setUser({ xpPoints: prevXp, level: prevLevel }));
    } finally {
      setTogglingItemId(null);
    }
  };

  // Helper to map color strings to ProgressBar component colors
  const getBarColor = (id: string): 'orange' | 'purple' | 'green' | 'blue' => {
    if (id === 'maths') return 'orange';
    if (id === 'science') return 'purple';
    if (id === 'english') return 'green';
    if (id === 'tamil') return 'blue';
    if (id === 'history') return 'orange';
    if (id === 'geography') return 'blue';
    if (id === 'social') return 'orange';
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
    if (normalized === 'social') return 'soc';
    return 'default';
  };

  const dashboardSubjects = dashboard?.subjects ?? SUBJECTS;
  const weeklyProgress = dashboard?.weeklyProgress ?? SUBJECTS.slice(0, 3);
  const dashboardUser = dashboard?.user ?? user;

  const SUBJECT_KEYWORDS: Record<string, string[]> = {
    maths: ['math', 'algebra', 'geometry', 'arithmetic', 'number', 'equation', 'fraction', 'decimal', 'ratio', 'proportion', 'formula'],
    science: ['science', 'physic', 'chemist', 'biolog', 'photosynthesis', 'cell', 'plant', 'leaf', 'tree', 'animal', 'organism'],
    english: ['english', 'grammar', 'prose', 'poem', 'literature', 'comprehension', 'vocabulary', 'sentence', 'noun', 'verb'],
    tamil: ['tamil', 'thirukkural', 'sangam', 'tamil nadu'],
    social: ['history', 'social', 'civics', 'geography', 'empire', 'warli', 'painting', 'india', 'dynasty', 'map'],
  };

  const filteredActionItems = (dashboard?.todayActionItems ?? []).filter((item) => {
    if (!selectedSubjectId || selectedSubjectId === 'all') return true;
    const keywords = SUBJECT_KEYWORDS[selectedSubjectId] || [];
    const textToSearch = `${item.title} ${item.planTitle}`.toLowerCase();
    return keywords.some((keyword) => textToSearch.includes(keyword));
  });

  const filteredHomework = (dashboard?.todayHomework ?? []).filter((item) => {
    if (!selectedSubjectId || selectedSubjectId === 'all') return true;
    return item.subjectId === selectedSubjectId;
  });

  return (
    <div className="space-y-6 font-nunito relative">
      {/* Gamified XP Reward Notification */}
      {xpAnimation && (
        <div className="fixed top-6 right-6 bg-brand-orange text-white px-6 py-3.5 rounded-2xl shadow-xl z-50 flex items-center gap-2 animate-[slideIn_0.3s_ease-out] font-black border-2 border-white">
          <span>🎉</span> +10 XP Earned! Keep going!
        </div>
      )}

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
        
        {/* Left Column: Tabbed daily items & Subjects */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Subjects Badge Bar */}
          <div>
            <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3">
              Your Subjects
            </h4>
            <div className="flex gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={() => void handleSubjectClick('all')}
                className="bg-transparent border-none p-0 cursor-pointer"
              >
                <Badge 
                  variant="default"
                  className={`py-1.5 px-4 text-xs font-extrabold hover:scale-105 transition-transform ${
                    selectedSubjectId === 'all' || !selectedSubjectId ? 'ring-2 ring-brand-purple ring-offset-2 ring-offset-white font-black' : ''
                  }`}
                >
                  🌐 All
                </Badge>
              </button>

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
                          {hw.subjectEmoji || '📝'}
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

          {/* Tabbed Navigation container */}
          <div ref={studyPlanRef} className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
              <div className="flex bg-gray-50 border border-gray-150 p-1 rounded-2xl gap-1 shrink-0 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setActiveTab('actions')}
                  className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer border-none outline-none flex items-center justify-center gap-2 ${
                    activeTab === 'actions'
                      ? 'bg-brand-orange text-white shadow-sm'
                      : 'bg-transparent text-gray-500 hover:text-brand-orange hover:bg-orange-50/40'
                  }`}
                >
                  <CheckSquare className="w-4 h-4 shrink-0" />
                  <span>Today's Action Items</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('homework')}
                  className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer border-none outline-none flex items-center justify-center gap-2 ${
                    activeTab === 'homework'
                      ? 'bg-brand-orange text-white shadow-sm'
                      : 'bg-transparent text-gray-500 hover:text-brand-orange hover:bg-orange-50/40'
                  }`}
                >
                  <BookOpen className="w-4 h-4 shrink-0" />
                  <span>Today's Homework</span>
                </button>
              </div>

              {/* Open Planner button */}
              <button
                type="button"
                onClick={() => void handleActionClick(7)}
                className="text-xs font-black text-brand-orange hover:underline flex items-center gap-1.5 self-end sm:self-center shrink-0 border-none bg-transparent cursor-pointer"
              >
                <span>Open Planner</span>
                <Calendar className="w-3.5 h-3.5 shrink-0" />
              </button>
            </div>

            {/* Tab content loading / data display */}
            {loadingData ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-3">
                <div className="w-8 h-8 border-4 border-brand-orange border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-gray-500 font-extrabold select-none">Fetching daily agenda...</span>
              </div>
            ) : activeTab === 'actions' ? (
              /* Tab 2: Action Items list */
              <div className="space-y-4">
                {/* ── Carry-Over Banner ── */}
                {(() => {
                  const carryItems: any[] = (dashboard as any)?.carryOverItems ?? [];
                  if (carryItems.length === 0) return null;
                  return (
                    <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/60 overflow-hidden">
                      {/* Banner header – always visible */}
                      <button
                        type="button"
                        onClick={() => setCarryOverOpen(o => !o)}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 cursor-pointer bg-transparent border-none text-left"
                      >
                        <div className="flex items-center gap-2.5">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                          <span className="text-xs font-black text-amber-700">
                            {carryItems.length} pending task{carryItems.length > 1 ? 's' : ''} from previous day{carryItems.length > 1 ? 's' : ''}
                          </span>
                          <span className="text-[9px] font-black uppercase bg-amber-200 text-amber-700 px-2 py-0.5 rounded-full animate-pulse">
                            Carry-Over
                          </span>
                        </div>
                        {carryOverOpen
                          ? <ChevronUp className="w-4 h-4 text-amber-500 shrink-0" />
                          : <ChevronDown className="w-4 h-4 text-amber-500 shrink-0" />}
                      </button>
                      {/* Expandable task list */}
                      {carryOverOpen && (
                        <div className="px-4 pb-4 space-y-2 border-t border-amber-200">
                          <p className="text-[10px] text-amber-600 font-semibold pt-2 pb-1">
                            Complete these to catch up with your study plan:
                          </p>
                          {carryItems.map((item: any) => (
                            <div
                              key={item.id}
                              className="group rounded-xl border border-amber-200 bg-white p-3 flex items-start gap-3"
                            >
                              {/* Checkbox */}
                              <button
                                type="button"
                                onClick={() => void handleTaskToggle(item)}
                                disabled={togglingItemId === item.id}
                                className="w-5 h-5 rounded-md border-2 border-amber-400 bg-white flex items-center justify-center shrink-0 mt-0.5 cursor-pointer outline-none hover:border-amber-600"
                              >
                                {togglingItemId === item.id && (
                                  <div className="w-2.5 h-2.5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                                )}
                              </button>
                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-black text-gray-800 leading-snug">{item.title}</div>
                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 truncate max-w-[140px]">
                                    {item.planTitle}
                                  </span>
                                  {item.originalDate && (
                                    <span className="text-[9px] font-extrabold text-gray-400 flex items-center gap-0.5">
                                      <Calendar className="w-3 h-3 shrink-0" />
                                      Due {item.originalDate}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Today's tasks */}
                {filteredActionItems.length > 0 ? (
                <div className="space-y-3">
                  {filteredActionItems.map((item) => (
                    <div 
                      key={item.id} 
                      className={`group rounded-2xl border p-4 transition-all duration-200 flex items-start gap-4 hover:shadow-xs ${
                        item.completed 
                          ? 'border-green-100 bg-green-50/30' 
                          : 'border-gray-100 bg-gray-50/60 hover:bg-white'
                      }`}
                    >
                      {/* Checkbox button */}
                      <button
                        type="button"
                        onClick={() => void handleTaskToggle(item)}
                        disabled={togglingItemId === item.id}
                        className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all select-none cursor-pointer outline-none ${
                          item.completed 
                            ? 'border-green-500 bg-green-500 text-white hover:bg-green-600' 
                            : 'border-gray-350 bg-white hover:border-brand-orange'
                        }`}
                      >
                        {item.completed ? (
                          <CheckCircle2 className="w-4 h-4 shrink-0 text-white" strokeWidth={3} />
                        ) : togglingItemId === item.id ? (
                          <div className="w-2.5 h-2.5 border-2 border-brand-orange border-t-transparent rounded-full animate-spin" />
                        ) : null}
                      </button>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-black leading-snug transition-all ${
                          item.completed ? 'line-through text-gray-400' : 'text-gray-800'
                        }`}>
                          {item.title}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-orange-50 text-brand-orange border border-brand-orange/10 truncate max-w-[150px]">
                            {item.planTitle}
                          </span>
                          {item.estimatedHours !== null && (
                            <span className="text-[10px] text-gray-400 font-extrabold flex items-center gap-1">
                              <Clock className="w-3 h-3 shrink-0" />
                              {item.estimatedHours} {item.estimatedHours === 1 ? 'hr' : 'hrs'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Completion flag */}
                      {item.completed && (
                        <span className="text-[9px] font-black bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full uppercase shrink-0 select-none">
                          Done
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                ) : (
                  /* Tab 2 Empty State */
                  <div className="flex flex-col items-center justify-center text-center py-10 space-y-4 animate-[fadeIn_0.2s_ease-out]">
                    <div className="text-4xl">🗓️</div>
                    <div className="space-y-1">
                      <div className="text-sm font-black text-gray-700">No Study Activities Planned</div>
                      <p className="text-xs text-gray-500 font-semibold leading-relaxed max-w-xs">
                        No study activities planned for today.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleActionClick(7)}
                      className="text-xs font-black text-white bg-brand-orange hover:bg-brand-orangeDark px-5 py-2.5 rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer border-none"
                    >
                      Go to Study Plan ✨
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Tab 1: Today's Homework list */
              filteredHomework.length > 0 ? (
                <div className="space-y-3">
                  {filteredHomework.map((item) => (
                    <div 
                      key={item.id} 
                      className="group rounded-2xl border border-gray-100 p-4 bg-gray-50/60 hover:bg-white hover:shadow-xs transition-all duration-200 flex items-start gap-4"
                    >
                      {/* Emoji container */}
                      <div className="w-10 h-10 rounded-2xl bg-orange-50/60 border border-brand-orange/10 flex items-center justify-center text-xl shrink-0 select-none">
                        {item.subjectEmoji ?? '📚'}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-black leading-snug text-gray-800 break-words">
                          {item.title}
                        </div>
                        <div className="flex flex-wrap items-center gap-2.5 mt-2">
                          {item.subjectName && (
                            <Badge 
                              variant={getBadgeVariant(item.subjectId ?? 'maths') as any}
                              className="text-[10px] font-black shrink-0"
                            >
                              {item.subjectName}
                            </Badge>
                          )}
                          <span className="text-[10px] text-gray-400 font-extrabold flex items-center gap-1">
                            <Clock className="w-3 h-3 shrink-0" />
                            Due: {item.dueDate}
                          </span>
                        </div>
                      </div>

                      {/* Status flag */}
                      <span className={`text-[9px] font-black border px-2 py-0.5 rounded-full uppercase shrink-0 select-none ${
                        item.status === 'Completed'
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse'
                      }`}>
                        {item.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                /* Tab 1 Empty State */
                <div className="flex flex-col items-center justify-center text-center py-10 space-y-4 animate-[fadeIn_0.2s_ease-out]">
                  <div className="text-4xl">📚</div>
                  <div className="space-y-1">
                    <div className="text-sm font-black text-gray-700">No Homework Scheduled</div>
                    <p className="text-xs text-gray-500 font-semibold leading-relaxed max-w-xs">
                      No homework scheduled for today.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleActionClick(2)}
                    className="text-xs font-black text-white bg-brand-orange hover:bg-brand-orangeDark px-5 py-2.5 rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer border-none"
                  >
                    Scan New Homework 📸
                  </button>
                </div>
              )
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
