import React from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';

interface FormTextAreaProps {
  label: string;
  name: string;
  register: UseFormRegisterReturn;
  error?: string;
  placeholder?: string;
  className?: string;
  rows?: number;
}

export const FormTextArea: React.FC<FormTextAreaProps> = ({
  label,
  name,
  register,
  error,
  placeholder = '',
  className = '',
  rows = 4,
}) => {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label 
        htmlFor={name} 
        className="text-xs font-black text-gray-500 uppercase tracking-wider select-none"
      >
        {label}
      </label>
      <textarea
        id={name}
        rows={rows}
        placeholder={placeholder}
        {...register}
        className={`
          w-full px-4 py-3 rounded-2xl border-2 font-nunito font-semibold text-sm outline-none transition-all duration-150
          ${error 
            ? 'border-red-400 focus:border-red-500 bg-red-50/10' 
            : 'border-gray-200 focus:border-brand-purple focus:bg-white'
          }
        `}
      />
      {error && (
        <span className="text-xs text-red-500 font-extrabold flex items-center gap-1.5 pl-1 animate-pulse">
          ⚠️ {error}
        </span>
      )}
    </div>
  );
};

export default FormTextArea;
