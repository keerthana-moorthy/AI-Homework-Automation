import React, { useEffect, useRef, useState } from 'react';
import { useAppDispatch } from '../../store';
import { setActiveScreen } from '../../store/slices/appSlice';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import StepCard from '../../components/common/StepCard';
import {
  getQuiz,
  getExplanation,
  resolveBackendUrl,
  updateScreen,
  type ExplanationPayload,
} from '../../services/api';
import ExplanationChatPanel from './ExplanationChatPanel';

const getSubjectVariant = (subjectId?: string) => {
  switch ((subjectId ?? '').toLowerCase()) {
    case 'science':
      return 'sci';
    case 'english':
      return 'eng';
    case 'tamil':
      return 'tam';
    case 'history':
      return 'hist';
    case 'maths':
      return 'math';
    case 'handwritten':
    case 'pending':
    case 'unknown':
    default:
      return 'default';
  }
};

const getScanLabel = (scanMethod?: string, sourceType?: string) => {
  const normalizedMethod = scanMethod?.toLowerCase();
  const normalizedSource = sourceType?.toLowerCase();

  if (normalizedSource?.includes('handwritten')) {
    return 'Handwritten scan';
  }
  if (normalizedMethod === 'pdf-text' || normalizedSource?.includes('pdf')) {
    return 'PDF OCR';
  }
  if (normalizedMethod === 'groq-vision') {
    return 'Vision scan';
  }
  if (normalizedMethod === 'easyocr' || normalizedSource?.includes('image')) {
    return 'Image scan';
  }
  return 'Uploaded text';
};

const isPdfPreview = (fileType?: string, fileName?: string) => {
  return fileType === 'application/pdf' || Boolean(fileName?.toLowerCase().endsWith('.pdf'));
};

const isImagePreview = (fileType?: string) => {
  return Boolean(fileType?.startsWith('image/'));
};

export const ExplanationView: React.FC = () => {
  const dispatch = useAppDispatch();
  const [explanation, setExplanation] = useState<ExplanationPayload | null>(null);
  const chatSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    const storedAnalysisId =
      typeof window !== 'undefined' ? window.sessionStorage.getItem('vidya-latest-analysis-id') : null;
    const parsedAnalysisId = storedAnalysisId ? Number(storedAnalysisId) : NaN;
    const analysisId = Number.isFinite(parsedAnalysisId) ? parsedAnalysisId : null;

    const loadExplanation = async () => {
      try {
        const response = await getExplanation(analysisId);
        if (!mounted) return;
        setExplanation(response);
      } catch (error) {
        console.error('Unable to load explanation', error);
      }
    };

    void loadExplanation();

    return () => {
      mounted = false;
    };
  }, []);

  const handleNavigate = async (screen: number) => {
    if (screen === 4) {
      try {
        await getQuiz();
      } catch (error) {
        console.error('Unable to prepare quiz', error);
      }
    }

    dispatch(setActiveScreen(screen));
    void updateScreen(screen).catch((error) => {
      console.error('Unable to persist screen change', error);
    });
  };

  const focusChatBot = () => {
    chatSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const subjectVariant = getSubjectVariant(explanation?.subject?.id);
  const steps = explanation?.steps?.length ? explanation.steps : [];
  const scanLabel = getScanLabel(explanation?.scanMethod, explanation?.sourceType);
  const fileUrl = resolveBackendUrl(explanation?.fileUrl);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-gradient-to-br from-brand-purple to-[#9B7ABF] text-white p-5 rounded-3xl shadow-sm">
        <div className="flex items-center gap-3">
          <Button variant="back" onClick={() => void handleNavigate(2)} />
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <Badge variant={subjectVariant as any}>{explanation?.subject?.name ?? 'Homework'}</Badge>
              <Badge variant="white">{scanLabel}</Badge>
              {explanation?.pageCount ? <Badge variant="white">{explanation.pageCount} page(s)</Badge> : null}
            </div>
            <h3 className="text-base md:text-lg font-black leading-tight">Scanned Homework Explanation</h3>
            <p className="text-[11px] text-white/80 font-bold">
              {explanation?.fileName ? `Source file: ${explanation.fileName}` : 'The uploaded question is ready for detailed review.'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-brand-purpleLight border-l-4 border-brand-purple rounded-2xl p-5 shadow-sm">
            <span className="text-[10px] font-black text-brand-purple uppercase tracking-wider select-none">
              Scanned Question
            </span>
            <h4 className="text-base font-extrabold text-gray-800 mt-1.5 leading-relaxed">
              {explanation?.question ?? 'Upload a handwritten or scanned question to see it here.'}
            </h4>
            {explanation?.extractedText ? (
              <div className="mt-4 bg-white/80 rounded-xl p-4 border border-white/70">
                <div className="text-[10px] font-black text-gray-500 uppercase tracking-wider mb-2">Extracted text</div>
                <p className="text-sm text-gray-700 font-semibold leading-6 whitespace-pre-line">
                  {explanation.extractedText}
                </p>
              </div>
            ) : null}
          </div>

          <div className="bg-gradient-to-r from-brand-green to-[#66BB6A] rounded-2xl p-6 text-white text-center shadow-md relative overflow-hidden">
            <div className="relative z-10 select-none">
              <span className="text-xs font-black text-white/85 uppercase tracking-wider">Final Answer</span>
              <h2 className="text-3xl font-black mt-1">{explanation?.finalAnswer ?? 'Waiting for OCR and analysis'}</h2>
            </div>
            <div className="absolute right-0 bottom-0 w-24 h-24 bg-white/5 rounded-full blur-xl pointer-events-none" />
          </div>

          {explanation?.fileUrl ? (
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-black text-gray-800">Source Preview</h4>
                  <p className="text-xs text-gray-500 font-semibold">{explanation.fileType ?? 'Uploaded homework file'}</p>
                </div>
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-black text-brand-purple hover:underline"
                >
                  Open file
                </a>
              </div>

              {isImagePreview(explanation.fileType) ? (
                <img
                  src={fileUrl}
                  alt={explanation.fileName ?? 'Scanned homework'}
                  className="w-full max-h-[360px] object-contain rounded-xl border border-gray-100 bg-gray-50"
                />
              ) : isPdfPreview(explanation.fileType, explanation.fileName) ? (
                <iframe
                  title="Scanned homework PDF"
                  src={fileUrl}
                  className="w-full h-[360px] rounded-xl border border-gray-100 bg-gray-50"
                />
              ) : (
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600 font-semibold">
                  The uploaded file is available at the source link above.
                </div>
              )}
            </div>
          ) : null}

          {explanation?.summary ? (
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-2">
              <h4 className="text-sm font-black text-gray-800">Scan Summary</h4>
              <p className="text-sm text-gray-600 font-semibold leading-6 whitespace-pre-line">{explanation.summary}</p>
            </div>
          ) : null}
        </div>

        <div className="lg:col-span-7 space-y-5">
          <div>
            <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3">
              How to Solve
            </h4>

            {steps.length > 0 ? (
              <div className="space-y-3">
                {steps.map((step) => (
                  <StepCard
                    key={step.stepNum}
                    stepNum={step.stepNum}
                    title={step.title}
                    desc={step.desc}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-4 text-sm font-semibold text-gray-600">
                Upload a clear handwritten image or PDF and the step-by-step explanation will appear here.
              </div>
            )}
          </div>

          {explanation?.detailedExplanation ? (
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-2">
              <h4 className="text-sm font-black text-gray-800">Detailed Explanation</h4>
              <p className="text-sm text-gray-600 font-semibold leading-7 whitespace-pre-line">
                {explanation.detailedExplanation}
              </p>
            </div>
          ) : null}

          <div ref={chatSectionRef}>
            <ExplanationChatPanel explanation={explanation} />
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t border-gray-100">
            <Button
              variant="primary"
              onClick={focusChatBot}
              className="flex-1"
            >
              Ask the bot about this
            </Button>
            <Button
              variant="secondary"
              onClick={() => void handleNavigate(4)}
              className="flex-1"
            >
              Take a quiz on this topic
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExplanationView;
