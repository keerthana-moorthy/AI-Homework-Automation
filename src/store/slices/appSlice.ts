import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { UserState } from '../../types/types';

interface AppState {
  isLoggedIn: boolean;
  activeScreen: number; // 0: Dashboard, 1: Onboarding, 2: Upload, 3: Explanation, 4: Quiz, 5: Parent
  language: 'en' | 'ta' | 'both';
  selectedSubjectId: string | null;
  loading: boolean;
  user: UserState;
}

const levelForXp = (xpPoints: number) => {
  if (xpPoints >= 1600) return 'Platinum';
  if (xpPoints >= 1200) return 'Diamond';
  if (xpPoints >= 800) return 'Gold';
  if (xpPoints >= 400) return 'Silver';
  return 'Bronze';
};

const initialState: AppState = {
  isLoggedIn: false,
  activeScreen: 1, // Start with Onboarding view
  language: 'en',
  selectedSubjectId: 'maths',
  loading: true,
  user: {
    name: 'Arjun',
    className: 'Class 8',
    avatar: '\u{1F9D1}',
    streak: 12,
    xpPoints: 840,
    level: 'Gold',
  },
};

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    hydrateSession: (
      state,
      action: PayloadAction<{
        loggedIn: boolean;
        activeScreen: number;
        language: 'en' | 'ta' | 'both';
        selectedSubjectId?: string | null;
        user?: Partial<UserState>;
      }>
    ) => {
      state.isLoggedIn = action.payload.loggedIn;
      state.activeScreen = action.payload.activeScreen;
      state.language = action.payload.language;
      state.selectedSubjectId = action.payload.selectedSubjectId ?? state.selectedSubjectId;
      if (action.payload.user) {
        state.user = { ...state.user, ...action.payload.user };
      }
      state.loading = false;
    },
    setLoggedIn: (state, action: PayloadAction<boolean>) => {
      state.isLoggedIn = action.payload;
    },
    setActiveScreen: (state, action: PayloadAction<number>) => {
      state.activeScreen = action.payload;
    },
    setLanguage: (state, action: PayloadAction<'en' | 'ta' | 'both'>) => {
      state.language = action.payload;
    },
    setSelectedSubjectId: (state, action: PayloadAction<string | null>) => {
      state.selectedSubjectId = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setUser: (state, action: PayloadAction<Partial<UserState>>) => {
      state.user = { ...state.user, ...action.payload };
      if (typeof action.payload.xpPoints === 'number') {
        state.user.level = action.payload.level ?? levelForXp(action.payload.xpPoints);
      }
    },
    incrementStreak: (state) => {
      state.user.streak += 1;
    },
    addXp: (state, action: PayloadAction<number>) => {
      state.user.xpPoints += action.payload;
      state.user.level = levelForXp(state.user.xpPoints);
    },
  },
});

export const {
  hydrateSession,
  setLoggedIn,
  setActiveScreen,
  setLanguage,
  setSelectedSubjectId,
  setLoading,
  setUser,
  incrementStreak,
  addXp,
} = appSlice.actions;
export default appSlice.reducer;
