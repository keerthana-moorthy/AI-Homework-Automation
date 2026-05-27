import React from 'react';
import { useAppDispatch } from '../../store';
import { setActiveScreen } from '../../store/slices/appSlice';
import { EXPLANATION_STEPS } from '../../constants/mockData';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import StepCard from '../../components/common/StepCard';

export const ExplanationView: React.FC = () => {
  const dispatch = useAppDispatch();

  return (
    <div className="space-y-6">
      
      {/* Explanation Header */}
      <div className="flex items-center justify-between bg-gradient-to-br from-brand-purple to-[#9B7ABF] text-white p-5 rounded-3xl shadow-sm">
        <div className="flex items-center gap-3">
          <Button variant="back" onClick={() => dispatch(setActiveScreen(2))}>←</Button>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <Badge variant="white">📐 Algebra</Badge>
              <span className="text-[10px] text-white/80 font-black uppercase tracking-wider">Auto-Detected</span>
            </div>
            <h3 className="text-base md:text-lg font-black leading-tight">Step-by-Step Explanation</h3>
            <p className="text-[11px] text-white/80 font-bold">AI analysed your question in 2 seconds ✨</p>
          </div>
        </div>
      </div>

      {/* Double Column Web Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Question Details & Final Answer */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* Question Box */}
          <div className="bg-brand-purpleLight border-l-4 border-brand-purple rounded-2xl p-5 shadow-sm">
            <span className="text-[10px] font-black text-brand-purple uppercase tracking-wider select-none">
              Your Scanned Question
            </span>
            <h4 className="text-base font-extrabold text-gray-800 mt-1.5 leading-relaxed">
              Solve for x: 3x + 7 = 22
            </h4>
          </div>

          {/* Final Answer Banner */}
          <div className="bg-gradient-to-r from-brand-green to-[#66BB6A] rounded-2xl p-6 text-white text-center shadow-md relative overflow-hidden">
            <div className="relative z-10 select-none">
              <span className="text-xs font-black text-white/85 uppercase tracking-wider">
                ✅ Final Answer
              </span>
              <h2 className="text-3xl font-black mt-1">x = 5</h2>
            </div>
            <div className="absolute right-0 bottom-0 w-24 h-24 bg-white/5 rounded-full blur-xl pointer-events-none" />
          </div>

        </div>

        {/* Right Column: Steps & Action CTA */}
        <div className="lg:col-span-7 space-y-5">
          <div>
            <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3">
              How to Solve
            </h4>
            
            {/* Step list mapping */}
            <div className="space-y-3">
              {EXPLANATION_STEPS.map((step) => (
                <StepCard
                  key={step.stepNum}
                  stepNum={step.stepNum}
                  title={step.title}
                  desc={step.desc}
                />
              ))}
            </div>
          </div>

          {/* Engagement CTA */}
          <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t border-gray-150">
            <Button 
              variant="primary" 
              onClick={() => dispatch(setActiveScreen(0))} 
              className="flex-1"
            >
              💬 Ask a doubt about this
            </Button>
            <Button 
              variant="secondary" 
              onClick={() => dispatch(setActiveScreen(4))} 
              className="flex-1"
            >
              ⚡ Take a quiz on this topic
            </Button>
          </div>

        </div>

      </div>

    </div>
  );
};

export default ExplanationView;
