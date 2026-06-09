import React from 'react';
import AIResponseRenderer from './AIResponseRenderer';

interface StepCardProps {
  stepNum: number;
  title: string;
  desc: string;
}

export const StepCard: React.FC<StepCardProps> = ({
  stepNum,
  title,
  desc,
}) => {
  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex gap-3.5 items-start">
      <div className="w-7 h-7 rounded-full bg-brand-purple text-white text-sm font-black flex items-center justify-center shrink-0 select-none">
        {stepNum}
      </div>
      <div className="font-nunito flex-1">
        <div className="text-sm font-extrabold text-gray-800 mb-2">{title}</div>
        <AIResponseRenderer content={desc} className="text-xs text-gray-600 font-semibold leading-relaxed" />
      </div>
    </div>
  );
};

export default StepCard;
