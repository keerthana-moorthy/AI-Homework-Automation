import React, { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { useAppDispatch } from '../../store';
import { setActiveScreen } from '../../store/slices/appSlice';
import Button from '../../components/common/Button';
import FormTextArea from '../../components/form/FormTextArea';
import FormUploadZone from '../../components/form/FormUploadZone';
import Badge from '../../components/common/Badge';

// validation schema definition
const uploadSchema = yup.object().shape({
  language: yup.string().required('Language preference is required'),
  subject: yup.string().required('Subject selection is required'),
  inputMethod: yup.string().required(),
  questionText: yup.string().when('inputMethod', {
    is: 'type',
    then: (schema) => schema.required('Please type your question text before analyzing'),
    otherwise: (schema) => schema.notRequired(),
  }),
  uploadedFile: yup.mixed().when('inputMethod', {
    is: 'upload',
    then: (schema) => schema.required('Please select or upload a homework file'),
    otherwise: (schema) => schema.notRequired(),
  }),
});

interface UploadFormValues {
  language: string;
  subject: string;
  inputMethod: string;
  questionText?: string;
  uploadedFile?: any; // File | null
}

export const UploadView: React.FC = () => {
  const dispatch = useAppDispatch();
  const [selectedMethod, setSelectedMethod] = useState<'upload' | 'type'>('upload');

  const { register, handleSubmit, control, setValue, formState: { errors } } = useForm<UploadFormValues>({
    resolver: yupResolver(uploadSchema) as any,
    defaultValues: {
      language: 'en',
      subject: 'maths',
      inputMethod: 'upload',
      questionText: '',
      uploadedFile: null,
    }
  });



  const onSubmit = (data: UploadFormValues) => {
    console.log('Form data submitted:', data);
    // Transition to Screen 3 (Step-by-Step Explanation)
    dispatch(setActiveScreen(3));
  };

  const handleMethodChange = (method: 'upload' | 'type') => {
    setSelectedMethod(method);
    setValue('inputMethod', method);
  };

  const subjects = [
    { id: 'maths', name: 'Maths', emoji: '📐', variant: 'math' },
    { id: 'science', name: 'Science', emoji: '🔬', variant: 'sci' },
    { id: 'english', name: 'English', emoji: '📖', variant: 'eng' },
    { id: 'tamil', name: 'Tamil', emoji: '🅰', variant: 'tam' },
  ];

  const uploadOptions = [
    { id: 'upload', emoji: '🖼️', label: 'Upload File / Gallery' },
    { id: 'type', emoji: '⌨️', label: 'Type Question' },
    { id: 'pdf', emoji: '📄', label: 'Upload PDF' },
    { id: 'voice', emoji: '🎤', label: 'Voice Input' },
  ];

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      
      {/* Page Header */}
      <div className="flex items-center gap-3 bg-brand-orange text-white p-5 rounded-3xl shadow-sm">
        <Button variant="back" onClick={() => dispatch(setActiveScreen(0))}>←</Button>
        <div>
          <h3 className="text-base md:text-lg font-black">Scan & Upload Homework</h3>
          <p className="text-[11px] text-white/80 font-bold">Upload your question to get instant step-by-step solutions</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Metadata & Options */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Language Toggle */}
          <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-3">
            <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider select-none">
              Language / மொழி
            </h4>
            
            <Controller
              name="language"
              control={control}
              render={({ field }) => (
                <div className="flex rounded-2xl overflow-hidden border-2 border-gray-100 bg-gray-50/50 p-1">
                  {(['en', 'ta', 'both'] as const).map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => field.onChange(lang)}
                      className={`
                        flex-1 py-2 text-center text-xs font-black rounded-xl transition-all duration-150 border-none cursor-pointer
                        ${field.value === lang 
                          ? 'bg-brand-orange text-white shadow-sm' 
                          : 'bg-transparent text-gray-500 hover:text-brand-orange'
                        }
                      `}
                    >
                      {lang === 'en' ? 'English' : lang === 'ta' ? 'தமிழ்' : 'Both'}
                    </button>
                  ))}
                </div>
              )}
            />
          </div>

          {/* Subject Auto-detector / Selector */}
          <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-3">
            <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider select-none">
              Subject (Select to refine)
            </h4>
            
            <Controller
              name="subject"
              control={control}
              render={({ field }) => (
                <div className="flex gap-2 flex-wrap">
                  {subjects.map((sub) => {
                    const isSelected = field.value === sub.id;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => field.onChange(sub.id)}
                        className="bg-transparent border-none p-0 cursor-pointer outline-none"
                      >
                        <Badge 
                          variant={sub.variant as any}
                          className={`
                            py-1.5 px-4 transition-all duration-150 border-2
                            ${isSelected 
                              ? 'scale-105 shadow-sm border-brand-purple' 
                              : 'opacity-65 border-transparent hover:opacity-100'
                            }
                          `}
                        >
                          {sub.emoji} {sub.name}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              )}
            />
          </div>

          {/* Upload Method Picker */}
          <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-3">
            <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider select-none">
              Other ways to add
            </h4>
            
            <div className="grid grid-cols-2 gap-2">
              {uploadOptions.map((opt) => {
                const isActive = (opt.id === 'upload' && selectedMethod === 'upload') || 
                                 (opt.id === 'type' && selectedMethod === 'type');
                
                return (
                  <div
                    key={opt.id}
                    onClick={() => {
                      if (opt.id === 'upload' || opt.id === 'type') {
                        handleMethodChange(opt.id);
                      } else {
                        alert(`${opt.label} interface will open in production release!`);
                      }
                    }}
                    className={`
                      p-3 rounded-2xl border-2 text-center cursor-pointer transition-all duration-150 select-none
                      ${isActive 
                        ? 'border-brand-purple bg-brand-purpleLight text-brand-purple font-extrabold' 
                        : 'border-gray-100 hover:border-gray-200 text-gray-600 font-semibold'
                      }
                    `}
                  >
                    <div className="text-xl mb-1">{opt.emoji}</div>
                    <div className="text-[10px] leading-tight">{opt.label}</div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Right Column: Work Area */}
        <div className="lg:col-span-8 bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex flex-col justify-between min-h-[400px]">
          
          <div className="space-y-4">
            <h4 className="text-sm font-black text-gray-800 border-b border-gray-100 pb-2">
              Workspace Source File
            </h4>
            
            {selectedMethod === 'upload' ? (
              <Controller
                name="uploadedFile"
                control={control}
                render={({ field, fieldState }) => (
                  <FormUploadZone
                    value={field.value}
                    onChange={field.onChange}
                    error={fieldState.error?.message}
                  />
                )}
              />
            ) : (
              <FormTextArea
                label="Type your question below"
                name="questionText"
                placeholder="Example: Solve for x: 3x + 7 = 22"
                register={register('questionText')}
                error={errors.questionText?.message}
              />
            )}
          </div>

          {/* Submit Action */}
          <div className="mt-6 border-t border-gray-100 pt-4 flex justify-end">
            <Button 
              type="submit" 
              variant="primary"
              className="w-full sm:w-auto sm:px-12"
            >
              Analyze Question ✨
            </Button>
          </div>

        </div>

      </div>

    </form>
  );
};

export default UploadView;
