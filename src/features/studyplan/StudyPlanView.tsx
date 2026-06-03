import React, { useEffect, useState } from 'react';
import { useAppDispatch } from '../../store';
import { setActiveScreen, addXp } from '../../store/slices/appSlice';
import Button from '../../components/common/Button';
import FormUploadZone from '../../components/form/FormUploadZone';
import Badge from '../../components/common/Badge';
import {
  getLatestStudyPlan,
  generateStudyPlan,
  toggleStudyPlanTask,
  fileToBase64,
  updateScreen
} from '../../services/api';
import type { StudyPlan } from '../../types/types';
import { 
  Calendar, 
  ChevronDown, 
  ChevronUp, 
  ChevronLeft,
  ChevronRight,
  FileText, 
  CheckCircle, 
  BookOpen, 
  Trophy, 
  Sparkles, 
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

  useEffect(() => {
    let mounted = true;
    const fetchPlan = async () => {
      try {
        const plan = await getLatestStudyPlan();
        if (mounted && plan) {
          setStudyPlan(plan);
          setShowRawText(false);
          setRawTextPage(1);
          setExpandedDescriptions({});
          // Default expand first day that has uncompleted tasks
          const firstUncompletedDay = plan.planData.find(day => 
            day.tasks.some(task => !task.completed)
          );
          if (firstUncompletedDay) {
            setExpandedDay(firstUncompletedDay.dayNum);
          }
        }
      } catch (err) {
        console.error('Failed to load study plan', err);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };
    void fetchPlan();
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
    } catch (err: any) {
      console.error('Error generating study plan', err);
      setError(err?.message || 'Failed to generate study plan. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleTaskToggle = async (dayNum: number, taskIndex: number, currentCompleted: boolean) => {
    if (!studyPlan) return;
    
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

    // Gamified reward: Add XP on completion, deduct on uncompletion
    if (!currentCompleted) {
      dispatch(addXp(10));
      setXpAnimation(true);
      setTimeout(() => setXpAnimation(false), 2000);
    } else {
      dispatch(addXp(-10));
    }

    try {
      // Sync with server
      const syncedPlan = await toggleStudyPlanTask(studyPlan.id, dayNum, taskIndex, !currentCompleted);
      setStudyPlan(syncedPlan);
    } catch (err) {
      console.error('Error syncing task toggle', err);
      // Revert if API failed
      const revertedPlan = JSON.parse(JSON.stringify(studyPlan));
      const revertedDay = revertedPlan.planData.find((d: any) => d.dayNum === dayNum);
      if (revertedDay) {
        revertedDay.tasks[taskIndex].completed = currentCompleted;
      }
      setStudyPlan(revertedPlan);
      // Revert XP change
      if (!currentCompleted) {
        dispatch(addXp(-10));
      } else {
        dispatch(addXp(10));
      }
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

  // Helper to count day tasks completion
  const getDayStatus = (day: any) => {
    const total = day.tasks.length;
    const completed = day.tasks.filter((t: any) => t.completed).length;
    return { total, completed, allDone: total > 0 && total === completed };
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

      {/* Header Card */}
      <div className="bg-gradient-to-br from-brand-orange to-[#F4511E] text-white p-5 rounded-3xl shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="back" onClick={handleBack}>←</Button>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <Badge variant="white">🗓️ Study Planner</Badge>
                <span className="text-[10px] text-white/80 font-black uppercase tracking-wider">Powered by Vidya AI</span>
              </div>
              <h3 className="text-base md:text-lg font-black leading-tight">Personalized Study Plan</h3>
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
                variant="primary"
                className="w-full shadow-md"
                disabled={generating}
              >
                {generating ? 'Generating Plan...' : 'Generate Study Plan ✨'}
              </Button>
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
                      <span className="text-xs text-gray-700 bg-gray-50 p-3 rounded-2xl max-w-full truncate border border-gray-100 flex items-center gap-1.5">
                        📄 {studyPlan.fileName}
                      </span>
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
                    "{studyPlan.summary}"
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

            </div>
          )}
        </div>

        {/* Right Side Column: Interactive Schedule / Accordion Timeline */}
        <div className="lg:col-span-8 space-y-6">
          {!studyPlan ? (
            <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm min-h-[450px] flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-6 py-8 select-none">
              <div className="text-5xl">📚</div>
              <div className="space-y-1.5">
                <h4 className="text-lg font-black text-gray-800">Your AI Planner is Ready</h4>
                <p className="text-sm text-gray-500 font-semibold leading-relaxed">
                  Enter your study dates and upload your syllabus to generate a gamified, customized day-by-day learning roadmap.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 w-full text-center">
                <div className="p-3 bg-orange-50/60 rounded-2xl border border-brand-orange/10 space-y-1">
                  <div className="text-xl">⚡</div>
                  <div className="text-[10px] font-black text-gray-700">Day schedule</div>
                </div>
                <div className="p-3 bg-purple-50/60 rounded-2xl border border-brand-purpleBorder/10 space-y-1">
                  <div className="text-xl">📋</div>
                  <div className="text-[10px] font-black text-gray-700">Tasks list</div>
                </div>
                <div className="p-3 bg-green-50/60 rounded-2xl border border-brand-greenBorder/10 space-y-1">
                  <div className="text-xl">🏆</div>
                  <div className="text-[10px] font-black text-gray-700">Win XP</div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Timeline Checklist Card */}
              <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3 select-none">
                  <h4 className="text-base font-black text-gray-800">Timeline Checklist</h4>
                  <Badge variant="orange" className="font-extrabold px-3 py-1 border border-brand-orangeBorder">
                    🚀 Keep it up!
                  </Badge>
                </div>

                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1 mt-4">
                  {studyPlan.planData.map((day) => {
                    const isExpanded = expandedDay === day.dayNum;
                    const { total, completed, allDone } = getDayStatus(day);

                    return (
                      <div
                        key={day.dayNum}
                        className={`
                          border-2 rounded-3xl transition-all duration-200 overflow-hidden
                          ${isExpanded 
                            ? 'border-brand-orange bg-white shadow-md' 
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
                              ${allDone 
                                ? 'bg-brand-green text-white' 
                                : (day.topic.toLowerCase().includes('revision') || day.topic.toLowerCase().includes('review'))
                                ? 'bg-brand-purpleLight text-brand-purple'
                                : 'bg-brand-orangeLight text-brand-orange'
                              }
                            `}>
                              {allDone ? '✓' : `D${day.dayNum}`}
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
                                {(day.topic.toLowerCase().includes('revision') || day.topic.toLowerCase().includes('review')) && (
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
                            {allDone && (
                              <Badge variant="green" className="py-0.5 px-2.5 text-[10px] font-black uppercase shrink-0">
                                Completed
                              </Badge>
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
                                    return <span>{desc}</span>;
                                  }
                                  
                                  return (
                                    <div className="space-y-1.5">
                                      <span>
                                        {isDescExpanded ? desc : `${desc.slice(0, 150)}...`}
                                      </span>
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
