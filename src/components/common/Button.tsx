import React from 'react';

interface ButtonProps {
  children?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'back' | 'green' | 'blue';
  onClick?: () => void;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  onClick,
  className = '',
  type = 'button',
  disabled = false,
}) => {
  const baseStyle =
    'font-nunito transition-all duration-100 flex items-center justify-center select-none disabled:opacity-50 disabled:cursor-not-allowed';

  if (variant === 'back') {
    return (
      <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        className={`w-8 h-8 rounded-lg bg-white/25 flex items-center justify-center text-white font-black text-base cursor-pointer border-none hover:bg-white/40 active:scale-95 ${className}`}
        aria-label="Go back"
      >
        {children || '<'}
      </button>
    );
  }

  const styles = {
    primary:
      'bg-brand-orange hover:bg-brand-orangeHover text-white border-none rounded-[14px] py-3.5 px-6 text-base font-black cursor-pointer shadow-[0_4px_0_#C84B1E] active:translate-y-[2px] active:shadow-[0_2px_0_#C84B1E]',
    secondary:
      'bg-transparent hover:bg-brand-orange/5 text-brand-orange border-2 border-brand-orange rounded-[14px] py-3 px-6 text-sm font-extrabold cursor-pointer active:scale-[0.98]',
    green:
      'bg-brand-green hover:bg-brand-greenDark text-white border-none rounded-[14px] py-3.5 px-6 text-base font-black cursor-pointer shadow-[0_4px_0_#2E7D32] active:translate-y-[2px] active:shadow-[0_2px_0_#2E7D32]',
    blue:
      'bg-brand-blue hover:bg-brand-blueDark text-white border-none rounded-[14px] py-3.5 px-6 text-base font-black cursor-pointer shadow-[0_4px_0_#1565C0] active:translate-y-[2px] active:shadow-[0_2px_0_#1565C0]',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyle} ${styles[variant as keyof typeof styles]} ${className}`}
    >
      {children}
    </button>
  );
};

export default Button;
