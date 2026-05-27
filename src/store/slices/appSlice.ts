import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { UserState } from '../../types/types';

interface AppState {
  isLoggedIn: boolean;
  activeScreen: number; // 0: Dashboard, 1: Onboarding, 2: Upload, 3: Explanation, 4: Quiz, 5: Parent
  language: 'en' | 'ta' | 'both';
  user: UserState;
}

const initialState: AppState = {
  isLoggedIn: false,
  activeScreen: 1, // Start with Onboarding view
  language: 'en',
  user: {
    name: 'Arjun',
    className: 'Class 8',
    avatar: '🧑',
    streak: 12,
    xpPoints: 840,
    level: 'Gold',
  },
};

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    setLoggedIn: (state, action: PayloadAction<boolean>) => {
      state.isLoggedIn = action.payload;
    },
    setActiveScreen: (state, action: PayloadAction<number>) => {
      state.activeScreen = action.payload;
    },
    setLanguage: (state, action: PayloadAction<'en' | 'ta' | 'both'>) => {
      state.language = action.payload;
    },
    incrementStreak: (state) => {
      state.user.streak += 1;
    },
    addXp: (state, action: PayloadAction<number>) => {
      state.user.xpPoints += action.payload;
      // Recalculate level if needed, for prototype we just add
    },
  },
});

export const { setLoggedIn, setActiveScreen, setLanguage, incrementStreak, addXp } = appSlice.actions;
export default appSlice.reducer;
