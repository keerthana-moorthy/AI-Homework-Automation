import React from 'react';
import ProgressBar from './ProgressBar';

interface ProgressCardProps {
  name: string;
  emoji: string;
  progress: number;
  barColor?: 'orange' | 'purple' | 'green' | 'blue';
}

export const ProgressCard: React.FC<ProgressCardProps> = ({
  name,
  emoji,
  progress,
  barColor = 'orange',
}) => {
  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-extrabold text-gray-800 flex items-center gap-1.5 select-none">
          <span>{emoji}</span> {name}
        </span>
        <span className="text-sm font-black text-brand-orange">{progress}%</span>
      </div>
      <ProgressBar progress={progress} color={barColor} height={8} />
    </div>
  );
};

export default ProgressCard;
