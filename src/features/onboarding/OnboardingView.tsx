import React from 'react';
import { useAppDispatch } from '../../store';
import { setActiveScreen, setLoggedIn } from '../../store/slices/appSlice';
import { ONBOARDING_FEATURES } from '../../constants/mockData';
import Button from '../../components/common/Button';

export const OnboardingView: React.FC = () => {
  const dispatch = useAppDispatch();

  const handleStart = () => {
    dispatch(setLoggedIn(true));
    dispatch(setActiveScreen(0)); // go to dashboard
  };

  // Helper to resolve colored icon backgrounds from design
  const getIconBg = (type: string) => {
    switch (type) {
      case 'o': return 'bg-orange-50 text-brand-orange';
      case 'p': return 'bg-purple-50 text-brand-purple';
      case 'g': return 'bg-green-50 text-brand-green';
      case 'b': return 'bg-blue-50 text-brand-blue';
      default: return 'bg-gray-50';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50/50 flex items-center justify-center p-4 md:p-8 font-nunito">
      <div className="bg-white max-w-4xl w-full rounded-3xl shadow-xl border border-gray-100 overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[560px]">
        
        {/* Left Side: Brand Mascot Gradient Banner */}
        <div className="md:col-span-5 bg-gradient-to-br from-brand-orange via-orange-400 to-brand-amber text-white p-8 md:p-12 flex flex-col justify-center items-center text-center">
          <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center text-5xl shadow-lg mb-6 select-none animate-bounce">
            🤖
          </div>
          <h2 className="text-2xl md:text-3xl font-black leading-tight mb-3">
            Meet Vidya, your AI study buddy!
          </h2>
          <p className="text-sm text-white/90 font-bold max-w-xs">
            Homework made easy • English & Tamil
          </p>
          <div className="mt-8 flex gap-2 flex-wrap justify-center">
            <span className="bg-white/20 px-3 py-1 rounded-full text-xs font-bold border border-white/20">தமிழ்</span>
            <span className="bg-white/20 px-3 py-1 rounded-full text-xs font-bold border border-white/20">English</span>
          </div>
        </div>

        {/* Right Side: Features List & Actions */}
        <div className="md:col-span-7 p-8 md:p-12 flex flex-col justify-between">
          <div>
            <h3 className="text-gray-400 text-xs font-black uppercase tracking-wider mb-6">
              Platform Features
            </h3>
            
            {/* Features 2x2 Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              {ONBOARDING_FEATURES.map((feat) => (
                <div 
                  key={feat.id} 
                  className="flex items-start gap-3.5 p-4 rounded-2xl border border-gray-100 bg-gray-50/40"
                >
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 ${getIconBg(feat.colorType)}`}>
                    {feat.emoji}
                  </div>
                  <div>
                    <h4 className="text-sm font-extrabold text-gray-800 leading-tight">{feat.label}</h4>
                    <p className="text-[11px] text-gray-500 font-semibold mt-0.5">{feat.subtext}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <Button 
              variant="primary" 
              onClick={handleStart} 
              className="w-full"
            >
              Let's Start! 🚀
            </Button>
            <Button 
              variant="secondary" 
              onClick={handleStart} 
              className="w-full"
            >
              I already have an account
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default OnboardingView;
