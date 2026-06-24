import React, { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../store';
import { hydrateSession, setActiveScreen } from '../../store/slices/appSlice';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import ProgressBar from '../../components/common/ProgressBar';
import { 
  getParent, 
  resolveProgressReportPdfUrl, 
  resolveProgressReportExcelUrl, 
  toUserState, 
  updateScreen 
} from '../../services/api';

type ChartMetric = 'homework' | 'quizzes' | 'tutorSessions' | 'doubts' | 'studyTime';

export const ParentView: React.FC = () => {
  const dispatch = useAppDispatch();
  const currentUser = useAppSelector((state) => state.app.user);
  const currentLanguage = useAppSelector((state) => state.app.language);

  // States
  const [filter, setFilter] = useState<string>('last_7_days');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [parentData, setParentData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedChartMetric, setSelectedChartMetric] = useState<ChartMetric>('homework');
  const [currentChunkIndex, setCurrentChunkIndex] = useState<number>(0);

  // Load parent view progress data
  const loadParentData = async (activeFilter: string, start?: string, end?: string) => {
    setLoading(true);
    try {
      const response = await getParent(
        activeFilter,
        activeFilter === 'custom' ? start : undefined,
        activeFilter === 'custom' ? end : undefined
      );
      setParentData(response);
      setCurrentChunkIndex(0);
      dispatch(
        hydrateSession({
          loggedIn: true,
          activeScreen: 5,
          language: currentLanguage,
          selectedSubjectId: response.user.selectedSubjectId ?? null,
          user: toUserState(response.user),
        })
      );
    } catch (error) {
      console.error('Unable to load progress data', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadParentData(filter, customStartDate, customEndDate);
  }, [currentLanguage, filter, currentUser?.email]);

  const handleBack = () => {
    dispatch(setActiveScreen(0));
    void updateScreen(0).catch((error) => {
      console.error('Unable to persist screen change', error);
    });
  };

  const handleFilterChange = (val: string) => {
    setFilter(val);
    if (val !== 'custom') {
      void loadParentData(val);
    }
  };

  const applyCustomFilter = () => {
    if (customStartDate && customEndDate) {
      void loadParentData('custom', customStartDate, customEndDate);
    }
  };

  const handleDownloadPdf = () => {
    const url = resolveProgressReportPdfUrl(
      filter,
      filter === 'custom' ? customStartDate : undefined,
      filter === 'custom' ? customEndDate : undefined
    );
    window.open(url, '_blank');
  };

  const handleDownloadExcel = () => {
    const url = resolveProgressReportExcelUrl(
      filter,
      filter === 'custom' ? customStartDate : undefined,
      filter === 'custom' ? customEndDate : undefined
    );
    window.open(url, '_blank');
  };

  // Safe data resolution
  const user = parentData?.user ?? currentUser;
  const stats = parentData?.stats ?? [
    { id: 'streak', value: `${user.streak || 12} 🔥`, label: 'Day Streak' },
    { id: 'xp', value: `${user.xpPoints || 840} ⭐`, label: 'Total XP' },
    { id: 'completed', value: '0', label: 'Homework Completed' },
    { id: 'doubts', value: '0', label: 'Doubts Solved' },
    { id: 'study_time', value: '0 mins', label: 'Study Time' },
    { id: 'quiz_accuracy', value: '85%', label: 'Quiz Accuracy' },
  ];

  const performanceBars = parentData?.performanceBars ?? [
    { id: 'english', name: 'English', emoji: '📖', progress: 88, color: 'green', trend: 'Stable ➡️' },
    { id: 'maths', name: 'Mathematics', emoji: '📐', progress: 72, color: 'orange', trend: '+4% this week' },
    { id: 'tamil', name: 'Tamil', emoji: 'அ', progress: 64, color: 'blue', trend: '+1% this week' },
    { id: 'science', name: 'Science', emoji: '🔬', progress: 55, color: 'purple', trend: '+2% this week' },
    { id: 'history', name: 'History', emoji: '🏛️', progress: 40, color: 'purple', trend: 'Stable ➡️' },
    { id: 'geography', name: 'Geography', emoji: '🌍', progress: 30, color: 'blue', trend: 'Stable ➡️' },
  ];

  const recommendations = parentData?.insights?.recommendations ?? [
    '✅ Strong in English',
    '📈 Science performance improving',
    '🎯 Practice more Mathematics quizzes',
    '🔥 12-day learning streak',
  ];

  const achievements = parentData?.achievements ?? [
    { id: 'curious_learner', name: 'Curious Learner', description: 'Solved 5 or more doubts using AI Tutor', unlocked: false, emoji: '🤔', earnedDate: null },
    { id: 'homework_hero', name: 'Homework Hero', description: 'Completed 5 or more homework sheets', unlocked: false, emoji: '📝', earnedDate: null },
    { id: 'quiz_champion', name: 'Quiz Champion', description: 'Got 5 or more quiz answers correct', unlocked: false, emoji: '🏆', earnedDate: null },
    { id: 'science_explorer', name: 'Science Explorer', description: 'Achieved 50% or more progress in Science', unlocked: false, emoji: '🔬', earnedDate: null },
    { id: 'consistency_master', name: 'Consistency Master', description: 'Kept a study streak of 7 or more days', unlocked: false, emoji: '🔥', earnedDate: null },
  ];

  const fallbackWeeklyActivity = [
    { label: 'Mon', date: '2026-06-08', homework: 1, quizzes: 2, tutorSessions: 1, doubts: 3, studyTime: 45 },
    { label: 'Tue', date: '2026-06-09', homework: 2, quizzes: 1, tutorSessions: 1, doubts: 2, studyTime: 60 },
    { label: 'Wed', date: '2026-06-10', homework: 0, quizzes: 3, tutorSessions: 0, doubts: 4, studyTime: 30 },
    { label: 'Thu', date: '2026-06-11', homework: 1, quizzes: 0, tutorSessions: 2, doubts: 1, studyTime: 40 },
    { label: 'Fri', date: '2026-06-12', homework: 1, quizzes: 2, tutorSessions: 0, doubts: 3, studyTime: 50 },
    { label: 'Sat', date: '2026-06-13', homework: 0, quizzes: 1, tutorSessions: 1, doubts: 2, studyTime: 25 },
    { label: 'Sun', date: '2026-06-14', homework: 0, quizzes: 0, tutorSessions: 0, doubts: 0, studyTime: 0 },
  ];

  const getWeeklyChunks = (activity: any[]) => {
    const res: any[][] = [];
    if (!activity || activity.length === 0) {
      return [[]];
    }
    if (activity.length <= 7) {
      res.push(activity);
      return res;
    }
    for (let i = activity.length; i > 0; i -= 7) {
      const start = Math.max(0, i - 7);
      const chunk = activity.slice(start, i);
      if (start === 0 && chunk.length < 7 && activity.length >= 7) {
        res.push(activity.slice(0, 7));
      } else {
        res.push(chunk);
      }
    }
    return res;
  };

  const formatDateRange = (chunk: any[]) => {
    if (!chunk || chunk.length === 0) return 'No Date Range';
    const firstDateStr = chunk[0].date;
    const lastDateStr = chunk[chunk.length - 1].date;
    if (!firstDateStr || !lastDateStr) return 'No Date Range';

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const parseDateStr = (str: string) => {
      const parts = str.split('-');
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      return { year, month, day, monthName: monthNames[month] || '' };
    };

    const d1 = parseDateStr(firstDateStr);
    const d2 = parseDateStr(lastDateStr);

    const padDay = (day: number) => String(day).padStart(2, '0');

    if (d1.year === d2.year) {
      return `${d1.monthName} ${padDay(d1.day)} - ${d2.monthName} ${padDay(d2.day)}, ${d1.year}`;
    } else {
      return `${d1.monthName} ${padDay(d1.day)}, ${d1.year} - ${d2.monthName} ${padDay(d2.day)}, ${d2.year}`;
    }
  };

  const formatAxisDate = (dateStr: string) => {
    if (!dateStr) return '';
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const parts = dateStr.split('-');
    if (parts.length < 3) return dateStr;
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const padDay = (d: number) => String(d).padStart(2, '0');
    return `${monthNames[month] || ''} ${padDay(day)}`;
  };

  const rawWeeklyActivity = parentData?.weeklyActivity ?? fallbackWeeklyActivity;
  const chunks = getWeeklyChunks(rawWeeklyActivity);
  const safeChunkIndex = Math.min(currentChunkIndex, chunks.length - 1);
  const currentChunk = chunks[safeChunkIndex] || [];

  const getStatStyles = (id: string) => {
    switch (id) {
      case 'streak': return { text: 'text-brand-orange', bg: 'bg-orange-50/70 border-orange-100', emoji: '🔥' };
      case 'xp': return { text: 'text-brand-purple', bg: 'bg-purple-50/70 border-purple-100', emoji: '⭐' };
      case 'completed': return { text: 'text-brand-green', bg: 'bg-green-50/70 border-green-100', emoji: '📝' };
      case 'doubts': return { text: 'text-brand-blue', bg: 'bg-blue-50/70 border-blue-100', emoji: '💬' };
      case 'study_time': return { text: 'text-amber-600', bg: 'bg-amber-50/70 border-amber-100', emoji: '⏱️' };
      case 'quiz_accuracy': return { text: 'text-rose-500', bg: 'bg-rose-50/70 border-rose-100', emoji: '🎯' };
      default: return { text: 'text-gray-700', bg: 'bg-gray-50 border-gray-100', emoji: '📊' };
    }
  };

  const getProgressBarColor = (color: string): 'orange' | 'purple' | 'green' | 'blue' => {
    if (color === 'orange') return 'orange';
    if (color === 'purple') return 'purple';
    if (color === 'green') return 'green';
    return 'blue';
  };

  const maxChartVal = Math.max(...currentChunk.map((d: any) => d[selectedChartMetric] || 0), 1);

  const getMetricLabel = (m: ChartMetric) => {
    switch (m) {
      case 'homework': return 'Homework Uploaded';
      case 'quizzes': return 'Quizzes Completed';
      case 'tutorSessions': return 'AI Tutor Sessions';
      case 'doubts': return 'Doubts Solved';
      case 'studyTime': return 'Study Time (mins)';
    }
  };

  return (
    <div className="space-y-6">
      {/* Title Card */}
      <div className="bg-gradient-to-r from-brand-orange to-brand-amber text-white p-6 rounded-3xl shadow-sm relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3">
            <Button variant="back" onClick={handleBack}>←</Button>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <Badge variant="white">⭐ My Progress</Badge>
                <span className="text-[10px] text-white/85 font-black uppercase tracking-wider">Student Dashboard</span>
              </div>
              <h3 className="text-xl md:text-2xl font-black leading-tight">My Progress</h3>
              <p className="text-xs text-white/90 font-bold font-nunito">Track your learning journey, achievements, and performance.</p>
            </div>
          </div>
        </div>
        <div className="absolute right-0 top-0 w-48 h-48 bg-white/5 rounded-full blur-2xl -mr-16 -mt-16 pointer-events-none" />
      </div>

      {/* Date Filter & Report Downloads */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-4 rounded-3xl border border-gray-100 shadow-sm">
        {/* Date Filter */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-black text-gray-500 uppercase tracking-wider">Report Filter:</span>
          <select 
            value={filter} 
            onChange={(e) => handleFilterChange(e.target.value)}
            className="bg-gray-50 hover:bg-gray-100 border-2 border-gray-100/70 rounded-2xl px-4 py-2 text-xs font-extrabold text-gray-700 outline-none focus:border-brand-orange transition cursor-pointer shadow-sm"
          >
            <option value="last_7_days">📅 Last 7 Days</option>
            <option value="last_30_days">📅 Last 30 Days</option>
            <option value="this_month">📅 This Month</option>
            <option value="custom">📅 Custom Date Range</option>
          </select>

          {filter === 'custom' && (
            <div className="flex flex-wrap items-center gap-2.5 bg-gray-50 px-3 py-1.5 rounded-2xl border border-gray-100 animate-fade-in">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-black text-gray-400 uppercase">From:</span>
                <input 
                  type="date" 
                  value={customStartDate} 
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="bg-white border border-gray-200 rounded-xl px-2 py-1 text-xs font-bold text-gray-700 outline-none focus:border-brand-orange"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-black text-gray-400 uppercase">To:</span>
                <input 
                  type="date" 
                  value={customEndDate} 
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="bg-white border border-gray-200 rounded-xl px-2 py-1 text-xs font-bold text-gray-700 outline-none focus:border-brand-orange"
                />
              </div>
              <button 
                onClick={applyCustomFilter}
                className="bg-brand-orange hover:bg-brand-orange/90 active:scale-[0.98] text-white text-[11px] font-black px-3.5 py-1.5 rounded-xl transition shadow-sm cursor-pointer"
              >
                Apply
              </button>
            </div>
          )}
        </div>

        {/* Report Download Buttons */}
        <div className="flex flex-wrap gap-2.5">
          <Button 
            variant="secondary"
            onClick={handleDownloadPdf}
            className="flex items-center gap-2 text-xs py-2.5 px-4 rounded-xl font-black shadow-sm"
          >
            📥 Download PDF Report
          </Button>
          <Button 
            variant="blue"
            onClick={handleDownloadExcel}
            className="flex items-center gap-2 text-xs py-2.5 px-4 rounded-xl font-black shadow-sm"
          >
            📊 Download Excel Report
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center text-center py-20 bg-white rounded-3xl border border-gray-100 shadow-sm space-y-4">
          <div className="w-10 h-10 border-4 border-brand-orange border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500 font-extrabold font-nunito">Updating progress metrics...</p>
        </div>
      ) : (
        <>
          {/* Overview Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {stats.map((stat: any) => {
              const style = getStatStyles(stat.id);
              return (
                <div 
                  key={stat.id} 
                  className={`bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center transition-all duration-200 hover:-translate-y-1 hover:shadow-md ${style.bg}`}
                >
                  <div className="text-2xl mb-1">{style.emoji}</div>
                  <div className={`text-xl md:text-2xl font-black ${style.text}`}>
                    {stat.value}
                  </div>
                  <div className="text-[10px] text-gray-500 font-extrabold mt-1 select-none uppercase tracking-wide">
                    {stat.label}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Column: Subject Performance & Weekly Activity */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* Subject Performance */}
              <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
                  <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider select-none">
                    Subject Performance
                  </h4>
                  <span className="text-[10px] font-black bg-brand-orangeLight text-brand-orangeHover px-2 py-0.5 rounded-full uppercase">
                    Level progress
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                  {performanceBars.map((bar: any) => (
                    <div key={bar.id} className="space-y-1.5 font-nunito p-3 rounded-2xl border border-gray-50 hover:bg-gray-50/50 transition">
                      <div className="flex justify-between text-xs md:text-sm font-extrabold text-gray-700 select-none">
                        <span className="flex items-center gap-1">{bar.emoji} {bar.name}</span>
                        <span>{bar.progress}%</span>
                      </div>
                      <ProgressBar 
                        progress={bar.progress} 
                        color={getProgressBarColor(bar.color)} 
                        height={8} 
                      />
                      <div className="flex items-center justify-between text-[10px] font-extrabold pt-1">
                        <span className="text-gray-400">Weekly Trend:</span>
                        <span className={bar.trend.includes('+') ? 'text-green-500' : 'text-gray-500'}>
                          {bar.trend}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Weekly Activity Charts */}
              <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
                  <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider select-none">
                    Activity Breakdown
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {(['homework', 'quizzes', 'tutorSessions', 'doubts', 'studyTime'] as ChartMetric[]).map((metric) => (
                      <button
                        key={metric}
                        onClick={() => setSelectedChartMetric(metric)}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-black transition cursor-pointer select-none border border-transparent ${
                          selectedChartMetric === metric 
                            ? 'bg-brand-orange text-white shadow-sm' 
                            : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                        }`}
                      >
                        {metric === 'homework' && '📚 HW'}
                        {metric === 'quizzes' && '⚡ Quizzes'}
                        {metric === 'tutorSessions' && '🤖 Tutor'}
                        {metric === 'doubts' && '❓ Doubts'}
                        {metric === 'studyTime' && '⏱️ Study'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Navigation and Date Range Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50/50 px-4 py-2.5 rounded-2xl border border-gray-100/60 mb-3 font-nunito">
                  <div className="text-xs font-black text-gray-600 uppercase tracking-wide select-none flex items-center gap-1.5">
                    <span>📅</span>
                    <span className="text-brand-orangeHover">{formatDateRange(currentChunk)}</span>
                  </div>
                  <div className="flex items-center gap-2 select-none">
                    <button
                      onClick={() => setCurrentChunkIndex(prev => Math.min(chunks.length - 1, prev + 1))}
                      disabled={currentChunkIndex >= chunks.length - 1}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1 border border-gray-200/60 shadow-sm ${
                        currentChunkIndex < chunks.length - 1
                          ? 'bg-white text-gray-700 hover:bg-gray-100 hover:text-gray-900 active:scale-[0.98] cursor-pointer'
                          : 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-50'
                      }`}
                    >
                      ◀ Previous Week
                    </button>
                    <button
                      onClick={() => setCurrentChunkIndex(prev => Math.max(0, prev - 1))}
                      disabled={currentChunkIndex <= 0}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1 border border-gray-200/60 shadow-sm ${
                        currentChunkIndex > 0
                          ? 'bg-white text-gray-700 hover:bg-gray-100 hover:text-gray-900 active:scale-[0.98] cursor-pointer'
                          : 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-50'
                      }`}
                    >
                      Next Week ▶
                    </button>
                  </div>
                </div>

                {/* SVG Chart */}
                <div className="p-3 bg-gray-50/40 rounded-2xl border border-gray-100/70">
                  <p className="text-[11px] font-extrabold text-gray-400 mb-2 select-none uppercase tracking-wide">
                    {getMetricLabel(selectedChartMetric)} Trends
                  </p>
                  
                  <svg viewBox="0 0 500 200" className="w-full h-48 select-none font-nunito">
                    {/* Grid lines */}
                    <line x1="40" y1="30" x2="480" y2="30" stroke="#F1F5F9" strokeWidth="1" />
                    <line x1="40" y1="80" x2="480" y2="80" stroke="#F1F5F9" strokeWidth="1" />
                    <line x1="40" y1="130" x2="480" y2="130" stroke="#F1F5F9" strokeWidth="1" />
                    <line x1="40" y1="170" x2="480" y2="170" stroke="#E2E8F0" strokeWidth="1.5" />
                    
                    {/* Bars rendering */}
                    {currentChunk.map((day: any, idx: number) => {
                      const chunkLength = currentChunk.length || 7;
                      const barWidth = Math.max(14, 200 / chunkLength);
                      const spacing = (440 - barWidth * chunkLength) / (chunkLength + 1);
                      const x = 40 + spacing + idx * (barWidth + spacing);
                      const val = day[selectedChartMetric] || 0;
                      const height = (val / maxChartVal) * 130;
                      const y = 170 - height;
                      
                      return (
                        <g key={day.date || idx} className="group cursor-pointer">
                          {/* Tooltip Background */}
                          <rect 
                            x={x - (34 - barWidth) / 2} 
                            y={y - 25} 
                            width="34" 
                            height="18" 
                            rx="5" 
                            fill="#1E293B" 
                            className="opacity-0 group-hover:opacity-100 transition-opacity duration-150" 
                          />
                          {/* Tooltip value */}
                          <text 
                            x={x + barWidth / 2} 
                            y={y - 13} 
                            fill="white" 
                            fontSize="8" 
                            fontWeight="bold" 
                            textAnchor="middle" 
                            className="opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                          >
                            {val}
                          </text>
                          {/* The main bar */}
                          <rect
                            x={x}
                            y={y}
                            width={barWidth}
                            height={height}
                            rx={Math.min(3, barWidth / 2)}
                            fill={`url(#gradient-${selectedChartMetric})`}
                            className="transition-all duration-300 hover:brightness-105"
                          />
                          {/* X label */}
                          <text 
                            x={x + barWidth / 2} 
                            y="186" 
                            fill="#94A3B8" 
                            fontSize="9" 
                            fontWeight="extrabold" 
                            textAnchor="middle"
                          >
                            {formatAxisDate(day.date)}
                          </text>
                        </g>
                      );
                    })}
                    
                    {/* Gradients */}
                    <defs>
                      <linearGradient id="gradient-homework" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#FF6B35" />
                        <stop offset="100%" stopColor="#FFA07A" />
                      </linearGradient>
                      <linearGradient id="gradient-quizzes" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4CAF50" />
                        <stop offset="100%" stopColor="#81C784" />
                      </linearGradient>
                      <linearGradient id="gradient-tutorSessions" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#7B5EA7" />
                        <stop offset="100%" stopColor="#B39DDB" />
                      </linearGradient>
                      <linearGradient id="gradient-doubts" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2196F3" />
                        <stop offset="100%" stopColor="#64B5F6" />
                      </linearGradient>
                      <linearGradient id="gradient-studyTime" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#FF9800" />
                        <stop offset="100%" stopColor="#FFB74D" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
              </div>

            </div>

            {/* Right Column: AI Learning Insights & Achievements */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* AI Learning Insights */}
              <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                  <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider select-none">
                    AI Learning Insights
                  </h4>
                  <span className="text-[10px] font-black bg-brand-purpleLight text-brand-purple px-2 py-0.5 rounded-full uppercase">
                    Personalized
                  </span>
                </div>
                
                <div className="space-y-3 font-nunito">
                  {recommendations.map((rec: string, index: number) => {
                    const parts = rec.split(' ');
                    const symbol = parts[0];
                    const content = parts.slice(1).join(' ');
                    return (
                      <div 
                        key={index} 
                        className="flex gap-3.5 items-center p-3 rounded-2xl bg-gray-50/50 border border-gray-100/70 hover:bg-gray-50 transition"
                      >
                        <div className="text-2xl shrink-0 select-none">{symbol}</div>
                        <div>
                          <h5 className="text-xs font-extrabold text-gray-500 mb-0.5 uppercase tracking-wide">
                            {symbol === '✅' && 'Strongest Subject'}
                            {symbol === '📈' && 'Recent Improvement'}
                            {symbol === '🎯' && 'Practice Priority'}
                            {symbol === '🔥' && 'Consistency Metric'}
                          </h5>
                          <p className="text-sm text-gray-800 font-extrabold leading-tight">
                            {content}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Achievements / Badges */}
              <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                  <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider select-none">
                    Earned Badges
                  </h4>
                  <span className="text-[10px] font-black bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full uppercase">
                    Achievements
                  </span>
                </div>

                <div className="space-y-3 font-nunito">
                  {achievements.map((badge: any) => (
                    <div 
                      key={badge.id}
                      className={`flex gap-3.5 items-center p-3.5 rounded-2xl border transition duration-200 ${
                        badge.unlocked 
                          ? 'bg-gradient-to-r from-brand-orange/5 to-brand-amber/5 border-orange-100/75 hover:from-brand-orange/10 hover:to-brand-amber/10' 
                          : 'bg-gray-50/40 border-gray-100 opacity-60 select-none grayscale'
                      }`}
                    >
                      <div className="text-3xl shrink-0 select-none p-2 bg-white rounded-xl shadow-sm border border-gray-100/60">
                        {badge.emoji}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <h5 className="text-sm font-black text-gray-800 leading-tight truncate">
                            {badge.name}
                          </h5>
                          {badge.unlocked && (
                            <span className="text-[10px] font-black bg-brand-orangeLight text-brand-orangeHover px-2 py-0.5 rounded-full uppercase shrink-0">
                              Unlocked ✓
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500 font-semibold leading-relaxed mt-0.5">
                          {badge.description}
                        </p>
                        {badge.unlocked && badge.earnedDate && (
                          <div className="text-[9px] text-gray-400 font-extrabold mt-1">
                            Earned on: {badge.earnedDate}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

          </div>
        </>
      )}
    </div>
  );
};

export default ParentView;
