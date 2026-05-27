import React from 'react';
import { useAppDispatch, useAppSelector } from '../../store';
import { setActiveScreen, setLoggedIn } from '../../store/slices/appSlice';
import { 
  Home, 
  Camera, 
  BrainCircuit, 
  Zap, 
  Users, 
  HelpCircle, 
  LogOut 
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, setIsOpen }) => {
  const dispatch = useAppDispatch();
  const activeScreen = useAppSelector((state) => state.app.activeScreen);

  const menuItems = [
    { name: 'Dashboard', icon: Home, screen: 0 },
    { name: 'Scan Homework', icon: Camera, screen: 2 },
    { name: 'Explanation', icon: BrainCircuit, screen: 3 },
    { name: 'Daily Quiz', icon: Zap, screen: 4 },
    { name: 'Parent View', icon: Users, screen: 5 },
    { name: 'Intro Tour', icon: HelpCircle, screen: 1 },
  ];

  const handleNav = (screen: number) => {
    dispatch(setActiveScreen(screen));
    setIsOpen(false); // Close sidebar on mobile after clicking
  };

  const handleLogout = () => {
    dispatch(setLoggedIn(false));
    dispatch(setActiveScreen(1)); // return to onboarding
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
        fixed inset-y-0 left-0 w-64 bg-white border-r border-gray-150 z-40
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
            const isActive = activeScreen === item.screen;
            return (
              <button
                key={item.name}
                onClick={() => handleNav(item.screen)}
                className={`
                  w-full flex items-center gap-3 px-4 py-3 rounded-xl font-nunito font-extrabold text-sm transition-all duration-150
                  ${isActive 
                    ? 'bg-brand-orange text-white shadow-sm' 
                    : 'text-gray-500 hover:text-brand-orange hover:bg-orange-50/55'
                  }
                `}
              >
                <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                <span>{item.name}</span>
              </button>
            );
          })}
        </nav>

        {/* Footer Actions */}
        <div className="p-4 border-t border-gray-100 shrink-0">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-nunito font-extrabold text-sm text-red-500 hover:bg-red-50/80 transition-all duration-150"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
