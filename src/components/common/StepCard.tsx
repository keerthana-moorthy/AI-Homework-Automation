import React from 'react';

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
      <div className="font-nunito">
        <div className="text-sm font-extrabold text-gray-800 mb-0.5">{title}</div>
        <div className="text-[12px] text-gray-500 font-semibold leading-relaxed">{desc}</div>
      </div>
    </div>
  );
};

export default StepCard;
