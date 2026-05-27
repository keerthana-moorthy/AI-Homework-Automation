import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { QuizQuestion } from '../../types/types';
import { QUIZ_QUESTIONS } from '../../constants/mockData';

interface QuizState {
  questions: QuizQuestion[];
  currentIndex: number;
  selectedOption: string | null;
  status: 'idle' | 'correct' | 'wrong';
  xpEarnedThisSession: number;
  toastMessage: string | null;
}

const initialState: QuizState = {
  questions: QUIZ_QUESTIONS,
  currentIndex: 0,
  selectedOption: null,
  status: 'idle',
  xpEarnedThisSession: 0,
  toastMessage: null,
};

const quizSlice = createSlice({
  name: 'quiz',
  initialState,
  reducers: {
    selectOption: (state, action: PayloadAction<string>) => {
      if (state.status !== 'idle') return; // prevent double selection
      
      const option = action.payload;
      state.selectedOption = option;
      
      const currentQuestion = state.questions[state.currentIndex];
      
      // Original design highlights correct options with 'correct' classes, and wrong with 'wrong'
      // Option format matching: correct option is e.g. "B)  x = 7  ✅"
      if (option === currentQuestion.correctOption) {
        state.status = 'correct';
        state.xpEarnedThisSession += 10;
        state.toastMessage = "+10 XP earned! Keep going, you're on fire! 🔥";
      } else {
        state.status = 'wrong';
        state.toastMessage = "Oops! That's incorrect. Try again! 💡";
      }
    },
    nextQuestion: (state) => {
      state.selectedOption = null;
      state.status = 'idle';
      state.toastMessage = null;
      
      if (state.currentIndex < state.questions.length - 1) {
        state.currentIndex += 1;
      } else {
        // Wrap around for continuous prototype review
        state.currentIndex = 0;
        state.xpEarnedThisSession = 0;
      }
    },
    resetQuiz: (state) => {
      state.currentIndex = 0;
      state.selectedOption = null;
      state.status = 'idle';
      state.xpEarnedThisSession = 0;
      state.toastMessage = null;
    },
  },
});

export const { selectOption, nextQuestion, resetQuiz } = quizSlice.actions;
export default quizSlice.reducer;
