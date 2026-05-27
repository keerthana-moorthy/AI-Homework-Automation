import React from 'react';

interface ActionCardProps {
  emoji: string;
  label: string;
  subtext: string;
  cardType: 'orange' | 'purple' | 'green' | 'blue';
  onClick?: () => void;
}

export const ActionCard: React.FC<ActionCardProps> = ({
  emoji,
  label,
  subtext,
  cardType,
  onClick,
}) => {
  const styles = {
    orange: 'bg-orange-50/70 border-brand-amberBorder hover:bg-orange-50 hover:shadow-orange-100',
    purple: 'bg-purple-50/70 border-brand-purpleBorder hover:bg-purple-50 hover:shadow-purple-100',
    green: 'bg-green-50/70 border-brand-greenBorder hover:bg-green-50 hover:shadow-green-100',
    blue: 'bg-blue-50/70 border-brand-blueBorder hover:bg-blue-50 hover:shadow-blue-100',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full border-2 rounded-2xl p-4 text-center cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-md active:translate-y-0 ${styles[cardType]}`}
    >
      <div className="text-3xl mb-1.5 select-none">{emoji}</div>
      <div className="text-sm font-extrabold text-gray-800 leading-tight">{label}</div>
      <div className="text-[11px] text-gray-500 font-semibold mt-0.5">{subtext}</div>
    </button>
  );
};

export default ActionCard;
