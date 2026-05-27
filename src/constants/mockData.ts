import type { Subject, ActionCard, OnboardingFeature, HWStep, QuizQuestion, ParentStat, Recommendation } from '../types/types';

export const SUBJECTS: Subject[] = [
  { id: 'maths', name: 'Maths', emoji: '📐', colorClass: 'bg-brand-blueLight text-brand-blueDark border-brand-blueBorder', progress: 72, colorHex: '#FF6B35' },
  { id: 'science', name: 'Science', emoji: '🔬', colorClass: 'bg-brand-greenLight text-brand-greenDark border-brand-greenBorder', progress: 55, colorHex: '#7B5EA7' },
  { id: 'english', name: 'English', emoji: '📖', colorClass: 'bg-brand-orangeLight text-brand-orangeHover border-brand-amberBorder', progress: 88, colorHex: '#4CAF50' },
  { id: 'tamil', name: 'Tamil', emoji: '🅰', colorClass: 'bg-brand-purpleLight text-brand-purple border-brand-purpleBorder', progress: 64, colorHex: '#2196F3' },
  { id: 'history', name: 'History', emoji: '📅', colorClass: 'bg-brand-yellowLight text-brand-yellowDark border-brand-yellowBorder', progress: 40, colorHex: '#F57F17' },
];

export const ACTION_CARDS: ActionCard[] = [
  { id: 'scan', emoji: '📸', label: 'Scan Homework', subtext: 'Upload & solve', cardType: 'orange', targetScreen: 2 },
  { id: 'doubt', emoji: '💬', label: 'Ask a Doubt', subtext: 'Instant AI help', cardType: 'purple', targetScreen: 3 },
  { id: 'quiz', emoji: '⚡', label: 'Daily Quiz', subtext: 'Earn 50 XP', cardType: 'green', targetScreen: 4 },
  { id: 'plan', emoji: '📅', label: 'Study Plan', subtext: 'Today\'s goals', cardType: 'blue', targetScreen: 0 },
];

export const ONBOARDING_FEATURES: OnboardingFeature[] = [
  { id: 'scan', emoji: '📸', label: 'Scan any homework', subtext: 'Photo → instant solution', colorType: 'o' },
  { id: 'doubt', emoji: '💬', label: 'Ask doubts anytime', subtext: 'Text, voice or image', colorType: 'p' },
  { id: 'xp', emoji: '🏆', label: 'Earn XP & badges', subtext: 'Study becomes fun', colorType: 'g' },
  { id: 'lang', emoji: '🌐', label: 'Tamil & English', subtext: 'Learn in your language', colorType: 'b' },
];

export const EXPLANATION_STEPS: HWStep[] = [
  { stepNum: 1, title: 'Identify the variable', desc: 'We need to find the value of x. Move numbers to one side.' },
  { stepNum: 2, title: 'Subtract 7 from both sides', desc: '3x + 7 − 7 = 22 − 7 → 3x = 15' },
  { stepNum: 3, title: 'Divide both sides by 3', desc: '3x ÷ 3 = 15 ÷ 3 → x = 5' },
];

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 'q1',
    question: 'What is the value of x if 2x − 4 = 10 ?',
    options: ['A)  x = 5', 'B)  x = 7  ✅', 'C)  x = 3  ✗', 'D)  x = 6'],
    correctOption: 'B)  x = 7  ✅',
    wrongOption: 'C)  x = 3  ✗'
  },
  {
    id: 'q2',
    question: 'Solve for y: 5y + 12 = 32',
    options: ['A)  y = 3', 'B)  y = 5', 'C)  y = 4  ✅', 'D)  y = 6'],
    correctOption: 'C)  y = 4  ✅'
  },
  {
    id: 'q3',
    question: 'If 3z - 9 = z + 1, then z is:',
    options: ['A)  z = 5  ✅', 'B)  z = 4', 'C)  z = 3', 'D)  z = 2'],
    correctOption: 'A)  z = 5  ✅'
  }
];

export const PARENT_STATS: ParentStat[] = [
  { id: 'streak', value: '12 🔥', label: 'Day Streak', colorHex: '#FF6B35' },
  { id: 'xp', value: '840⭐', label: 'Total XP', colorHex: '#7B5EA7' },
  { id: 'completed', value: '7', label: 'HW Completed', colorHex: '#4CAF50' },
  { id: 'doubts', value: '24', label: 'Doubts Solved', colorHex: '#2196F3' },
];

export const RECOMMENDATIONS: Recommendation[] = [
  {
    id: 'rec1',
    emoji: '💡',
    title: 'Focus on Science this week',
    description: 'Arjun struggled with force & motion (3 errors). AI will increase practice.'
  }
];
