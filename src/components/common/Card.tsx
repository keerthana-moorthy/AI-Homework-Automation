import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  border?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  onClick,
  border = true,
}) => {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-2xl p-4 transition-all duration-200 
        ${border ? 'border border-gray-100 shadow-sm' : ''} 
        ${onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 active:translate-y-0' : ''} 
        ${className}`}
    >
      {children}
    </div>
  );
};

export default Card;
