import React, { useRef, useState } from 'react';

interface FormUploadZoneProps {
  value: File | null;
  onChange: (file: File | null) => void;
  error?: string;
  className?: string;
}

export const FormUploadZone: React.FC<FormUploadZoneProps> = ({
  value,
  onChange,
  error,
  className = '',
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onChange(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onChange(e.target.files[0]);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  const removeFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={handleFileChange}
      />

      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={onButtonClick}
        className={`
          border-3 border-dashed rounded-[20px] py-10 px-6 text-center cursor-pointer transition-all duration-200 select-none
          ${isDragActive 
            ? 'border-brand-orange bg-brand-orange/5 scale-[1.01]' 
            : 'border-brand-amber bg-[#FFF8F0] hover:bg-orange-50/40'
          }
          ${error ? 'border-red-400 bg-red-50/5' : ''}
        `}
        style={{ borderWidth: '3px' }}
      >
        {value ? (
          <div className="flex flex-col items-center">
            <span className="text-4xl mb-2">📄</span>
            <div className="text-sm font-black text-gray-800 max-w-[240px] truncate">{value.name}</div>
            <div className="text-xs text-gray-500 font-extrabold mt-1">
              {((value.size || 0) / 1024 / 1024).toFixed(2)} MB
            </div>
            <button 
              onClick={removeFile}
              className="mt-4 px-3 py-1 bg-red-50 text-red-500 rounded-full text-xs font-black hover:bg-red-100 transition-colors border-none"
            >
              Remove file
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <span className="text-5xl mb-2.5 select-none">📷</span>
            <div className="text-[15px] font-black text-gray-800 mb-1">Tap to take a photo</div>
            <div className="text-xs text-gray-500 font-bold">or drag your homework here (Image/PDF)</div>
          </div>
        )}
      </div>

      {error && (
        <span className="text-xs text-red-500 font-extrabold flex items-center gap-1.5 pl-1 animate-pulse">
          ⚠️ {error}
        </span>
      )}
    </div>
  );
};

export default FormUploadZone;
