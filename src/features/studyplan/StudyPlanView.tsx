import React, { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../store';
import { setActiveScreen, addXp, setUser } from '../../store/slices/appSlice';
import Button from '../../components/common/Button';
import FormUploadZone from '../../components/form/FormUploadZone';
import AIResponseRenderer from '../../components/common/AIResponseRenderer';
import Badge from '../../components/common/Badge';
import {
  getLatestStudyPlan,
  getStudyPlanHistory,
  renameStudyPlan,
  deleteStudyPlan,
  upgradeSubscription,
  generateStudyPlan,
  toggleStudyPlanTask,
  fileToBase64,
  updateScreen,
  toUserState,
  resolveBackendUrl
} from '../../services/api';
import type { StudyPlan } from '../../types/types';
import { 
  Calendar, 
  ChevronDown, 
  ChevronUp, 
  ChevronLeft,
  ChevronRight,
  FileText, 
  Trophy, 
  RefreshCw,
  Clock
} from 'lucide-react';

const chunkText = (text: string, wordsPerChunk: number = 300): string[] => {
  if (!text) return [];
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    chunks.push(words.slice(i, i + wordsPerChunk).join(' '));
  }
  return chunks;
};

export const StudyPlanView: React.FC = () => {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.app.user);
  const subscriptionPlan = user?.subscriptionPlan || 'Free';
  
  // History states
  const [historyPlans, setHistoryPlans] = useState<StudyPlan[]>([]);
  const [historyLimit, setHistoryLimit] = useState<number>(3);
  const [historyUsed, setHistoryUsed] = useState<number>(0);
  const [historyRemaining, setHistoryRemaining] = useState<number>(3);
  const [renamingPlanId, setRenamingPlanId] = useState<number | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [deletingPlanId, setDeletingPlanId] = useState<number | null>(null);
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeSuccessMessage, setUpgradeSuccessMessage] = useState<string | null>(null);

  // Form states
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    return nextWeek.toISOString().split('T')[0];
  });
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [inputMethod, setInputMethod] = useState<'upload' | 'paste'>('upload');
  const [pastedText, setPastedText] = useState('');
  
  // Execution states
  const [studyPlan, setStudyPlan] = useState<StudyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [expandedDay, setExpandedDay] = useState<number | null>(1);
  const [error, setError] = useState<string | null>(null);
  const [xpAnimation, setXpAnimation] = useState<boolean>(false);

  // Extra interactive and layout states
  const [showRawText, setShowRawText] = useState(false);
  const [rawTextPage, setRawTextPage] = useState(1);
  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<number, boolean>>({});

  const toggleDescriptionExpanded = (dayNum: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedDescriptions(prev => ({
      ...prev,
      [dayNum]: !prev[dayNum]
    }));
  };

  const fetchHistory = async () => {
    try {
      const historyData = await getStudyPlanHistory();
      setHistoryPlans(historyData.plans);
      setHistoryLimit(historyData.limit);
      setHistoryUsed(historyData.used);
      setHistoryRemaining(historyData.remaining);
    } catch (err) {
      console.error('Failed to load study plan history', err);
    }
  };

  const handleRename = async (planId: number, newTitle: string) => {
    if (!newTitle.trim()) return;
    try {
      const updated = await renameStudyPlan(planId, newTitle.trim());
      if (studyPlan && studyPlan.id === planId) {
        setStudyPlan(updated);
      }
      setRenamingPlanId(null);
      setRenameTitle('');
      await fetchHistory();
    } catch (err: any) {
      console.error('Failed to rename study plan', err);
      setError(err?.message || 'Failed to rename study plan.');
    }
  };

  const handleDelete = async (planId: number) => {
    try {
      await deleteStudyPlan(planId);
      if (studyPlan && studyPlan.id === planId) {
        setStudyPlan(null);
      }
      setDeletingPlanId(null);
      await fetchHistory();
    } catch (err: any) {
      console.error('Failed to delete study plan', err);
      setError(err?.message || 'Failed to delete study plan.');
    }
  };

  const handleUpgrade = async (planName: string) => {
    setUpgrading(true);
    try {
      const response = await upgradeSubscription(planName);
      dispatch(setUser(toUserState(response.user)));
      setUpgradeSuccessMessage(`Successfully upgraded to ${planName}!`);
      setTimeout(() => setUpgradeSuccessMessage(null), 5000);
      await fetchHistory();
    } catch (err: any) {
      console.error('Upgrade failed', err);
      setError(err?.message || 'Upgrade failed.');
    } finally {
      setUpgrading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const loadAll = async () => {
      try {
        const plan = await getLatestStudyPlan();
        if (mounted && plan) {
          setStudyPlan(plan);
          setShowRawText(false);
          setRawTextPage(1);
          setExpandedDescriptions({});
          const firstUncompletedDay = plan.planData.find(day => 
            day.tasks.some(task => !task.completed)
          );
          if (firstUncompletedDay) {
            setExpandedDay(firstUncompletedDay.dayNum);
          }
        }

        const historyData = await getStudyPlanHistory();
        if (mounted) {
          setHistoryPlans(historyData.plans);
          setHistoryLimit(historyData.limit);
          setHistoryUsed(historyData.used);
          setHistoryRemaining(historyData.remaining);
        }
      } catch (err) {
        console.error('Failed to load study plan data', err);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };
    void loadAll();
    return () => {
      mounted = false;
    };
  }, []);

  const handleBack = () => {
    dispatch(setActiveScreen(0));
    void updateScreen(0).catch((err) => {
      console.error('Failed to update active screen', err);
    });
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate) {
      setError('Please select both start and end dates.');
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      setError('Start date cannot be after end date.');
      return;
    }
    
    setGenerating(true);
    setError(null);
    
    try {
      let payload: any = {
        startDate,
        endDate,
      };

      if (inputMethod === 'paste') {
        if (!pastedText.trim()) {
          setError('Please paste your syllabus text first.');
          setGenerating(false);
          return;
        }
        payload.pastedText = pastedText.trim();
      } else if (uploadedFile) {
        const base64Data = await fileToBase64(uploadedFile);
        payload.fileName = base64Data.fileName;
        payload.fileType = base64Data.fileType;
        payload.fileDataBase64 = base64Data.fileDataBase64;
      }
      
      const newPlan = await generateStudyPlan(payload);
      
      setStudyPlan(newPlan);
      setExpandedDay(1);
      setShowRawText(false);
      setRawTextPage(1);
      setExpandedDescriptions({});
      await fetchHistory();
    } catch (err: any) {
      console.error('Error generating study plan', err);
      setError(err?.message || 'Failed to generate study plan. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleTaskToggle = async (dayNum: number, taskIndex: number, currentCompleted: boolean) => {
    if (!studyPlan) return;

    // Snapshot current XP for potential revert
    const prevXp = user?.xpPoints ?? 0;
    const prevLevel = user?.level ?? 'Bronze';

    // Deep copy for React state update detection
    const updatedPlan = JSON.parse(JSON.stringify(studyPlan));
    const day = updatedPlan.planData.find((d: any) => d.dayNum === dayNum);
    if (!day) return;

    day.tasks[taskIndex].completed = !currentCompleted;

    // Recalculate progress locally for instant feedback
    const totalTasks = updatedPlan.planData.reduce((acc: number, d: any) => acc + d.tasks.length, 0);
    const completedTasks = updatedPlan.planData.reduce((acc: number, d: any) =>
      acc + d.tasks.filter((t: any) => t.completed).length, 0
    );
    updatedPlan.progress = Math.round((completedTasks / Math.max(1, totalTasks)) * 100);
    setStudyPlan(updatedPlan);

    // Optimistic XP animation (Redux update comes from server response)
    if (!currentCompleted) {
      setXpAnimation(true);
      setTimeout(() => setXpAnimation(false), 2000);
    }

    try {
      // Sync with server — backend persists XP and returns updated xpPoints + level
      const response = await toggleStudyPlanTask(studyPlan.id, dayNum, taskIndex, !currentCompleted) as any;
      setStudyPlan(response);

      // Sync Redux with server-authoritative XP so it survives refresh
      if (typeof response?.xpPoints === 'number') {
        dispatch(setUser({ xpPoints: response.xpPoints, level: response.level }));
      }
    } catch (err) {
      console.error('Error syncing task toggle', err);
      // Revert local plan state
      const revertedPlan = JSON.parse(JSON.stringify(studyPlan));
      const revertedDay = revertedPlan.planData.find((d: any) => d.dayNum === dayNum);
      if (revertedDay) {
        revertedDay.tasks[taskIndex].completed = currentCompleted;
      }
      setStudyPlan(revertedPlan);
      // Revert XP to pre-toggle value
      dispatch(setUser({ xpPoints: prevXp, level: prevLevel }));
    }
  };

  const calculateDays = () => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diff = (end.getTime() - start.getTime()) / (1000 * 3600 * 24);
    return Math.max(1, Math.floor(diff) + 1);
  };

  const numDays = calculateDays();

  // Returns local date as YYYY-MM-DD string (avoids UTC shift)
  const getLocalToday = () => {
    const d = new Date();
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - offset * 60 * 1000);
    return local.toISOString().split('T')[0];
  };

  // Helper to count day tasks + compute semantic status relative to today
  const getDayStatus = (day: any) => {
    const total: number = day.tasks?.length ?? 0;
    const completed: number = (day.tasks ?? []).filter((t: any) => t.completed).length;
    const allDone = total > 0 && total === completed;

    const today = getLocalToday();
    const dayDate: string = day.date ?? '';

    let status: 'completed' | 'in_progress' | 'not_started' | 'partial' | 'missed' | 'upcoming';
    if (allDone) {
      status = 'completed';
    } else if (dayDate > today) {
      status = 'upcoming';
    } else if (dayDate === today) {
      status = completed > 0 ? 'in_progress' : 'not_started';
    } else {
      // Past day
      status = completed > 0 ? 'partial' : 'missed';
    }

    return { total, completed, allDone, status };
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-br from-brand-orange to-[#F4511E] text-white p-5 rounded-3xl shadow-sm flex items-center gap-3">
          <Button variant="back" onClick={handleBack}>←</Button>
          <div>
            <h3 className="text-base md:text-lg font-black leading-tight">Loading study planner...</h3>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative font-nunito">
      {/* Gamified XP Reward Notification */}
      {xpAnimation && (
        <div className="fixed top-6 right-6 bg-brand-orange text-white px-6 py-3.5 rounded-2xl shadow-xl z-50 flex items-center gap-2 animate-[slideIn_0.3s_ease-out] font-black border-2 border-white">
          <span>🎉</span> +10 XP Earned! Leveling up!
        </div>
      )}

      {/* Premium Plan Switcher Toolbar */}
      <div className="bg-white border border-gray-150 rounded-3xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4 select-none">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-orange-50 border border-brand-orange/10 flex items-center justify-center text-brand-orange text-lg shadow-xs">
            👑
          </div>
          <div>
            <div className="text-[10px] text-gray-400 font-extrabold uppercase tracking-wider">Subscription Tier Switcher</div>
            <div className="text-xs font-black text-gray-700 flex items-center gap-1.5">
              Current Plan: <span className={
                subscriptionPlan === 'Premium Plus' 
                  ? 'text-brand-purple' 
                  : subscriptionPlan === 'Premium' 
                  ? 'text-brand-orange' 
                  : 'text-gray-500'
              }>{subscriptionPlan}</span>
            </div>
          </div>
        </div>
        <div className="flex bg-gray-50 border border-gray-150 p-1 rounded-2xl gap-1 shrink-0 w-full sm:w-auto">
          {(['Free', 'Premium', 'Premium Plus'] as const).map((plan) => {
            const isActive = subscriptionPlan === plan;
            let activeClass = '';
            if (isActive) {
              if (plan === 'Premium Plus') {
                activeClass = 'bg-brand-purple text-white shadow-sm';
              } else if (plan === 'Premium') {
                activeClass = 'bg-brand-orange text-white shadow-sm';
              } else {
                activeClass = 'bg-gray-600 text-white shadow-sm';
              }
            } else {
              activeClass = 'bg-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-150/40';
            }

            return (
              <button
                key={plan}
                type="button"
                onClick={() => void handleUpgrade(plan)}
                disabled={upgrading}
                className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer border-none outline-none ${activeClass} disabled:opacity-50 active:scale-95`}
              >
                {plan}
              </button>
            );
          })}
        </div>
      </div>

      {/* Header Card */}
      <div className="bg-gradient-to-br from-brand-orange to-[#F4511E] text-white p-5 rounded-3xl shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="back" onClick={handleBack}>←</Button>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <Badge variant="white">🗓️ Study Planner</Badge>
                <span className="text-[10px] text-white/80 font-black uppercase tracking-wider">
                  {studyPlan ? `Viewing: ${studyPlan.title || 'Study Plan'}` : 'Powered by Vidya AI'}
                </span>
              </div>
              <h3 className="text-base md:text-lg font-black leading-tight">
                {studyPlan ? studyPlan.title || 'Personalized Study Plan' : 'Personalized Study Plan'}
              </h3>
            </div>
          </div>
          {studyPlan && (
            <button
              onClick={() => setStudyPlan(null)}
              className="flex items-center gap-1.5 bg-white/15 backdrop-blur-sm hover:bg-white/25 active:scale-95 text-white text-xs font-black px-3.5 py-2.5 rounded-full transition-all border border-white/10 shadow-sm cursor-pointer select-none"
            >
              <RefreshCw className="w-3.5 h-3.5 shrink-0" />
              <span>Create New Plan</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side Column: Config Form OR Progress Stats */}
        <div className="lg:col-span-4 space-y-6">
          {!studyPlan ? (
            <form onSubmit={handleGenerate} className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-5">
              <h4 className="text-sm font-black text-gray-800 border-b border-gray-100 pb-2 flex items-center gap-2 select-none">
                <Calendar className="w-4 h-4 text-brand-orange" /> Configure Duration
              </h4>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-4 py-3 rounded-2xl border-2 border-gray-100 text-sm font-bold text-gray-700 bg-gray-50/50 hover:bg-gray-50 focus:border-brand-orange transition outline-none"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-4 py-3 rounded-2xl border-2 border-gray-100 text-sm font-bold text-gray-700 bg-gray-50/50 hover:bg-gray-50 focus:border-brand-orange transition outline-none"
                    required
                  />
                </div>

                <div className="bg-orange-50/70 border border-brand-orange/10 rounded-2xl p-4 flex items-center justify-between text-brand-orange font-bold text-sm">
                  <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" /> Total Duration:</span>
                  <span className="bg-brand-orange text-white px-3 py-1 rounded-full text-xs font-black shadow-sm">{numDays} {numDays === 1 ? 'Day' : 'Days'}</span>
                </div>
              </div>

              {/* Tab Selector */}
              <div className="flex rounded-2xl overflow-hidden border bg-gray-50/50 p-1">
                <button
                  type="button"
                  onClick={() => setInputMethod('upload')}
                  className={`flex-1 py-2 text-center text-xs font-black rounded-xl transition-all border-none cursor-pointer ${
                    inputMethod === 'upload' ? 'bg-brand-orange text-white shadow-sm' : 'bg-transparent text-gray-500 hover:text-brand-orange'
                  }`}
                >
                  📂 Upload File
                </button>
                <button
                  type="button"
                  onClick={() => setInputMethod('paste')}
                  className={`flex-1 py-2 text-center text-xs font-black rounded-xl transition-all border-none cursor-pointer ${
                    inputMethod === 'paste' ? 'bg-brand-orange text-white shadow-sm' : 'bg-transparent text-gray-500 hover:text-brand-orange'
                  }`}
                >
                  ✍️ Paste Syllabus
                </button>
              </div>

              {/* Conditional Content Inputs */}
              {inputMethod === 'upload' ? (
                <div className="space-y-3 pt-2 animate-[fadeIn_0.15s_ease-out]">
                  <h4 className="text-sm font-black text-gray-800 border-b border-gray-100 pb-2 flex items-center gap-2 select-none">
                    <FileText className="w-4 h-4 text-brand-orange" /> Upload Syllabus/Textbook
                  </h4>
                  <FormUploadZone
                    value={uploadedFile}
                    onChange={(file) => setUploadedFile(file)}
                  />
                </div>
              ) : (
                <div className="space-y-3 pt-2 animate-[fadeIn_0.15s_ease-out]">
                  <h4 className="text-sm font-black text-gray-800 border-b border-gray-100 pb-2 flex items-center gap-2 select-none">
                    <FileText className="w-4 h-4 text-brand-orange" /> Paste Syllabus Text
                  </h4>
                  <textarea
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="Paste textbook topics, syllabus chapter headings, or curriculum details here..."
                    className="w-full h-40 px-4 py-3 rounded-2xl border-2 border-gray-100 text-sm font-bold text-gray-700 bg-gray-50/50 hover:bg-gray-50 focus:border-brand-orange transition outline-none resize-none"
                    required
                  />
                </div>
              )}

              {error && (
                <div className="bg-red-50 text-red-600 p-3.5 rounded-2xl text-xs font-bold leading-normal border border-red-100">
                  ⚠️ {error}
                </div>
              )}

              <Button
                type="submit"
                variant={historyUsed >= historyLimit ? "secondary" : "primary"}
                className="w-full shadow-md"
                disabled={generating || historyUsed >= historyLimit}
              >
                {generating 
                  ? 'Generating Plan...' 
                  : historyUsed >= historyLimit 
                  ? 'History Limit Reached ⚠️' 
                  : 'Generate Study Plan ✨'}
              </Button>
              {historyUsed >= historyLimit && (
                <p className="text-[10px] text-red-500 font-extrabold text-center mt-1">
                  Please delete a plan from history or upgrade to generate.
                </p>
              )}
            </form>
          ) : (
            <div className="space-y-6">
              <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-6">
                <h4 className="text-sm font-black text-gray-800 border-b border-gray-100 pb-2 flex items-center gap-2 select-none">
                  <Trophy className="w-4 h-4 text-brand-orange" /> Study Progress
                </h4>

                {/* Progress Ring / Percentage Block */}
                <div className="text-center py-4 space-y-2">
                  <div className="w-32 h-32 mx-auto relative overflow-hidden bg-transparent">
                    {/* Dynamic absolute SVG highlight */}
                    <svg 
                      className="absolute inset-0 w-32 h-32 z-0"
                      viewBox="0 0 128 128"
                      width="128"
                      height="128"
                    >
                      {/* Inner background circle for well depth */}
                      <circle
                        cx="64"
                        cy="64"
                        r="54"
                        fill="#F9FAFB"
                      />
                      
                      {/* Group to rotate only the progress rings */}
                      <g transform="rotate(-90 64 64)">
                        {/* Background Track Circle */}
                        <circle
                          cx="64"
                          cy="64"
                          r="58"
                          stroke="#E5E7EB"
                          strokeWidth="8"
                          fill="transparent"
                        />
                        {/* Foreground Progress Circle */}
                        <circle
                          cx="64"
                          cy="64"
                          r="58"
                          stroke="#FF6B35"
                          strokeWidth="8"
                          fill="transparent"
                          strokeDasharray={2 * Math.PI * 58}
                          strokeDashoffset={2 * Math.PI * 58 * (1 - studyPlan.progress / 100)}
                          className="transition-all duration-300"
                        />
                      </g>

                      {/* Text is placed outside the rotated group to remain upright, aligned exactly to the pixel */}
                      <text
                        x="64"
                        y="64"
                        textAnchor="middle"
                        dominantBaseline="central"
                        className="text-3xl font-black fill-[#FF6B35] select-none font-nunito"
                      >
                        {studyPlan.progress}%
                      </text>
                    </svg>
                  </div>
                  <div className="text-xs text-gray-500 font-extrabold select-none">OVERALL COMPLETION</div>
                </div>

                {/* Stats and Details */}
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between text-sm py-1.5 border-b border-gray-100 font-bold">
                    <span className="text-gray-400">Duration</span>
                    <span className="text-gray-700">{studyPlan.numDays} Days</span>
                  </div>
                  <div className="flex items-center justify-between text-sm py-1.5 border-b border-gray-100 font-bold">
                    <span className="text-gray-400">Start Date</span>
                    <span className="text-gray-700">{studyPlan.startDate}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm py-1.5 border-b border-gray-100 font-bold">
                    <span className="text-gray-400">End Date</span>
                    <span className="text-gray-700">{studyPlan.endDate}</span>
                  </div>
                  {studyPlan.fileName && (
                    <div className="flex flex-col gap-1.5 py-1.5 font-bold">
                      <span className="text-sm text-gray-400">Uploaded Content</span>
                      {studyPlan.fileUrl ? (
                        <a
                          href={resolveBackendUrl(studyPlan.fileUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-brand-orange hover:text-[#E05621] bg-orange-50 hover:bg-orange-100 p-3 rounded-2xl max-w-full truncate border border-brand-orange/10 flex items-center gap-1.5 transition-all font-black"
                        >
                          📄 {studyPlan.fileName} (Click to View)
                        </a>
                      ) : (
                        <span className="text-xs text-gray-700 bg-gray-50 p-3 rounded-2xl max-w-full truncate border border-gray-100 flex items-center gap-1.5">
                          📄 {studyPlan.fileName}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Document Summary Card */}
              <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-4 animate-[fadeIn_0.15s_ease-out]">
                <h4 className="text-sm font-black text-gray-800 border-b border-gray-100 pb-2 flex items-center gap-2 select-none">
                  <FileText className="w-4 h-4 text-brand-orange" /> Document Summary
                </h4>
                
                {studyPlan.summary && (
                  <div className="bg-orange-50/40 p-4 rounded-2xl text-xs font-semibold leading-relaxed text-gray-600 border border-brand-orange/5 italic">
                    <AIResponseRenderer content={studyPlan.summary} />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="p-3 bg-gray-50/60 rounded-2xl border border-gray-100">
                    <div className="text-[10px] text-gray-400 font-extrabold select-none mb-1">TOTAL PAGES</div>
                    <div className="text-lg font-black text-gray-800">{studyPlan.numPages || 1}</div>
                  </div>
                  <div className="p-3 bg-gray-50/60 rounded-2xl border border-gray-100">
                    <div className="text-[10px] text-gray-400 font-extrabold select-none mb-1">TOPICS FOUND</div>
                    <div className="text-lg font-black text-gray-800">
                      {studyPlan.extractedTopics?.topics?.length || 0}
                    </div>
                  </div>
                  <div className="p-3 bg-gray-50/60 rounded-2xl border border-gray-100 col-span-2">
                    <div className="text-[10px] text-gray-400 font-extrabold select-none mb-1">ESTIMATED STUDY HOURS</div>
                    <div className="text-lg font-black text-brand-orange">{studyPlan.estimatedHours || 10} hrs</div>
                  </div>
                </div>
              </div>

              {/* Plan Switcher Card */}
              {historyPlans.length > 1 && (
                <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-4 select-none animate-[fadeIn_0.15s_ease-out]">
                  <h4 className="text-sm font-black text-gray-800 border-b border-gray-100 pb-2 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-brand-orange animate-pulse" /> Switch Study Plan
                  </h4>
                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                    {historyPlans.map((item) => {
                      const isCurrent = item.id === studyPlan.id;

                      if (renamingPlanId === item.id) {
                        return (
                          <form
                            key={item.id}
                            onSubmit={(e) => {
                              e.preventDefault();
                              void handleRename(item.id, renameTitle);
                            }}
                            className="flex items-center gap-2 p-2 rounded-2xl border border-brand-orange bg-orange-50/10"
                          >
                            <input
                              type="text"
                              value={renameTitle}
                              onChange={(e) => setRenameTitle(e.target.value)}
                              className="flex-1 min-w-0 px-2 py-1 text-xs font-bold border border-gray-300 rounded-lg outline-none"
                              autoFocus
                              required
                            />
                            <button
                              type="submit"
                              className="px-2 py-1 bg-brand-green text-white text-[9px] font-black rounded-lg border-none cursor-pointer"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setRenamingPlanId(null)}
                              className="px-2 py-1 bg-gray-250 text-gray-650 text-[9px] font-black rounded-lg border-none cursor-pointer"
                            >
                              Cancel
                            </button>
                          </form>
                        );
                      }

                      if (deletingPlanId === item.id) {
                        return (
                          <div
                            key={item.id}
                            className="flex items-center justify-between p-2 rounded-2xl border border-red-205 bg-red-50/20"
                          >
                            <span className="text-[10px] text-red-650 font-black pl-1 select-none">Delete?</span>
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={() => void handleDelete(item.id)}
                                className="px-2 py-1 bg-red-500 hover:bg-red-650 text-white text-[9px] font-black rounded-lg border-none cursor-pointer"
                              >
                                Yes
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingPlanId(null)}
                                className="px-2 py-1 bg-gray-250 text-gray-650 text-[9px] font-black rounded-lg border-none cursor-pointer"
                              >
                                No
                              </button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={item.id}
                          className={`group w-full flex items-center justify-between p-3 rounded-2xl border text-xs transition-all duration-150 gap-2 ${
                            isCurrent 
                              ? 'border-brand-orange bg-orange-50/40 shadow-sm' 
                              : 'border-gray-100 hover:border-gray-250 bg-white hover:shadow-xs'
                          }`}
                        >
                          <div 
                            onClick={() => {
                              if (!isCurrent) {
                                setStudyPlan(item);
                                setExpandedDay(item.planData.find(day => day.tasks.some(t => !t.completed))?.dayNum || 1);
                              }
                            }}
                            className="flex-1 min-w-0 cursor-pointer"
                          >
                            <span className={`truncate block font-black ${isCurrent ? 'text-brand-orange' : 'text-gray-700 hover:text-brand-orange'}`}>
                              {item.title || 'Study Plan'}
                            </span>
                            <span className="text-[9px] text-gray-400 block font-bold mt-0.5">
                              📅 {item.startDate} to {item.endDate} • {item.progress}% done
                            </span>
                          </div>

                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => {
                                setRenamingPlanId(item.id);
                                setRenameTitle(item.title || 'Study Plan');
                              }}
                              className="p-1 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-xs leading-none cursor-pointer transition"
                              title="Rename"
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingPlanId(item.id)}
                              className="p-1 bg-red-50 hover:bg-red-100 border border-red-100 rounded-lg text-xs leading-none cursor-pointer transition"
                              title="Delete"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>

        {/* Right Side Column: Interactive Schedule / Accordion Timeline */}
        <div className="lg:col-span-8 space-y-6">
          {!studyPlan ? (
            <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-6 min-h-[450px]">
              {upgradeSuccessMessage && (
                <div className="bg-green-50 text-green-700 border border-green-200 p-4 rounded-2xl text-xs font-black flex items-center gap-2 animate-[fadeIn_0.15s_ease-out] select-none">
                  <span>🎉</span> {upgradeSuccessMessage}
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4 select-none">
                <div>
                  <h4 className="text-base font-black text-gray-800 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-brand-orange" /> Study Plan History
                  </h4>
                  <p className="text-xs text-gray-500 font-semibold mt-1">
                    Manage and view your previously generated study plans.
                  </p>
                </div>
                <div className="bg-gray-50 px-4 py-2.5 rounded-2xl border border-gray-150 text-right shrink-0">
                  <div className="text-[10px] text-gray-400 font-extrabold uppercase tracking-wider">Remaining Slots</div>
                  <div className="text-sm font-black text-gray-700">
                    {historyLimit - historyUsed} / {historyLimit} available
                  </div>
                </div>
              </div>

              {/* Progress bar of history slots */}
              <div className="space-y-1.5 select-none">
                <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-350 ${
                      historyUsed >= historyLimit ? 'bg-red-500' : 'bg-brand-orange'
                    }`} 
                    style={{ width: `${Math.min(100, (historyUsed / historyLimit) * 100)}%` }}
                  />
                </div>
                <div className="text-[10px] text-gray-400 font-extrabold flex justify-between">
                  <span>{historyUsed} stored</span>
                  <span>Limit: {historyLimit} ({subscriptionPlan} Plan)</span>
                </div>
              </div>

              {/* Upgrade Banner */}
              {historyUsed >= historyLimit && (
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-brand-orange/20 rounded-2xl p-5 space-y-4 animate-[fadeIn_0.2s_ease-out] select-none">
                  <div className="flex gap-3">
                    <span className="text-xl">⚠️</span>
                    <div className="space-y-1">
                      <h5 className="text-xs font-black text-brand-orange uppercase tracking-wider">History Limit Reached</h5>
                      <p className="text-xs text-gray-600 font-semibold leading-relaxed">
                        You've used all {historyLimit} slots on your <strong>{subscriptionPlan}</strong> plan. Upgrade your plan to store more history, or delete an existing plan.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2.5 pt-1">
                    {subscriptionPlan === 'Free' && (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleUpgrade('Premium')}
                          disabled={upgrading}
                          className="px-4 py-2.5 bg-brand-orange hover:bg-[#E05621] active:scale-95 text-white text-xs font-black rounded-xl transition border-none shadow-sm cursor-pointer disabled:opacity-55"
                        >
                          {upgrading ? 'Upgrading...' : 'Get Premium ($20) • 5 Slots'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleUpgrade('Premium Plus')}
                          disabled={upgrading}
                          className="px-4 py-2.5 bg-brand-purple hover:bg-[#5C328E] active:scale-95 text-white text-xs font-black rounded-xl transition border-none shadow-sm cursor-pointer disabled:opacity-55"
                        >
                          {upgrading ? 'Upgrading...' : 'Get Premium Plus ($50) • 10 Slots'}
                        </button>
                      </>
                    )}
                    {subscriptionPlan === 'Premium' && (
                      <button
                        type="button"
                        onClick={() => void handleUpgrade('Premium Plus')}
                        disabled={upgrading}
                        className="px-4 py-2.5 bg-brand-purple hover:bg-[#5C328E] active:scale-95 text-white text-xs font-black rounded-xl transition border-none shadow-sm cursor-pointer disabled:opacity-55"
                      >
                        {upgrading ? 'Upgrading...' : 'Upgrade to Premium Plus ($50) • 10 Slots'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Upgrade Promo for non-limit states, just as a premium utility */}
              {historyUsed < historyLimit && subscriptionPlan !== 'Premium Plus' && (
                <div className="bg-gray-50/70 border border-gray-150/70 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-bold text-gray-500 select-none">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-brand-orange shrink-0 animate-pulse" /> Need more slots? Upgrade to unlock up to 10 stored plans.
                  </span>
                  <div className="flex gap-2">
                    {subscriptionPlan === 'Free' && (
                      <button
                        type="button"
                        onClick={() => void handleUpgrade('Premium')}
                        disabled={upgrading}
                        className="px-3 py-1.5 bg-brand-orange/10 hover:bg-brand-orange/20 text-brand-orange border border-brand-orange/15 rounded-lg text-[10px] font-black cursor-pointer transition"
                      >
                        Get Premium
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleUpgrade('Premium Plus')}
                      disabled={upgrading}
                      className="px-3 py-1.5 bg-brand-purple/10 hover:bg-brand-purple/20 text-brand-purple border border-brand-purple/15 rounded-lg text-[10px] font-black cursor-pointer transition"
                    >
                      Get Premium Plus
                    </button>
                  </div>
                </div>
              )}

              {/* Plans List */}
              <div className="space-y-3.5 max-h-[50vh] overflow-y-auto pr-1">
                {historyPlans.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed border-gray-100 rounded-3xl space-y-3 select-none">
                    <div className="text-4xl text-gray-300">📁</div>
                    <div className="space-y-0.5">
                      <p className="text-sm font-black text-gray-700">No History Found</p>
                      <p className="text-xs text-gray-400 font-semibold max-w-[280px] mx-auto leading-relaxed">
                        Configure dates and upload content on the left to generate your first study plan!
                      </p>
                    </div>
                  </div>
                ) : (
                  historyPlans.map((item) => {
                    const totalTasks = item.planData.reduce((acc, d) => acc + d.tasks.length, 0);
                    const completedTasks = item.planData.reduce((acc, d) => acc + d.tasks.filter(t => t.completed).length, 0);
                    const percent = Math.round((completedTasks / Math.max(1, totalTasks)) * 100);

                    return (
                      <div 
                        key={item.id}
                        className="bg-white border border-gray-100 hover:border-gray-250 hover:shadow-sm p-4 rounded-2xl flex flex-col md:flex-row justify-between gap-4 transition-all"
                      >
                        <div className="space-y-2.5 flex-1 min-w-0">
                          {renamingPlanId === item.id ? (
                            <form 
                              onSubmit={(e) => {
                                e.preventDefault();
                                void handleRename(item.id, renameTitle);
                              }}
                              className="flex items-center gap-2 max-w-md"
                            >
                              <input
                                type="text"
                                value={renameTitle}
                                onChange={(e) => setRenameTitle(e.target.value)}
                                className="flex-1 px-3 py-1.5 text-xs font-bold border-2 border-brand-orange rounded-xl outline-none"
                                autoFocus
                                required
                              />
                              <button
                                type="submit"
                                className="px-3 py-1.5 bg-brand-green text-white text-[10px] font-black rounded-lg border-none cursor-pointer"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setRenamingPlanId(null)}
                                className="px-3 py-1.5 bg-gray-200 text-gray-650 text-[10px] font-black rounded-lg border-none cursor-pointer"
                              >
                                Cancel
                              </button>
                            </form>
                          ) : (
                            <div className="space-y-1">
                              <h5 
                                onClick={() => {
                                  setStudyPlan(item);
                                  setExpandedDay(item.planData.find(day => day.tasks.some(t => !t.completed))?.dayNum || 1);
                                }}
                                className="text-sm font-black text-gray-800 hover:text-brand-orange transition cursor-pointer truncate"
                              >
                                {item.title || 'Study Plan'}
                              </h5>
                              <div className="text-[10px] text-gray-400 font-extrabold flex items-center gap-1.5 select-none flex-wrap">
                                <span>📅 {item.startDate} to {item.endDate}</span>
                                <span>•</span>
                                <span>{item.numDays} Days</span>
                                <span>•</span>
                                <span>Created {new Date(item.createdAt).toLocaleDateString()}</span>
                              </div>
                            </div>
                          )}

                          {/* Progress */}
                          <div className="flex items-center gap-3 select-none">
                            <div className="flex-1 bg-gray-100 h-1.5 rounded-full overflow-hidden">
                              <div className="bg-brand-green h-full rounded-full" style={{ width: `${percent}%` }} />
                            </div>
                            <span className="text-[10px] font-black text-brand-green shrink-0">
                              {percent}% completed ({completedTasks}/{totalTasks} tasks)
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 self-end md:self-center shrink-0">
                          {deletingPlanId === item.id ? (
                            <div className="flex items-center gap-1.5 bg-red-55/70 border border-red-150 p-1.5 rounded-xl animate-[fadeIn_0.1s_ease-out]">
                              <span className="text-[10px] text-red-650 font-extrabold px-1 select-none">Delete?</span>
                              <button
                                type="button"
                                onClick={() => void handleDelete(item.id)}
                                className="px-2 py-1 bg-red-500 hover:bg-red-650 text-white text-[9px] font-black rounded-lg border-none cursor-pointer"
                              >
                                Yes
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingPlanId(null)}
                                className="px-2 py-1 bg-gray-200 text-gray-650 text-[9px] font-black rounded-lg border-none cursor-pointer"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setStudyPlan(item);
                                  setExpandedDay(item.planData.find(day => day.tasks.some(t => !t.completed))?.dayNum || 1);
                                }}
                                className="px-3 py-1.5 bg-gray-50 hover:bg-orange-50 hover:text-brand-orange border border-gray-150 rounded-xl text-xs font-black cursor-pointer transition flex items-center gap-1"
                              >
                                <BookOpen className="w-3.5 h-3.5" />
                                <span>View</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRenamingPlanId(item.id);
                                  setRenameTitle(item.title || 'Study Plan');
                                }}
                                className="p-1.5 bg-gray-55 hover:bg-gray-100 border border-gray-150 rounded-xl text-gray-500 hover:text-gray-700 cursor-pointer transition text-xs leading-none"
                                title="Rename"
                              >
                                ✏️
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingPlanId(item.id)}
                                className="p-1.5 bg-red-50 hover:bg-red-100 border border-red-100 rounded-xl text-red-500 cursor-pointer transition text-xs leading-none"
                                title="Delete"
                              >
                                🗑️
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Timeline Checklist Card */}
              <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3 select-none">
                  <h4 className="text-base font-black text-gray-800">Timeline Checklist</h4>
                  <Badge variant="eng" className="font-extrabold px-3 py-1 border border-brand-orangeBorder">
                    🚀 Keep it up!
                  </Badge>
                </div>

                <div className="space-y-4 pr-1 mt-4">
                  {studyPlan.planData.map((day) => {
                    const isExpanded = expandedDay === day.dayNum;
                    const { total, completed, allDone, status } = getDayStatus(day);

                    return (
                      <div
                        key={day.dayNum}
                        className={`
                          border-2 rounded-3xl transition-all duration-200 overflow-hidden
                          ${isExpanded
                            ? 'border-brand-orange bg-white shadow-md'
                            : status === 'missed'
                            ? 'border-red-200 bg-red-50/30 hover:shadow-sm'
                            : status === 'partial'
                            ? 'border-amber-200 bg-amber-50/20 hover:shadow-sm'
                            : 'border-gray-100 hover:border-gray-200 bg-white hover:shadow-sm'
                          }
                        `}
                      >
                        {/* Accordion Header */}
                        <div
                          onClick={() => setExpandedDay(isExpanded ? null : day.dayNum)}
                          className="p-5 flex items-center justify-between gap-4 cursor-pointer select-none"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`
                              w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 shadow-sm
                              ${status === 'completed'
                                ? 'bg-brand-green text-white'
                                : status === 'missed'
                                ? 'bg-red-100 text-red-600'
                                : status === 'partial'
                                ? 'bg-amber-100 text-amber-700'
                                : status === 'in_progress'
                                ? 'bg-blue-100 text-brand-blue'
                                : (day.topic?.toLowerCase().includes('revision') || day.topic?.toLowerCase().includes('review'))
                                ? 'bg-brand-purpleLight text-brand-purple'
                                : 'bg-brand-orangeLight text-brand-orange'
                              }
                            `}>
                              {status === 'completed' ? '✓'
                                : status === 'missed' ? '!'
                                : status === 'partial' ? '½'
                                : `D${day.dayNum}`}
                            </div>
                            <div className="space-y-1">
                              <div className="font-black text-gray-800 text-sm leading-tight flex items-center gap-2 flex-wrap">
                                <span>{day.topic}</span>
                                {day.estimatedHours && (
                                  <span className="text-[9px] font-black bg-blue-50 text-brand-blue border border-brand-blueBorder/30 px-2 py-0.5 rounded-full shrink-0">
                                    ⏱️ {day.estimatedHours} {day.estimatedHours === 1 ? 'hr' : 'hrs'}
                                  </span>
                                )}
                                {day.difficulty && (
                                  <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full border shrink-0 ${
                                    day.difficulty === 'hard'
                                      ? 'bg-red-50 text-red-650 border-red-200'
                                      : day.difficulty === 'easy'
                                      ? 'bg-green-50 text-green-700 border-green-200'
                                      : 'bg-amber-50 text-amber-700 border-amber-200'
                                  }`}>
                                    {day.difficulty}
                                  </span>
                                )}
                                {(day.topic?.toLowerCase().includes('revision') || day.topic?.toLowerCase().includes('review')) && (
                                  <span className="text-[8px] font-black bg-brand-purpleLight text-brand-purple border border-brand-purpleBorder/30 px-2 py-0.5 rounded-full uppercase shrink-0">
                                    ✨ Revision Day
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-gray-400 font-extrabold flex items-center gap-1.5 select-none flex-wrap">
                                <span>Day {day.dayNum}</span>
                                <span>•</span>
                                <span>📅 {day.date}</span>
                                <span>•</span>
                                <span>{completed} of {total} tasks completed</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Semantic Status Badge */}
                            {status === 'completed' && (
                              <Badge variant="green" className="py-0.5 px-2.5 text-[10px] font-black uppercase shrink-0">
                                ✅ Done
                              </Badge>
                            )}
                            {status === 'missed' && (
                              <span className="text-[9px] font-black bg-red-100 text-red-600 border border-red-200 px-2 py-0.5 rounded-full uppercase shrink-0 animate-pulse">
                                ❌ Missed
                              </span>
                            )}
                            {status === 'partial' && (
                              <span className="text-[9px] font-black bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full uppercase shrink-0">
                                ⚠️ Partial
                              </span>
                            )}
                            {status === 'in_progress' && (
                              <span className="text-[9px] font-black bg-blue-100 text-brand-blue border border-blue-200 px-2 py-0.5 rounded-full uppercase shrink-0 animate-pulse">
                                🔵 In Progress
                              </span>
                            )}
                            {status === 'not_started' && (
                              <span className="text-[9px] font-black bg-orange-100 text-brand-orange border border-orange-200 px-2 py-0.5 rounded-full uppercase shrink-0">
                                📌 Today
                              </span>
                            )}
                            {isExpanded ? (
                              <ChevronUp className="w-5 h-5 text-gray-400 shrink-0" />
                            ) : (
                              <ChevronDown className="w-5 h-5 text-gray-400 shrink-0" />
                            )}
                          </div>
                        </div>

                        {/* Accordion Body */}
                        {isExpanded && (
                          <div className="px-5 pb-5 pt-1 border-t border-gray-50 space-y-4 animate-[slideUp_0.15s_ease-out]">
                            <div className="bg-gray-55/70 p-4 rounded-2xl text-xs font-semibold leading-relaxed text-gray-600 border border-gray-100">
                              <span className="font-black text-[10px] text-brand-orange uppercase tracking-wider block mb-1 select-none">
                                📖 Daily Focus Area
                              </span>
                              <div>
                                {(() => {
                                  const desc = day.description || '';
                                  const isLong = desc.length > 150;
                                  const isDescExpanded = !!expandedDescriptions[day.dayNum];
                                  
                                  if (!isLong) {
                                    return <AIResponseRenderer content={desc} />;
                                  }
                                  
                                  return (
                                    <div className="space-y-1.5">
                                      <AIResponseRenderer content={isDescExpanded ? desc : `${desc.slice(0, 150)}...`} />
                                      <button
                                        type="button"
                                        onClick={(e) => toggleDescriptionExpanded(day.dayNum, e)}
                                        className="block text-[10px] font-black text-brand-orange hover:underline cursor-pointer border-none bg-transparent p-0 outline-none select-none"
                                      >
                                        {isDescExpanded ? 'Show Less ▲' : 'Show More ▼'}
                                      </button>
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <span className="font-black text-[10px] text-gray-400 uppercase tracking-wider select-none">
                                Checklist Tasks (+10 XP each)
                              </span>
                              <div className="grid grid-cols-1 gap-2">
                                {day.tasks.map((task, idx) => (
                                  <div
                                    key={idx}
                                    onClick={() => handleTaskToggle(day.dayNum, idx, task.completed)}
                                    className={`
                                      flex items-center gap-3 p-3.5 rounded-2xl border cursor-pointer select-none transition-all duration-100
                                      ${task.completed 
                                        ? 'bg-green-50/20 border-brand-greenBorder/35 opacity-75' 
                                        : 'bg-white border-gray-100 hover:border-gray-200 hover:bg-gray-50/25'
                                      }
                                    `}
                                  >
                                    <div className={`
                                      w-5.5 h-5.5 rounded-lg border-2 flex items-center justify-center transition-all shrink-0
                                      ${task.completed 
                                        ? 'border-brand-green bg-brand-green text-white' 
                                        : 'border-gray-300 bg-white'
                                      }
                                    `} style={{ width: '22px', height: '22px' }}>
                                      {task.completed && <span className="text-xs font-black select-none">✓</span>}
                                    </div>
                                    <span className={`
                                      text-xs font-bold leading-normal text-gray-700
                                      ${task.completed ? 'line-through text-gray-400 font-semibold' : ''}
                                    `}>
                                      {task.title}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>


              {/* View Extracted Content Card */}
              {studyPlan.rawText && (
                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-4 animate-[fadeIn_0.15s_ease-out]">
                  <div
                    onClick={() => setShowRawText(!showRawText)}
                    className="flex items-center justify-between cursor-pointer select-none"
                  >
                    <h4 className="text-base font-black text-gray-800 flex items-center gap-2">
                      <FileText className="w-5 h-5 text-brand-orange" /> View Extracted Content
                    </h4>
                    {showRawText ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>

                  {showRawText && (
                    <div className="space-y-4 pt-4 border-t border-gray-50 animate-[slideDown_0.15s_ease-out]">
                      {(() => {
                        const chunks = chunkText(studyPlan.rawText);
                        const totalChunks = chunks.length;
                        const currentChunkIndex = Math.min(totalChunks, Math.max(1, rawTextPage)) - 1;
                        const currentChunkText = chunks[currentChunkIndex] || '';

                        return (
                          <div className="space-y-4">
                            <div className="bg-gray-50 p-4 rounded-2xl text-xs font-semibold leading-relaxed text-gray-600 border border-gray-100 max-h-[300px] overflow-y-auto whitespace-pre-wrap font-mono">
                              {currentChunkText}
                            </div>

                            {totalChunks > 1 && (
                              <div className="flex items-center justify-between bg-gray-50 p-2.5 rounded-2xl border border-gray-100">
                                <button
                                  type="button"
                                  disabled={rawTextPage === 1}
                                  onClick={() => setRawTextPage(prev => Math.max(1, prev - 1))}
                                  className="p-1.5 rounded-xl border border-gray-200 hover:border-brand-orange hover:text-brand-orange disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:text-gray-400 transition cursor-pointer disabled:cursor-not-allowed bg-white"
                                >
                                  <ChevronLeft className="w-4 h-4" />
                                </button>

                                <span className="text-[10px] text-gray-500 font-extrabold select-none">
                                  CHUNK {rawTextPage} OF {totalChunks}
                                </span>

                                <button
                                  type="button"
                                  disabled={rawTextPage === totalChunks}
                                  onClick={() => setRawTextPage(prev => Math.min(totalChunks, prev + 1))}
                                  className="p-1.5 rounded-xl border border-gray-200 hover:border-brand-orange hover:text-brand-orange disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:text-gray-400 transition cursor-pointer disabled:cursor-not-allowed bg-white"
                                >
                                  <ChevronRight className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default StudyPlanView;
