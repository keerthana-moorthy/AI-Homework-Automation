import React, { useEffect, useRef, useState } from 'react';
import { useAppDispatch } from '../../store';
import { setActiveScreen, setUser } from '../../store/slices/appSlice';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import StepCard from '../../components/common/StepCard';
import AIResponseRenderer, { ensureOcrStructuredMarkdown } from '../../components/common/AIResponseRenderer';
import {
  getQuiz,
  answerQuiz,
  nextQuiz,
  resetQuiz,
  toUserState,
  getExplanation,
  resolveBackendUrl,
  updateScreen,
  type ExplanationPayload,
} from '../../services/api';
import ExplanationChatPanel from './ExplanationChatPanel';
import VisualLearningContainer, { VisualLearningLoading } from './VisualLearningWidgets';
import ProgressBar from '../../components/common/ProgressBar';

import { 
  BookOpen, 
  Image as ImageIcon, 
  FileText, 
  Award, 
  Copy, 
  Check, 
  Download, 
  Sparkles, 
  HelpCircle,
  RefreshCw,
  Plus,
  Bookmark
} from 'lucide-react';

const getSubjectVariant = (subjectId?: string) => {
  const normalized = (subjectId ?? '').toLowerCase().trim();
  switch (normalized) {
    case 'science':
      return 'sci';
    case 'english':
      return 'eng';
    case 'tamil':
      return 'tam';
    case 'history':
      return 'hist';
    case 'maths':
    case 'mathematics':
      return 'math';
    case 'geography':
      return 'geo';
    case 'general_knowledge':
    case 'general knowledge':
      return 'gk';
    case 'other':
      return 'other';
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
  const [explanationLoading, setExplanationLoading] = useState<boolean>(true);
  const chatSectionRef = useRef<HTMLDivElement>(null);

  // Tab State — read override from sessionStorage set by dashboard Visuals button
  const [activeTab, setActiveTab] = useState<'explanation' | 'visual' | 'notes' | 'quiz'>(() => {
    if (typeof window !== 'undefined') {
      const override = window.sessionStorage.getItem('vidya-open-tab');
      if (override === 'visual') return 'visual';
    }
    return 'explanation';
  });

  // Study Notes Personal notebook scratchpad state
  const [personalNotes, setPersonalNotes] = useState<string>('');
  const [isCopied, setIsCopied] = useState<boolean>(false);

  // Embedded Quiz state
  const [quizData, setQuizData] = useState<any | null>(null);
  const [quizLoading, setQuizLoading] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    const storedAnalysisId =
      typeof window !== 'undefined' ? window.sessionStorage.getItem('vidya-latest-analysis-id') : null;
    const parsedAnalysisId = storedAnalysisId ? Number(storedAnalysisId) : NaN;
    const analysisId = Number.isFinite(parsedAnalysisId) ? parsedAnalysisId : null;

    const loadExplanation = async () => {
      try {
        setExplanationLoading(true);
        const response = await getExplanation(analysisId);
        if (!mounted) return;
        setExplanation(response);

        // Clear the tab override flag after consuming it
        if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem('vidya-open-tab');
        }

        // Load personal notes from local storage if available
        if (response.analysisId) {
          const saved = localStorage.getItem(`vidya_notes_${response.analysisId}`);
          setPersonalNotes(saved || '');
        }
      } catch (error) {
        console.error('Unable to load explanation', error);
      } finally {
        if (mounted) setExplanationLoading(false);
      }
    };

    void loadExplanation();

    return () => {
      mounted = false;
    };
  }, []);

  // Sync quiz data if tab changes to Quiz
  useEffect(() => {
    if (activeTab === 'quiz' && !quizData) {
      void fetchEmbeddedQuiz();
    }
  }, [activeTab]);

  const fetchEmbeddedQuiz = async () => {
    setQuizLoading(true);
    try {
      const response = await getQuiz();
      setQuizData(response);
    } catch (error) {
      console.error('Unable to load quiz', error);
    } finally {
      setQuizLoading(false);
    }
  };

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
    setActiveTab('explanation');
    setTimeout(() => {
      chatSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  // Personal notes change handler
  const handleNotesChange = (text: string) => {
    setPersonalNotes(text);
    if (explanation?.analysisId) {
      localStorage.setItem(`vidya_notes_${explanation.analysisId}`, text);
    }
  };

  // Copy Notes summary action
  const handleCopyNotes = () => {
    if (!explanation) return;
    const studyNotes = explanation.studyNotes;
    
    let textToCopy = `=== STUDY REVISION GUIDE: ${explanation.question.substring(0, 50)} ===\n\n`;
    if (studyNotes) {
      textToCopy += `Summary Notes:\n${studyNotes.summaryMarkdown || ''}\n\n`;
      textToCopy += `Key Concepts:\n${(studyNotes.keyConcepts || []).map((c: string) => `- ${c}`).join('\n')}\n\n`;
      textToCopy += `Vocabulary Definitions:\n${(studyNotes.keyVocabulary || []).map((v: any) => `- ${v.term}: ${v.definition}`).join('\n')}\n\n`;
    }
    if (personalNotes) {
      textToCopy += `My Personal Notes:\n${personalNotes}\n`;
    }

    navigator.clipboard.writeText(textToCopy).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }).catch(err => {
      console.error('Failed to copy text: ', err);
    });
  };

  // Download Study Guide text file
  const handleDownloadNotes = () => {
    if (!explanation) return;
    const studyNotes = explanation.studyNotes;
    
    let fileContent = `=== STUDY REVISION GUIDE: ${explanation.question} ===\n\n`;
    if (studyNotes) {
      fileContent += `SUMMARY NOTES\n=============\n${studyNotes.summaryMarkdown || ''}\n\n`;
      fileContent += `KEY CONCEPTS\n============\n${(studyNotes.keyConcepts || []).map((c: string) => `• ${c}`).join('\n')}\n\n`;
      fileContent += `VOCABULARY BUILDER\n==================\n${(studyNotes.keyVocabulary || []).map((v: any) => `• ${v.term}: ${v.definition}`).join('\n')}\n\n`;
      fileContent += `CORE FACTS & FORMULAS\n=====================\n${(studyNotes.formulasOrFacts || []).map((f: string) => `• ${f}`).join('\n')}\n\n`;
    }
    if (personalNotes) {
      fileContent += `MY PERSONAL STUDY NOTES\n=======================\n${personalNotes}\n`;
    }

    const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Study_Guide_Analysis_${explanation.analysisId || 'Notes'}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Mini Quiz Option click handler
  const handleQuizOptionClick = async (option: string) => {
    if (!quizData || quizData.status !== 'idle') return;
    try {
      const response = await answerQuiz(option);
      setQuizData(response.quiz);
      dispatch(setUser(toUserState(response.user)));
    } catch (error) {
      console.error('Unable to submit quiz answer', error);
    }
  };

  const handleQuizNext = async () => {
    try {
      const response = await nextQuiz();
      setQuizData(response.quiz);
    } catch (error) {
      console.error('Unable to advance quiz', error);
    }
  };

  const handleQuizReset = async () => {
    try {
      const response = await resetQuiz();
      setQuizData(response.quiz);
    } catch (error) {
      console.error('Unable to reset quiz', error);
    }
  };

  const subjectVariant = getSubjectVariant(explanation?.subject?.id as string);
  const steps = explanation?.steps?.length ? explanation.steps : [];
  const scanLabel = getScanLabel(explanation?.scanMethod, explanation?.sourceType);
  const fileUrl = resolveBackendUrl(explanation?.fileUrl);

  return (
    <div className="space-y-6 font-nunito">
      {/* Full-page loading skeleton while explanation is fetching */}
      {explanationLoading && (
        <div className="space-y-5 animate-pulse">
          <div className="h-20 bg-gradient-to-r from-purple-100 to-purple-50 rounded-3xl" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 space-y-4">
              <div className="h-40 bg-gray-100 rounded-2xl" />
              <div className="h-16 bg-green-100 rounded-2xl" />
            </div>
            <div className="lg:col-span-7 space-y-4">
              <div className="h-14 bg-gray-100 rounded-2xl" />
              <div className="h-64 bg-white border border-gray-100 rounded-3xl flex items-center justify-center">
                <div className="text-center space-y-2">
                  <div className="w-10 h-10 border-4 border-brand-purple border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs font-extrabold text-gray-400">Loading explanation…</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {!explanationLoading && (
      <>
      <div className="flex items-center justify-between bg-gradient-to-br from-brand-purple to-[#9B7ABF] text-white p-5 rounded-3xl shadow-sm">
        <div className="flex items-center gap-3">
          <Button variant="back" onClick={() => void handleNavigate(2)} />
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <Badge variant={subjectVariant as any}>
                {explanation?.subject?.emoji ? `${explanation.subject.emoji} ` : ''}
                {(explanation?.subject?.name as string) ?? 'Homework'}
              </Badge>
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
        {/* Left Column: Fixed Reference Content */}
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
                <div className="text-[10px] font-black text-gray-500 uppercase tracking-wider mb-2">Study Breakdown</div>
                <div className="text-sm font-semibold leading-6 text-gray-700">
                  <AIResponseRenderer content={ensureOcrStructuredMarkdown(explanation.extractedText)} />
                </div>
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
              <AIResponseRenderer content={explanation.summary} />
            </div>
          ) : null}
        </div>

        {/* Right Column: Tabbed Dynamic Learning Workspace */}
        <div className="lg:col-span-7 space-y-5">
          {/* Tab Selector Buttons */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-gray-100/80 rounded-2xl select-none">
            <button
              onClick={() => setActiveTab('explanation')}
              className={`flex-1 min-w-[90px] flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black transition-all cursor-pointer border-none outline-none active:scale-95
                ${activeTab === 'explanation'
                  ? 'bg-brand-purple text-white shadow-sm font-extrabold'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-white/40'
                }`}
            >
              <span>📖</span> Explanation
            </button>
            <button
              onClick={() => setActiveTab('visual')}
              className={`flex-1 min-w-[90px] flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black transition-all cursor-pointer border-none outline-none active:scale-95
                ${activeTab === 'visual'
                  ? 'bg-brand-orange text-white shadow-sm font-extrabold'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-white/40'
                }`}
            >
              <span>🖼</span> Visual Learning
            </button>
            <button
              onClick={() => setActiveTab('notes')}
              className={`flex-1 min-w-[90px] flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black transition-all cursor-pointer border-none outline-none active:scale-95
                ${activeTab === 'notes'
                  ? 'bg-brand-blue text-white shadow-sm font-extrabold'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-white/40'
                }`}
            >
              <span>📝</span> Notes
            </button>
            <button
              onClick={() => setActiveTab('quiz')}
              className={`flex-1 min-w-[90px] flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black transition-all cursor-pointer border-none outline-none active:scale-95
                ${activeTab === 'quiz'
                  ? 'bg-brand-green text-white shadow-sm font-extrabold'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-white/40'
                }`}
            >
              <span>🎯</span> Quiz
            </button>
          </div>

          {/* Tab Content Display */}
          <div className="min-h-[400px]">
            {/* 1. EXPLANATION TAB */}
            {activeTab === 'explanation' && (
              <div className="space-y-5 animate-[fadeIn_0.15s_ease-out]">
                <div>
                  <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3 select-none">
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

                {explanation?.detailedExplanation && (
                  <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-2">
                    <h4 className="text-sm font-black text-gray-800 flex items-center gap-1.5 select-none">
                      <BookOpen size={16} className="text-brand-purple" />
                      Detailed Explanation
                    </h4>
                    <AIResponseRenderer content={explanation.detailedExplanation} />
                  </div>
                )}

                <div ref={chatSectionRef}>
                  <ExplanationChatPanel explanation={explanation} />
                </div>
              </div>
            )}

            {/* 2. VISUAL LEARNING TAB */}
            {activeTab === 'visual' && (
              <div className="animate-[fadeIn_0.15s_ease-out]">
                {explanation?.visualLearning ? (
                  <VisualLearningContainer data={explanation.visualLearning} />
                ) : (
                  <VisualLearningLoading />
                )}
              </div>
            )}

            {/* 3. NOTES TAB */}
            {activeTab === 'notes' && (
              <div className="space-y-5 animate-[fadeIn_0.15s_ease-out]">
                {explanation?.studyNotes ? (
                  <>
                    {/* Summary Notes Card */}
                    <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-3 relative overflow-hidden">
                      <div className="flex items-center justify-between border-b border-gray-50 pb-2.5">
                        <h4 className="text-sm font-black text-gray-800 flex items-center gap-1.5 select-none">
                          <FileText size={16} className="text-brand-blue" />
                          Revision Summary Notes
                        </h4>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={handleCopyNotes}
                            className={`p-1.5 rounded-lg border text-xs font-bold transition flex items-center gap-1 select-none cursor-pointer
                              ${isCopied 
                                ? 'bg-brand-greenLight border-brand-green text-brand-greenDark' 
                                : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                              }`}
                          >
                            {isCopied ? <Check size={13} /> : <Copy size={13} />}
                            {isCopied ? 'Copied!' : 'Copy'}
                          </button>
                          <button
                            onClick={handleDownloadNotes}
                            className="p-1.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-500 text-xs font-bold transition flex items-center gap-1 select-none cursor-pointer"
                          >
                            <Download size={13} /> Save Guide
                          </button>
                        </div>
                      </div>
                      <div className="text-xs leading-relaxed text-gray-600 font-semibold select-text">
                        <AIResponseRenderer content={explanation.studyNotes.summaryMarkdown} />
                      </div>
                    </div>

                    {/* Key Concepts Bullet Points */}
                    <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-3">
                      <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider select-none">Key Learning Concepts</h4>
                      <div className="grid grid-cols-1 gap-2.5">
                        {explanation.studyNotes.keyConcepts?.map((concept: string, idx: number) => (
                          <div key={idx} className="flex items-start gap-2.5 bg-gray-50/40 border border-gray-100/50 p-3 rounded-xl">
                            <span className="text-xs select-none">💡</span>
                            <p className="text-xs text-gray-700 font-semibold leading-relaxed">{concept}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Vocabulary builder and Quick Facts */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Vocabulary Definitions */}
                      <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-3">
                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider select-none">Vocabulary Builder</h4>
                        <div className="space-y-3.5">
                          {explanation.studyNotes.keyVocabulary?.map((voc: any, idx: number) => (
                            <div key={idx} className="space-y-0.5 border-b border-gray-50 pb-2.5 last:border-0 last:pb-0 select-text">
                              <div className="font-extrabold text-xs text-brand-blueDark flex items-center gap-1">
                                <Bookmark size={10} className="fill-brand-blue/30" />
                                {voc.term}
                              </div>
                              <div className="text-[11px] text-gray-500 font-bold leading-normal">{voc.definition}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Formulas or facts */}
                      <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-3">
                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider select-none">Core Rules & Facts</h4>
                        <ul className="space-y-2.5 list-none pl-0 m-0">
                          {explanation.studyNotes.formulasOrFacts?.map((fact: string, idx: number) => (
                            <li key={idx} className="flex items-start gap-2 text-xs text-gray-600 font-semibold leading-normal">
                              <span className="text-[9px] text-brand-blue mt-1 shrink-0 select-none">◆</span>
                              <span>{fact}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Personal Notes Notepad Scratchpad */}
                    <div className="bg-brand-blueLight/20 border-2 border-brand-blueBorder/40 rounded-3xl p-5 shadow-sm space-y-3">
                      <div>
                        <h4 className="text-xs font-black text-brand-blueDark uppercase tracking-wider select-none">✏️ Student Scratchpad Notebook</h4>
                        <p className="text-[10px] text-gray-500 font-semibold mt-0.5">Type personal learnings or notes here. Your notes auto-save locally!</p>
                      </div>
                      <textarea
                        value={personalNotes}
                        onChange={(e) => handleNotesChange(e.target.value)}
                        placeholder="Write down definitions, equations, calculations or list key ideas you want to remember..."
                        className="w-full h-32 p-3 bg-white border border-gray-100 rounded-xl text-xs font-semibold focus:outline-none focus:border-brand-blue text-gray-700 leading-relaxed shadow-inner"
                      />
                    </div>
                  </>
                ) : (
                  <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm text-center">
                    <div className="text-gray-400 text-sm">No notes available.</div>
                  </div>
                )}
              </div>
            )}

            {/* 4. QUIZ TAB */}
            {activeTab === 'quiz' && (
              <div className="animate-[fadeIn_0.15s_ease-out]">
                {quizLoading ? (
                  <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm text-center space-y-3">
                    <div className="w-10 h-10 rounded-full bg-brand-green/10 text-brand-green flex items-center justify-center mx-auto text-lg animate-spin-slow">
                      🔄
                    </div>
                    <h4 className="font-extrabold text-sm text-gray-700">Preparing Quiz...</h4>
                  </div>
                ) : quizData?.currentQuestion ? (
                  <div className="bg-white border border-gray-100 shadow-sm rounded-3xl p-6 space-y-5">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                      <div>
                        <h4 className="text-sm font-black text-gray-800 flex items-center gap-1.5">
                          <Award size={16} className="text-brand-green" />
                          Topic Quick Quiz
                        </h4>
                        <p className="text-[10px] text-gray-500 font-semibold mt-0.5">Question {quizData.currentIndex + 1} of {quizData.questions.length}</p>
                      </div>
                      <button
                        onClick={handleQuizReset}
                        className="p-1 px-3 border border-gray-200 bg-gray-50 hover:bg-gray-100 text-[10px] font-black text-gray-500 rounded-full cursor-pointer select-none transition active:scale-95"
                      >
                        Reset Quiz 🔄
                      </button>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1">
                      <ProgressBar progress={quizData.progressPercent} color="green" height={8} />
                    </div>

                    {/* Question */}
                    <div className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100/50">
                      <h5 className="font-extrabold text-xs md:text-sm text-gray-800 leading-relaxed text-center">
                        {quizData.currentQuestion.question}
                      </h5>
                    </div>

                    {/* Options list */}
                    <div className="grid grid-cols-1 gap-2.5">
                      {quizData.currentQuestion.options.map((option: string) => {
                        const isSelected = quizData.selectedOption === option;
                        const isCorrectOption = option === quizData.currentQuestion.correctOption;
                        const status = quizData.status;

                        let borderClass = 'border-gray-200 hover:border-brand-green hover:bg-brand-greenLight/20 text-gray-700 bg-white';
                        if (status !== 'idle') {
                          if (isCorrectOption) {
                            borderClass = 'bg-green-50 border-brand-green text-brand-greenDark font-extrabold';
                          } else if (isSelected && status === 'wrong') {
                            borderClass = 'bg-red-50 border-red-400 text-red-700 font-extrabold';
                          } else {
                            borderClass = 'border-gray-100 bg-gray-50/50 text-gray-400 opacity-60';
                          }
                        }

                        return (
                          <button
                            key={option}
                            onClick={() => void handleQuizOptionClick(option)}
                            disabled={status !== 'idle'}
                            className={`w-full text-left font-nunito font-semibold text-xs px-4 py-3.5 rounded-xl border-2 outline-none cursor-pointer transition flex items-center justify-between
                              ${borderClass}`}
                          >
                            <span>{option}</span>
                            {status !== 'idle' && (
                              <>
                                {isCorrectOption && <span className="text-sm select-none">✅</span>}
                                {isSelected && !isCorrectOption && <span className="text-sm select-none">❌</span>}
                              </>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* AI explanation of question results */}
                    {quizData.status !== 'idle' && quizData.toastMessage && (
                      <div className="bg-brand-orange text-white p-4 rounded-xl text-xs space-y-1 shadow-sm animate-[slideUp_0.15s_ease-out]">
                        <div className="font-black text-[10px] uppercase tracking-wider flex items-center gap-1">
                          <span>💡</span> Quick AI Feedback
                        </div>
                        <AIResponseRenderer content={quizData.toastMessage} className="text-white font-black" />
                      </div>
                    )}

                    {/* Next action button */}
                    {quizData.status !== 'idle' && (
                      <div className="flex justify-end pt-2">
                        <Button
                          variant="green"
                          onClick={quizData.currentIndex < quizData.questions.length - 1 ? handleQuizNext : handleQuizReset}
                          className="px-8"
                        >
                          {quizData.currentIndex < quizData.questions.length - 1 ? 'Next Question →' : 'Complete Quiz 🔄'}
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-white border border-gray-100 shadow-sm rounded-3xl p-8 text-center space-y-3">
                    <div className="text-4xl select-none">🎯</div>
                    <h4 className="font-extrabold text-sm text-gray-700">Quiz Completed!</h4>
                    <p className="text-xs text-gray-500 font-semibold">Great work practicing this topic.</p>
                    <Button variant="green" onClick={handleQuizReset} className="mx-auto mt-2">
                      Restart Quiz
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tab switching footer helper shortcuts */}
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
              onClick={() => setActiveTab('quiz')}
              className="flex-1"
            >
              Take a quiz on this topic
            </Button>
          </div>
        </div>
      </div>
      </> )} {/* end !explanationLoading */}
    </div>
  );
};

export default ExplanationView;
