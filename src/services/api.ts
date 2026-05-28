import type { ActionCard, HWStep, OnboardingFeature, ParentStat, QuizQuestion, Recommendation, Subject, UserState } from '../types/types';

const runtimeApiBase =
  typeof window !== 'undefined' && ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
    ? 'http://127.0.0.1:4000'
    : '';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? runtimeApiBase;

type JsonRecord = Record<string, unknown>;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const hasBody = typeof init.body !== 'undefined';
  const headers = new Headers(init.headers ?? {});

  if (hasBody && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  const contentType = response.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const detail = typeof data === 'string'
      ? data
      : (data as JsonRecord)?.detail ?? (data as JsonRecord)?.message ?? `Request failed (${response.status})`;
    throw new Error(String(detail));
  }

  return data as T;
}

export const resolveBackendUrl = (path?: string | null) => {
  if (!path) {
    return '';
  }

  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  return `${API_BASE}${path}`;
};

export interface AppInfoPayload {
  name: string;
  description: string;
  version: string;
  defaultLanguage: string;
  supportedLanguages: string[];
}

export interface SessionPayload {
  loggedIn: boolean;
  activeScreen: number;
  language: 'en' | 'ta' | 'both';
  selectedSubjectId: string | null;
}

export interface DashboardPayload {
  app: AppInfoPayload;
  user: UserState;
  subjects: Subject[];
  actionCards: ActionCard[];
  weeklyProgress: Array<{ id: string; name: string; emoji: string; progress: number; colorVariant: string }>;
  recommendations: Recommendation[];
  selectedSubject: Subject | null;
  studyPlan: Array<{ id: string; title: string; description: string; progress: number; priority: string }>;
  lastAnalysis: JsonRecord | null;
}

export interface OnboardingPayload {
  app: AppInfoPayload;
  features: OnboardingFeature[];
  cta: { primary: string; secondary: string };
}

export interface StepPayload extends HWStep {}

export interface ExplanationPayload {
  question: string;
  subject: JsonRecord;
  finalAnswer: string;
  steps: StepPayload[];
  analysisId: number | null;
  summary?: string;
  detailedExplanation?: string;
  scanMethod?: string;
  sourceType?: string;
  extractedText?: string;
  pageCount?: number;
  fileName?: string;
  fileType?: string;
  fileUrl?: string;
  scan?: JsonRecord;
}

export interface ExplanationChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ExplanationChatRequest {
  analysisId?: number | null;
  message: string;
  language?: 'en' | 'ta' | 'both';
  history?: ExplanationChatMessage[];
}

export interface ExplanationChatResponse {
  analysisId?: number | null;
  reply: string;
  suggestedQuestions?: string[];
  scanMethod?: string;
  sourceType?: string;
  questionText?: string;
}

export interface QuizStatePayload {
  questions: QuizQuestion[];
  currentIndex: number;
  currentQuestion: QuizQuestion | null;
  selectedOption: string | null;
  status: 'idle' | 'correct' | 'wrong';
  xpEarnedThisSession: number;
  toastMessage: string | null;
  progressPercent: number;
  topic?: string | null;
  title?: string | null;
  subjectId?: string | null;
}

export interface ParentPayload {
  app: AppInfoPayload;
  user: UserState;
  stats: ParentStat[];
  performanceBars: Array<{ subject: string; progress: number; color: 'orange' | 'purple' | 'green' | 'blue' }>;
  recommendations: Recommendation[];
  insights: JsonRecord;
}

export interface HomeworkAnalyzePayload {
  questionText?: string;
  inputMethod?: string;
  subject?: string;
  language?: 'en' | 'ta' | 'both';
  transcript?: string;
  fileName?: string;
  fileType?: string;
  fileDataBase64?: string;
  notes?: string;
  ocrText?: string;
}

export interface HomeworkAnalyzeResponse {
  status: 'ok' | 'needs_review' | 'error';
  analysisId?: number;
  source?: string;
  questionText?: string;
  detectedSubject?: JsonRecord;
  problemType?: string;
  finalAnswer?: string;
  extractedEquation?: string;
  variable?: string;
  numericAnswer?: number;
  steps?: StepPayload[];
  summary?: string;
  detailedExplanation?: string;
  scanMethod?: string;
  sourceType?: string;
  extractedText?: string;
  pageCount?: number;
  quiz?: JsonRecord | null;
  recommendations?: Recommendation[];
  message?: string;
  fileName?: string;
  fileType?: string;
  fileUrl?: string;
  scan?: JsonRecord;
}

export interface SessionEnvelope {
  ok: boolean;
  session: SessionPayload;
  user: UserState;
  subscription?: JsonRecord;
}

export interface QuizAnswerResponse {
  ok: boolean;
  quiz: QuizStatePayload;
  user: UserState;
  result: {
    correct: boolean;
    correctOption: string;
    selectedOption: string;
    xpAwarded: number;
    toastMessage: string;
  };
}

export const toUserState = (user: Partial<UserState> | null | undefined): Partial<UserState> => {
  return {
    name: user?.name ?? 'Arjun',
    className: user?.className ?? 'Class 8',
    avatar: user?.avatar ?? '\u{1F9D1}',
    streak: typeof user?.streak === 'number' ? user.streak : 0,
    xpPoints: typeof user?.xpPoints === 'number' ? user.xpPoints : 0,
    level: user?.level ?? 'Bronze',
    language: user?.language,
    loggedIn: user?.loggedIn,
    activeScreen: user?.activeScreen,
    selectedSubjectId: user?.selectedSubjectId ?? null,
    homeworkCompleted: user?.homeworkCompleted,
    doubtsSolved: user?.doubtsSolved,
    quizCorrect: user?.quizCorrect,
    quizAnswered: user?.quizAnswered,
    quizCurrentIndex: user?.quizCurrentIndex,
    quizStatus: user?.quizStatus,
    subscriptionPlan: user?.subscriptionPlan,
  };
};

export const fileToBase64 = async (file: File) => {
  const result = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Could not read the uploaded file'));
    reader.readAsDataURL(file);
  });

  return {
    fileName: file.name,
    fileType: file.type,
    fileDataBase64: result,
  };
};

export const getHealth = () => request<JsonRecord>('/health');
export const getSession = () => request<SessionEnvelope>('/api/session');
export const login = () => request<SessionEnvelope>('/api/session/login', { method: 'POST' });
export const logout = () => request<SessionEnvelope>('/api/session/logout', { method: 'POST' });
export const updateScreen = (activeScreen: number) =>
  request<SessionEnvelope>('/api/session/screen', {
    method: 'POST',
    body: JSON.stringify({ activeScreen }),
  });
export const updateLanguage = (language: 'en' | 'ta' | 'both') =>
  request<SessionEnvelope>('/api/session/language', {
    method: 'POST',
    body: JSON.stringify({ language }),
  });
export const updateSubject = (selectedSubjectId: string) =>
  request<SessionEnvelope>('/api/session/subject', {
    method: 'POST',
    body: JSON.stringify({ selectedSubjectId }),
  });
export const updateSession = (payload: { activeScreen?: number; language?: 'en' | 'ta' | 'both'; selectedSubjectId?: string | null }) =>
  request<SessionEnvelope>('/api/session/update', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const getBootstrap = () => request<JsonRecord>('/api/bootstrap');
export const getDashboard = () => request<DashboardPayload>('/api/dashboard');
export const getOnboarding = () => request<OnboardingPayload>('/api/onboarding');
export const getExplanation = (analysisId?: number | null) =>
  request<ExplanationPayload>(`/api/explanation${analysisId ? `?analysisId=${encodeURIComponent(String(analysisId))}` : ''}`);
export const chatExplanation = (payload: ExplanationChatRequest) =>
  request<ExplanationChatResponse>('/api/explanation/chat', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
export const getQuiz = () => request<QuizStatePayload>('/api/quiz');
export const getQuizQuestion = (id?: string) => request<JsonRecord>(`/api/quiz/question${id ? `?id=${encodeURIComponent(id)}` : ''}`);
export const answerQuiz = (selectedOption: string) =>
  request<QuizAnswerResponse>('/api/quiz/answer', {
    method: 'POST',
    body: JSON.stringify({ selectedOption }),
  });
export const nextQuiz = () => request<{ ok: boolean; quiz: QuizStatePayload }>('/api/quiz/next', { method: 'POST' });
export const resetQuiz = () => request<{ ok: boolean; quiz: QuizStatePayload }>('/api/quiz/reset', { method: 'POST' });

export const analyzeHomework = (payload: HomeworkAnalyzePayload) =>
  request<HomeworkAnalyzeResponse>('/api/homework/analyze', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const getParent = () => request<ParentPayload>('/api/parent');
export const getParentReport = () => request<JsonRecord>('/api/parent/report');
export const getPlannerToday = () => request<JsonRecord>('/api/planner/today');
export const getAnalyticsSummary = () => request<JsonRecord>('/api/analytics/summary');
export const getSubscription = () => request<JsonRecord>('/api/subscription');
export const upgradeSubscription = (planName: string) =>
  request<JsonRecord>('/api/subscription/upgrade', {
    method: 'POST',
    body: JSON.stringify({ planName }),
  });
export const cancelSubscription = () => request<JsonRecord>('/api/subscription/cancel', { method: 'POST' });
