import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  hydrateSession,
  setIsAuthenticated,
  setShowAuthModal,
  setAuthModalContext,
} from '../../store/slices/appSlice';
import {
  Home,
  Camera,
  TrendingUp,
  Zap,
  LogOut,
  MessageSquare,
  Calendar,
  Lock,
} from 'lucide-react';
import { logout as logoutSession, toUserState, updateScreen } from '../../services/api';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

// Screens that require authentication
const PROTECTED_SCREENS: Record<number, 'scan' | 'quiz' | 'studyplan'> = {
  2: 'scan',
  4: 'quiz',
  7: 'studyplan',
};

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, setIsOpen }) => {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const navigate = useNavigate();
  const isAuthenticated = useAppSelector((state) => state.app.isAuthenticated);
  const user = useAppSelector((state) => state.app.user);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const menuItems = [
    { name: 'Dashboard', icon: Home, path: '/dashboard', screen: 0 },
    { name: 'Scan Homework', icon: Camera, path: '/scan-homework', screen: 2 },
    { name: 'AI Tutor', icon: MessageSquare, path: '/ai-tutor', screen: 6 },
    { name: 'Study Plan', icon: Calendar, path: '/study-plan', screen: 7 },
    { name: 'Daily Quiz', icon: Zap, path: '/daily-quiz', screen: 4 },
    { name: 'My Progress', icon: TrendingUp, path: '/my-progress', screen: 5 },
  ];

  const isActiveItem = (path: string) => {
    const currentPath = location.pathname;
    if (path === '/dashboard') {
      return currentPath === '/dashboard' || currentPath === '/';
    }
    if (path === '/scan-homework') {
      return currentPath.startsWith('/scan-homework') || currentPath.startsWith('/explanation');
    }
    if (path === '/ai-tutor') {
      return currentPath.startsWith('/ai-tutor');
    }
    if (path === '/study-plan') {
      return currentPath.startsWith('/study-plan');
    }
    if (path === '/daily-quiz') {
      return currentPath.startsWith('/daily-quiz') || currentPath.startsWith('/quiz');
    }
    if (path === '/my-progress') {
      return currentPath.startsWith('/my-progress');
    }
    return false;
  };

  const handleNav = (item: typeof menuItems[0]) => {
    const protectedContext = PROTECTED_SCREENS[item.screen];

    // Gate: show auth modal instead of navigating if not authenticated
    if (protectedContext && !isAuthenticated) {
      dispatch(setAuthModalContext(protectedContext));
      dispatch(setShowAuthModal(true));
      setIsOpen(false);
      return;
    }

    navigate(item.path);
    void updateScreen(item.screen).catch((error) => {
      console.error('Unable to persist screen change', error);
    });
    setIsOpen(false);
  };

  const handleLogout = async () => {
    setIsSigningOut(true);
    try {
      const response = await logoutSession();
      dispatch(
        hydrateSession({
          loggedIn: response.session.loggedIn,
          activeScreen: response.session.activeScreen,
          language: response.session.language,
          selectedSubjectId: response.session.selectedSubjectId,
          user: toUserState(response.user),
        })
      );
      dispatch(setIsAuthenticated(false));
      navigate('/');
      setIsOpen(false);
    } catch (error) {
      console.error('Unable to sign out', error);
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside className={`
        fixed inset-y-0 left-0 w-64 bg-white border-r border-gray-100 z-40
        transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:h-screen flex flex-col
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Brand Mascot */}
        <div className="h-16 border-b border-gray-100 flex items-center gap-3 px-6 shrink-0 select-none">
          <div className="w-9 h-9 rounded-full bg-brand-orange text-white flex items-center justify-center text-xl shadow-[0_3px_0_#C84B1E]">
            🤖
          </div>
          <div>
            <h1 className="font-nunito font-black text-lg text-gray-800 leading-none">Vidya AI</h1>
            <p className="font-nunito text-[10px] text-gray-500 font-extrabold mt-0.5 uppercase tracking-wider">Study Buddy</p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = isActiveItem(item.path);
            const isLocked = !!PROTECTED_SCREENS[item.screen] && !isAuthenticated;

            return (
              <button
                key={item.name}
                onClick={() => handleNav(item)}
                title={isLocked ? `Sign in to access ${item.name}` : item.name}
                className={`
                  w-full flex items-center gap-3 px-4 py-3 rounded-xl font-nunito font-extrabold text-sm transition-all duration-150
                  ${isActive
                    ? 'bg-brand-orange text-white shadow-sm'
                    : 'text-gray-500 hover:text-brand-orange hover:bg-orange-50/55'
                  }
                `}
              >
                <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                <span className="flex-1 text-left">{item.name}</span>
                {isLocked && (
                  <Lock className="w-3.5 h-3.5 shrink-0 text-gray-300" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer Actions */}
        <div className="p-4 border-t border-gray-100 shrink-0">
          {/* User Profile Card */}
          {isAuthenticated && user && (
            <div className="flex items-center gap-3 p-3 bg-gray-50/80 rounded-2xl border border-gray-100/60 mb-2">
              <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-xl select-none shadow-sm">
                {user.avatar || '🧑'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-nunito font-black text-sm text-gray-800 truncate">{user.name}</p>
                <p className="font-nunito font-bold text-[11px] text-gray-400 truncate">{user.className}</p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {/* Auth status indicator */}
            {!isAuthenticated && (
              <button
                onClick={() => {
                  dispatch(setAuthModalContext('timer'));
                  dispatch(setShowAuthModal(true));
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-nunito font-black text-xs text-brand-orange bg-orange-50 hover:bg-orange-100 transition-all border border-orange-100 cursor-pointer outline-none"
              >
                <Lock className="w-4 h-4 shrink-0" />
                <span>Sign In / Sign Up</span>
              </button>
            )}
            {isAuthenticated && (
              <button
                onClick={handleLogout}
                disabled={isSigningOut}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-nunito font-extrabold text-sm text-red-500 hover:bg-red-50/80 transition-all duration-150"
              >
                <LogOut className="w-5 h-5 shrink-0" />
                <span>{isSigningOut ? 'Signing out...' : 'Sign Out'}</span>
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
