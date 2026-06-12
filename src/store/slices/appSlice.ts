import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { UserState } from '../../types/types';

interface AppState {
  isLoggedIn: boolean;
  activeScreen: number;
  language: 'en' | 'ta' | 'both';
  selectedSubjectId: string | null;
  loading: boolean;
  user: UserState;
  isAuthenticated: boolean;          // user has real credentials in the DB
  showAuthModal: boolean;            // controls modal visibility
  authModalContext: 'timer' | 'scan' | 'quiz' | 'studyplan' | null;
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
  activeScreen: 1,
  language: 'en',
  selectedSubjectId: 'all',
  loading: true,
  isAuthenticated: false,
  showAuthModal: false,
  authModalContext: null,
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
    setIsAuthenticated: (state, action: PayloadAction<boolean>) => {
      state.isAuthenticated = action.payload;
    },
    setShowAuthModal: (state, action: PayloadAction<boolean>) => {
      state.showAuthModal = action.payload;
    },
    setAuthModalContext: (state, action: PayloadAction<AppState['authModalContext']>) => {
      state.authModalContext = action.payload;
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
  setIsAuthenticated,
  setShowAuthModal,
  setAuthModalContext,
} = appSlice.actions;
export default appSlice.reducer;
