export interface Subject {
  id: string;
  name: string;
  emoji: string;
  colorClass: string; // for tailwind styles
  progress: number;
  colorHex: string; // original design system hexes
}

export interface ActionCard {
  id: string;
  emoji: string;
  label: string;
  subtext: string;
  cardType: 'orange' | 'purple' | 'green' | 'blue';
  targetScreen: number;
}

export interface OnboardingFeature {
  id: string;
  emoji: string;
  label: string;
  subtext: string;
  colorType: 'o' | 'p' | 'g' | 'b';
}

export interface HWStep {
  stepNum: number;
  title: string;
  desc: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctOption: string; // e.g. "B)  x = 7  ✅" or matching option text exactly
  wrongOption?: string; // for showing original incorrect options from HTML
}

export interface ParentStat {
  id: string;
  value: string;
  label: string;
  colorHex: string;
}

export interface Recommendation {
  id: string;
  emoji: string;
  title: string;
  description: string;
}

export interface UserState {
  name: string;
  className: string;
  avatar: string;
  streak: number;
  xpPoints: number;
  level: string;
  email?: string | null;
  language?: 'en' | 'ta' | 'both';
  loggedIn?: boolean;
  activeScreen?: number;
  selectedSubjectId?: string | null;
  activeAnalysisId?: number | null;
  homeworkCompleted?: number;
  doubtsSolved?: number;
  quizCorrect?: number;
  quizAnswered?: number;
  quizCurrentIndex?: number;
  quizStatus?: string;
  subscriptionPlan?: string;
}

export interface StudyPlanDayTask {
  title: string;
  completed: boolean;
}

export interface StudyPlanDay {
  dayNum: number;
  date: string;
  topic: string;
  description: string;
  difficulty: string;
  estimatedHours: number;
  tasks: StudyPlanDayTask[];
}

export interface StudyPlan {
  id: number;
  title?: string;
  startDate: string;
  endDate: string;
  fileName: string | null;
  fileUrl: string | null;
  numDays: number;
  planData: StudyPlanDay[];
  progress: number;
  extractedTopics?: { topics: Array<{ title: string; subtopics: string[] }> } | null;
  numPages: number;
  estimatedHours: number;
  summary: string | null;
  rawText: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface TodayHomeworkItem {
  id: number;
  title: string;
  subjectId: string | null;
  subjectName: string | null;
  subjectEmoji: string | null;
  dueDate: string;
  status: string;
  createdAt: string;
}

export interface TodayActionItem {
  id: string;
  title: string;
  planTitle: string;
  estimatedHours: number | null;
  completed: boolean;
  planId: number;
  dayNum: number;
  taskIndex: number;
  /** True when this task belongs to a past (missed) day */
  isCarryOver?: boolean;
  /** The original date string (YYYY-MM-DD) of the past day */
  originalDate?: string;
}

/** Semantic status of a single plan day relative to today */
export type DayStatus =
  | 'completed'   // all tasks done
  | 'in_progress' // today, some tasks done
  | 'not_started' // today, no tasks done
  | 'partial'     // past day, some tasks done
  | 'missed'      // past day, zero tasks done
  | 'upcoming';   // future day
