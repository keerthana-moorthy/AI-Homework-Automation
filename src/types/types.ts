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
}
