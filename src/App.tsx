import React from 'react';
import { Provider } from 'react-redux';
import store, { useAppSelector } from './store';
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
