import React from 'react';

interface ProgressBarProps {
  progress: number; // 0 to 100
  color?: 'orange' | 'purple' | 'green' | 'blue' | 'white';
  height?: number; // height in pixels
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  color = 'orange',
  height = 8,
  className = '',
}) => {
  const bgStyles = {
    orange: 'bg-brand-orange',
    purple: 'bg-brand-purple',
    green: 'bg-brand-green',
    blue: 'bg-brand-blue',
    white: 'bg-white',
  };

  const trackBg = color === 'white' ? 'bg-white/30' : 'bg-gray-100';

  return (
    <div 
      className={`w-full rounded-full overflow-hidden ${trackBg} ${className}`}
      style={{ height: `${height}px` }}
    >
      <div
        className={`h-full rounded-full transition-all duration-300 ${bgStyles[color]}`}
        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
      />
    </div>
  );
};

export default ProgressBar;
