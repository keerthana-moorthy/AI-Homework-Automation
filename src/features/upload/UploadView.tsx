import React, { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { useAppDispatch, useAppSelector } from '../../store';
import { hydrateSession, setActiveScreen, setSelectedSubjectId } from '../../store/slices/appSlice';
import Button from '../../components/common/Button';
import FormTextArea from '../../components/form/FormTextArea';
import FormUploadZone from '../../components/form/FormUploadZone';
import Badge from '../../components/common/Badge';
import {
  analyzeHomework,
  fileToBase64,
  getSession,
  toUserState,
  updateScreen,
  updateSubject,
} from '../../services/api';

const uploadSchema = yup.object({
  language: yup.string().required('Language preference is required'),
  subject: yup.string().required('Subject selection is required'),
  inputMethod: yup.mixed<'upload' | 'type' | 'voice'>().oneOf(['upload', 'type', 'voice']).required(),
  questionText: yup.string().when('inputMethod', {
    is: 'type',
    then: (schema) => schema.trim().required('Please type your question text before analyzing'),
    otherwise: (schema) => schema.notRequired(),
  }),
  voiceText: yup.string().when('inputMethod', {
    is: 'voice',
    then: (schema) => schema.trim().required('Please paste the voice transcript before analyzing'),
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
  inputMethod: 'upload' | 'type' | 'voice';
  questionText: string;
  voiceText: string;
  uploadedFile: File | null;
}

export const UploadView: React.FC = () => {
  const dispatch = useAppDispatch();
  const selectedSubjectId = useAppSelector((state) => state.app.selectedSubjectId ?? 'maths');
  const [selectedMethod, setSelectedMethod] = useState<'upload' | 'type' | 'voice'>('upload');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, handleSubmit, control, setValue, resetField, formState: { errors } } = useForm<UploadFormValues>({
    resolver: yupResolver(uploadSchema) as any,
    defaultValues: {
      language: 'en',
      subject: selectedSubjectId ?? 'maths',
      inputMethod: 'upload',
      questionText: '',
      voiceText: '',
      uploadedFile: null,
    },
  });

  useEffect(() => {
    setValue('subject', selectedSubjectId ?? 'maths');
  }, [selectedSubjectId, setValue]);

  const handleMethodChange = (method: 'upload' | 'type' | 'voice') => {
    setSelectedMethod(method);
    setValue('inputMethod', method);

    if (method !== 'upload') {
      resetField('uploadedFile');
    }
    if (method !== 'type') {
      setValue('questionText', '');
    }
    if (method !== 'voice') {
      setValue('voiceText', '');
    }
  };

  const syncSubjectSelection = async (subjectId: string) => {
    try {
      const response = await updateSubject(subjectId);
      dispatch(
        hydrateSession({
          loggedIn: response.session.loggedIn,
          activeScreen: response.session.activeScreen,
          language: response.session.language,
          selectedSubjectId: response.session.selectedSubjectId,
          user: toUserState(response.user),
        })
      );
    } catch (error) {
      console.error('Unable to persist subject selection', error);
    }
  };

  const onSubmit = async (data: UploadFormValues) => {
    setIsSubmitting(true);
    try {
      const questionText = (data.questionText || data.voiceText || '').trim();
      const payload: {
        questionText?: string;
        inputMethod: string;
        subject: string;
        language: 'en' | 'ta' | 'both';
        transcript?: string;
        fileName?: string;
        fileType?: string;
        fileDataBase64?: string;
        notes?: string;
        ocrText?: string;
      } = {
        questionText: questionText || undefined,
        inputMethod: selectedMethod,
        subject: data.subject,
        language: data.language as 'en' | 'ta' | 'both',
      };

      if (selectedMethod === 'voice') {
        payload.transcript = questionText;
      }

      if (selectedMethod === 'upload' && data.uploadedFile) {
        const filePayload = await fileToBase64(data.uploadedFile);
        payload.fileName = filePayload.fileName;
        payload.fileType = filePayload.fileType;
        payload.fileDataBase64 = filePayload.fileDataBase64;
      }

      if (selectedMethod === 'type') {
        payload.notes = questionText;
      }

      const response = await analyzeHomework(payload);
      console.log('Analysis response:', response);

      if (typeof window !== 'undefined' && typeof response.analysisId === 'number') {
        window.sessionStorage.setItem('vidya-latest-analysis-id', String(response.analysisId));
      }

      await updateScreen(3);
      dispatch(setActiveScreen(3));

      const sessionResponse = await getSession();
      dispatch(
        hydrateSession({
          loggedIn: sessionResponse.session.loggedIn,
          activeScreen: sessionResponse.session.activeScreen,
          language: sessionResponse.session.language,
          selectedSubjectId: sessionResponse.session.selectedSubjectId,
          user: toUserState(sessionResponse.user),
        })
      );
    } catch (error) {
      console.error('Unable to analyze homework', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const subjects = [
    { id: 'maths', name: 'Maths', emoji: '📐', variant: 'math' },
    { id: 'science', name: 'Science', emoji: '🔬', variant: 'sci' },
    { id: 'english', name: 'English', emoji: '📖', variant: 'eng' },
    { id: 'tamil', name: 'Tamil', emoji: 'அ', variant: 'tam' },
  ];

  const uploadOptions = [
    { id: 'upload', emoji: '🖼️', label: 'Upload File / Gallery' },
    { id: 'type', emoji: '⌨️', label: 'Type Question' },
    { id: 'pdf', emoji: '📄', label: 'Upload PDF' },
    { id: 'voice', emoji: '🎤', label: 'Voice Input' },
  ];

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="flex items-center gap-3 bg-brand-orange text-white p-5 rounded-3xl shadow-sm">
        <Button variant="back" onClick={() => dispatch(setActiveScreen(0))}>←</Button>
        <div>
          <h3 className="text-base md:text-lg font-black">Scan & Upload Homework</h3>
          <p className="text-[11px] text-white/80 font-bold">Upload your question to get instant step-by-step solutions</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-6">
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
                        onClick={() => {
                          field.onChange(sub.id);
                          dispatch(setSelectedSubjectId(sub.id));
                          void syncSubjectSelection(sub.id);
                        }}
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

          <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-3">
            <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider select-none">
              Other ways to add
            </h4>

            <div className="grid grid-cols-2 gap-2">
              {uploadOptions.map((opt) => {
                const isActive = (opt.id === 'upload' && selectedMethod === 'upload') || 
                                 (opt.id === 'pdf' && selectedMethod === 'upload') ||
                                 (opt.id === 'type' && selectedMethod === 'type') ||
                                 (opt.id === 'voice' && selectedMethod === 'voice');

                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      if (opt.id === 'upload' || opt.id === 'pdf') {
                        handleMethodChange('upload');
                      } else if (opt.id === 'type') {
                        handleMethodChange('type');
                      } else {
                        handleMethodChange('voice');
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
                  </button>
                );
              })}
            </div>
          </div>
        </div>

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
            ) : selectedMethod === 'type' ? (
              <FormTextArea
                label="Type your question below"
                name="questionText"
                placeholder="Example: Solve for x: 3x + 7 = 22"
                register={register('questionText')}
                error={errors.questionText?.message}
              />
            ) : (
              <FormTextArea
                label="Voice transcript"
                name="voiceText"
                placeholder="Paste or type what you said to the assistant"
                register={register('voiceText')}
                error={errors.voiceText?.message}
              />
            )}
          </div>

          <div className="mt-6 border-t border-gray-100 pt-4 flex justify-end">
            <Button 
              type="submit" 
              variant="primary"
              className="w-full sm:w-auto sm:px-12"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Analyzing...' : 'Analyze Question ✨'}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
};

export default UploadView;
