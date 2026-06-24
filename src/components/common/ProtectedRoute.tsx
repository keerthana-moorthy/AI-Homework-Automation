import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store';
import { setShowAuthModal, setAuthModalContext } from '../../store/slices/appSlice';

interface ProtectedRouteProps {
  children: React.ReactNode;
  context: 'scan' | 'quiz' | 'studyplan';
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, context }) => {
  const isAuthenticated = useAppSelector((state) => state.app.isAuthenticated);
  const dispatch = useAppDispatch();

  if (!isAuthenticated) {
    // Trigger auth modal with the correct contextual prompt
    dispatch(setAuthModalContext(context));
    dispatch(setShowAuthModal(true));
    // Redirect unauthenticated deep-link attempts to /dashboard
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
