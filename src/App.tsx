import React, { useEffect } from 'react';
import { Provider } from 'react-redux';
import store, { useAppDispatch, useAppSelector } from './store';
import DashboardLayout from './components/layout/DashboardLayout';
import OnboardingView from './features/onboarding/OnboardingView';
import DashboardView from './features/dashboard/DashboardView';
import UploadView from './features/upload/UploadView';
import ExplanationView from './features/explanation/ExplanationView';
import QuizView from './features/quiz/QuizView';
import ParentView from './features/parent/ParentView';

// Inner component to access Redux selectors safely
const MainAppContent: React.FC = () => {
  const activeScreen = useAppSelector((state) => state.app.activeScreen);
import { hydrateSession, setLoading } from './store/slices/appSlice';
import { getSession, toUserState } from './services/api';

// Inner component to access Redux selectors safely
const MainAppContent: React.FC = () => {
  const dispatch = useAppDispatch();
  const activeScreen = useAppSelector((state) => state.app.activeScreen);
  const loading = useAppSelector((state) => state.app.loading);

  useEffect(() => {
    let cancelled = false;

    const bootstrapSession = async () => {
      dispatch(setLoading(true));
      try {
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
    };
  }, [dispatch]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-amberLight via-white to-brand-blueLight font-nunito">
        <div className="bg-white/90 backdrop-blur rounded-3xl border border-white shadow-xl px-6 py-5 text-center max-w-sm mx-4">
          <div className="w-12 h-12 rounded-full bg-brand-orange text-white flex items-center justify-center mx-auto mb-3 text-2xl shadow-[0_4px_0_#C84B1E]">
            ✨
          </div>
          <h1 className="text-lg font-black text-gray-800">Loading Vidya AI</h1>
          <p className="text-sm text-gray-500 font-semibold mt-1">Connecting to your backend session...</p>
        </div>
      </div>
    );
  }

  // Screen 1 is the Onboarding / Landing page (takes full screen without sidebar)
  if (activeScreen === 1) {
    return <OnboardingView />;
  }

  const renderActiveScreen = () => {
    switch (activeScreen) {
      case 0:
        return <DashboardView />;
      case 2:
        return <UploadView />;
      case 3:
        return <ExplanationView />;
      case 4:
        return <QuizView />;
      case 5:
        return <ParentView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <DashboardLayout>
      {renderActiveScreen()}
    </DashboardLayout>
  );
};

export const App: React.FC = () => {
  return (
    <Provider store={store}>
      <MainAppContent />
    </Provider>
  );
};

export default App;
