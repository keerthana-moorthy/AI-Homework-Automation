import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'math' | 'sci' | 'eng' | 'tam' | 'hist' | 'default' | 'white';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  className = '',
}) => {
  const styles = {
    math: 'bg-[#E8F4FF] text-[#1565C0] border border-[#90CAF9] rounded-full px-3 py-1 text-xs font-extrabold',
    sci: 'bg-[#E8F8EC] text-[#2E7D32] border border-[#A5D6A7] rounded-full px-3 py-1 text-xs font-extrabold',
    eng: 'bg-[#FFF0E8] text-[#E64A19] border border-[#FFAB91] rounded-full px-3 py-1 text-xs font-extrabold',
    tam: 'bg-[#F0ECFF] text-[#5E35B1] border border-[#CE93D8] rounded-full px-3 py-1 text-xs font-extrabold',
    hist: 'bg-[#FFF8E1] text-[#F57F17] border border-[#FFE082] rounded-full px-3 py-1 text-xs font-extrabold',
    default: 'bg-gray-100 text-gray-700 border border-gray-200 rounded-full px-3 py-1 text-xs font-extrabold',
    white: 'bg-white/25 text-white border-none rounded-lg px-2.5 py-1 text-xs font-extrabold',
  };

  return (
    <span className={`${styles[variant]} inline-flex items-center gap-1 select-none ${className}`}>
      {children}
    </span>
  );
};

export default Badge;
