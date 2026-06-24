import React, { useEffect, useRef } from 'react';
import { Provider } from 'react-redux';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import DashboardLayout from './components/layout/DashboardLayout';
import DashboardView from './features/dashboard/DashboardView';
import ExplanationView from './features/explanation/ExplanationView';
import OnboardingView from './features/onboarding/OnboardingView';
import ParentView from './features/parent/ParentView';
import QuizView from './features/quiz/QuizView';
import UploadView from './features/upload/UploadView';
import TutorView from './features/tutor/TutorView';
import StudyPlanView from './features/studyplan/StudyPlanView';
import AuthModal from './components/auth/AuthModal';
import ProtectedRoute from './components/common/ProtectedRoute';
import { getSession, toUserState, getAuthStatus, updateScreen } from './services/api';
import {
  hydrateSession,
  setLoading,
  setIsAuthenticated,
  setShowAuthModal,
  setAuthModalContext,
  setActiveScreen,
} from './store/slices/appSlice';
import store, { useAppDispatch, useAppSelector } from './store';

const AUTH_TIMER_SECONDS = 30;

// Helper to keep backend activeScreen synchronized with our frontend router
const ROUTE_TO_SCREEN_MAP: Array<{ pattern: RegExp; screen: number }> = [
  { pattern: /^\/dashboard/, screen: 0 },
  { pattern: /^\/scan-homework/, screen: 2 },
  { pattern: /^\/explanation/, screen: 3 },
  { pattern: /^\/daily-quiz/, screen: 4 },
  { pattern: /^\/quiz/, screen: 4 },
  { pattern: /^\/my-progress/, screen: 5 },
  { pattern: /^\/ai-tutor/, screen: 6 },
  { pattern: /^\/study-plan/, screen: 7 },
];

const RouteSync: React.FC = () => {
  const location = useLocation();
  const dispatch = useAppDispatch();
  const activeScreen = useAppSelector((state) => state.app.activeScreen);

  useEffect(() => {
    const matched = ROUTE_TO_SCREEN_MAP.find((m) => m.pattern.test(location.pathname));
    if (matched && matched.screen !== activeScreen) {
      dispatch(setActiveScreen(matched.screen));
      void updateScreen(matched.screen).catch((error) => {
        console.error('Unable to persist screen change', error);
      });
    }
  }, [location.pathname, dispatch, activeScreen]);

  return null;
};

const MainAppContent: React.FC = () => {
  const dispatch = useAppDispatch();
  const isLoggedIn = useAppSelector((state) => state.app.isLoggedIn);
  const loading = useAppSelector((state) => state.app.loading);
  const isAuthenticated = useAppSelector((state) => state.app.isAuthenticated);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const bootstrapSession = async () => {
      dispatch(setLoading(true));
      try {
        // 1. Load session (existing user data, screen state etc.)
        const response = await getSession();
        if (cancelled) return;

        dispatch(
          hydrateSession({
            loggedIn: response.session.loggedIn,
            activeScreen: response.session.activeScreen,
            language: response.session.language,
            selectedSubjectId: response.session.selectedSubjectId,
            user: toUserState(response.user),
          })
        );

        // 2. Check if user has registered credentials AND is currently logged in.
        // If the user logged out previously, `loggedIn` will be false in the DB
        // so we must NOT set isAuthenticated on restart.
        const authStatus = await getAuthStatus();
        if (cancelled) return;

        if (authStatus.registered && authStatus.loggedIn) {
          dispatch(setIsAuthenticated(true));
        } else {
          // Start 30-second timer to prompt sign-up
          timerRef.current = setTimeout(() => {
            dispatch(setAuthModalContext('timer'));
            dispatch(setShowAuthModal(true));
          }, AUTH_TIMER_SECONDS * 1000);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load session', error);
          dispatch(setLoading(false));
        }
      } finally {
        if (!cancelled) {
          dispatch(setLoading(false));
        }
      }
    };

    void bootstrapSession();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [dispatch]);

  // Cancel the 30s timer once authenticated
  useEffect(() => {
    if (isAuthenticated && timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [isAuthenticated]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-amberLight via-white to-brand-blueLight font-nunito">
        <div className="bg-white/90 backdrop-blur rounded-3xl border border-white shadow-xl px-6 py-5 text-center max-w-sm mx-4">
          <div className="w-12 h-12 rounded-full bg-brand-orange text-white flex items-center justify-center mx-auto mb-3 text-2xl shadow-[0_4px_0_#C84B1E]">
            🎓
          </div>
          <h1 className="text-lg font-black text-gray-800">Loading Vidya AI</h1>
          <p className="text-sm text-gray-500 font-semibold mt-1">Connecting to your backend session...</p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <>
        <OnboardingView />
        <AuthModal />
      </>
    );
  }

  return (
    <>
      <RouteSync />
      <DashboardLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardView />} />
          <Route
            path="/scan-homework"
            element={
              <ProtectedRoute context="scan">
                <UploadView />
              </ProtectedRoute>
            }
          />
          <Route path="/explanation/:analysisId" element={<ExplanationView />} />
          <Route path="/explanation/:analysisId/visual-learning" element={<ExplanationView />} />
          <Route path="/ai-tutor" element={<TutorView />} />
          <Route path="/ai-tutor/chat/:id" element={<TutorView />} />
          <Route
            path="/study-plan"
            element={
              <ProtectedRoute context="studyplan">
                <StudyPlanView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/study-plan/:planId"
            element={
              <ProtectedRoute context="studyplan">
                <StudyPlanView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/daily-quiz"
            element={
              <ProtectedRoute context="quiz">
                <QuizView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/quiz/:quizId/result"
            element={
              <ProtectedRoute context="quiz">
                <QuizView />
              </ProtectedRoute>
            }
          />
          <Route path="/my-progress" element={<ParentView />} />
          <Route path="/my-progress/report/:id" element={<ParentView />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </DashboardLayout>
      {/* Global auth modal — rendered above everything */}
      <AuthModal />
    </>
  );
};

export const App: React.FC = () => {
  return (
    <Provider store={store}>
      <BrowserRouter>
        <MainAppContent />
      </BrowserRouter>
    </Provider>
  );
};

export default App;
