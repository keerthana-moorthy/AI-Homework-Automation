import React, { useEffect, useState, useRef } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { useAppDispatch, useAppSelector } from '../../store';
import { hydrateSession, setSelectedSubjectId } from '../../store/slices/appSlice';
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
import AIResponseRenderer, { ensureOcrStructuredMarkdown } from '../../components/common/AIResponseRenderer';

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
  const navigate = useNavigate();
  const selectedSubjectId = useAppSelector((state) => state.app.selectedSubjectId ?? 'maths');
  const [selectedMethod, setSelectedMethod] = useState<'upload' | 'type' | 'voice'>('upload');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ocrStage, setOcrStage] = useState<'idle' | 'uploading' | 'extracting' | 'streaming' | 'complete'>('idle');
  const [ocrTextStreamed, setOcrTextStreamed] = useState('');
  const [countdown, setCountdown] = useState(3);
  const [pendingResponse, setPendingResponse] = useState<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const completeAnalysis = async (response: any) => {
    if (typeof window !== 'undefined' && typeof response.analysisId === 'number') {
      window.sessionStorage.setItem('vidya-latest-analysis-id', String(response.analysisId));
    }

    await updateScreen(3);
    navigate(`/explanation/${response.analysisId}`);

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
  };


  useEffect(() => {
    if (ocrStage !== 'complete') return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          void completeAnalysis(pendingResponse);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [ocrStage, pendingResponse]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [ocrTextStreamed, ocrStage]);

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

      if (selectedMethod === 'upload' && data.uploadedFile) {
        setOcrStage('uploading');
        
        await new Promise((resolve) => setTimeout(resolve, 1200));
        
        setOcrStage('extracting');
        const response = await analyzeHomework(payload);
        setPendingResponse(response);
        
        setOcrStage('streaming');
        const rawText = response.extractedText || response.questionText || 'No text extracted from document.';
        const textToStream = ensureOcrStructuredMarkdown(rawText);
        
        let index = 0;
        const tokens = textToStream.split(/(\s+)/);
        setOcrTextStreamed('');
        
        const streamInterval = setInterval(() => {
          if (index >= tokens.length) {
            clearInterval(streamInterval);
            setOcrStage('complete');
            return;
          }
          setOcrTextStreamed((prev) => prev + tokens[index]);
          index++;
        }, 20);
      } else {
        const response = await analyzeHomework(payload);
        await completeAnalysis(response);
      }
    } catch (error) {
      console.error('Unable to analyze homework', error);
      setOcrStage('idle');
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
        <Button variant="back" onClick={() => navigate('/dashboard')}>←</Button>
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

        <div className="lg:col-span-8 bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex flex-col justify-between min-h-[450px]">
          {ocrStage === 'idle' ? (
            <>
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
                    placeholder="Type your handwritten question or paste the OCR text here"
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
            </>
          ) : (
            <div className="flex flex-col h-full flex-1 justify-between space-y-4 animate-[fadeIn_0.2s_ease-out]">
              <div className="border-b border-gray-100 pb-2 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-black text-gray-800">
                    Live OCR Text Extraction
                  </h4>
                  <p className="text-[10px] font-semibold text-gray-500 mt-0.5">
                    Vidya AI is processing your scanned document in real-time.
                  </p>
                </div>
                <Badge
                  variant={
                    ocrStage === 'complete'
                      ? 'sci'
                      : ocrStage === 'streaming'
                      ? 'math'
                      : 'default'
                  }
                  className="font-bold text-[10px] uppercase shrink-0 py-0.5 px-2.5 border"
                >
                  {ocrStage === 'uploading' && '📤 Uploading...'}
                  {ocrStage === 'extracting' && '🔬 Extracting...'}
                  {ocrStage === 'streaming' && '⚡ Streaming...'}
                  {ocrStage === 'complete' && '✓ Completed'}
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-extrabold select-none">
                <div
                  className={`p-2 rounded-xl transition ${
                    ocrStage === 'uploading'
                      ? 'bg-brand-purpleLight text-brand-purple border border-brand-purpleBorder'
                      : 'bg-green-50 text-brand-greenDark border border-brand-greenBorder'
                  }`}
                >
                  1. Uploading Image
                </div>
                <div
                  className={`p-2 rounded-xl transition ${
                    ocrStage === 'extracting'
                      ? 'bg-brand-purpleLight text-brand-purple border border-brand-purpleBorder'
                      : ocrStage === 'streaming' || ocrStage === 'complete'
                      ? 'bg-green-50 text-brand-greenDark border border-brand-greenBorder'
                      : 'bg-gray-50 text-gray-400 border border-transparent'
                  }`}
                >
                  2. Extracting Text
                </div>
                <div
                  className={`p-2 rounded-xl transition ${
                    ocrStage === 'streaming'
                      ? 'bg-brand-purpleLight text-brand-purple border border-brand-purpleBorder'
                      : ocrStage === 'complete'
                      ? 'bg-green-50 text-brand-greenDark border border-brand-greenBorder'
                      : 'bg-gray-50 text-gray-400 border border-transparent'
                  }`}
                >
                  3. Streaming Results
                </div>
              </div>

              <div
                ref={scrollRef}
                className="bg-gray-50 text-gray-805 border border-gray-200 font-mono text-xs leading-relaxed p-4 rounded-2xl overflow-y-auto min-h-[220px] max-h-[260px] flex-1 shadow-inner relative whitespace-pre-wrap select-text"
              >
                {ocrStage === 'uploading' && (
                  <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 font-nunito space-y-2 py-8">
                    <span className="text-3xl animate-bounce">📤</span>
                    <span className="font-extrabold text-sm text-gray-500">Uploading file...</span>
                    <span className="text-[10px] text-gray-400">Sending source data to analysis server</span>
                  </div>
                )}

                {ocrStage === 'extracting' && (
                  <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 font-nunito space-y-2 py-8">
                    <span className="text-3xl animate-spin">🔬</span>
                    <span className="font-extrabold text-sm text-gray-500">Extracting Text (OCR)...</span>
                    <span className="text-[10px] text-gray-400">Running advanced vision models on document</span>
                  </div>
                )}

                {(ocrStage === 'streaming' || ocrStage === 'complete') && (
                  <div className="space-y-1 pr-1 font-nunito">
                    <AIResponseRenderer content={ocrTextStreamed} />
                    {ocrStage === 'streaming' && (
                      <span className="inline-block w-2.5 h-4 bg-brand-purple animate-pulse align-middle ml-1 rounded-[1px]" />
                    )}
                  </div>
                )}
              </div>

              <div className="border-t border-gray-100 pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                <div className="text-xs font-semibold text-gray-500">
                  {ocrStage === 'complete' ? (
                    <span className="text-brand-greenDark font-bold flex items-center gap-1.5 animate-pulse">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block animate-ping" />
                      OCR Extraction Complete! Redirecting in {countdown}s...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-brand-purple animate-ping shrink-0" />
                      Do not close this page during analysis
                    </span>
                  )}
                </div>

                <Button
                  type="button"
                  variant="primary"
                  className="w-full sm:w-auto px-10 shrink-0"
                  disabled={ocrStage !== 'complete'}
                  onClick={() => void completeAnalysis(pendingResponse)}
                >
                  View Explanation →
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </form>
  );
};

export default UploadView;
