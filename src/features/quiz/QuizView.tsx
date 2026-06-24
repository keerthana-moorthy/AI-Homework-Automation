import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store';
import { setUser } from '../../store/slices/appSlice';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import AIResponseRenderer from '../../components/common/AIResponseRenderer';
import ProgressBar from '../../components/common/ProgressBar';
import {
  answerQuiz,
  getQuiz,
  nextQuiz,
  resetQuiz,
  toUserState,
  updateScreen,
} from '../../services/api';

export const QuizView: React.FC = () => {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.app.user);
  const emailSuffix = user?.email || 'guest';

  const keyQuizMode = `vidya_quiz_mode_${emailSuffix}`;
  const keyUserAnswers = `vidya_quiz_user_answers_${emailSuffix}`;
  const keyViewResults = `vidya_quiz_view_results_${emailSuffix}`;
  const keyReviewAnswers = `vidya_quiz_review_answers_${emailSuffix}`;

  const [quizData, setQuizData] = useState<Awaited<ReturnType<typeof getQuiz>> | null>(null);

  // Quiz Mode Selection: 'practice' | 'test'
  const [quizMode, setQuizMode] = useState<'practice' | 'test'>('practice');

  // Modal preferences states
  const [isPrefsOpen, setIsPrefsOpen] = useState(false);
  const [tempMode, setTempMode] = useState<'practice' | 'test'>('practice');

  // States to track Test Mode results screens
  const [viewResults, setViewResults] = useState<boolean>(false);
  const [reviewAnswers, setReviewAnswers] = useState<boolean>(false);

  // User answers record for the current attempt
  const [userAnswers, setUserAnswers] = useState<any[]>([]);

  useEffect(() => {
    let mounted = true;

    // Load local storage values scoped to current user
    const mode = (localStorage.getItem(keyQuizMode) === 'test' ? 'test' : 'practice') as 'practice' | 'test';
    setQuizMode(mode);
    setTempMode(mode);

    // If route matches results page, force viewResults
    const isResultRoute = window.location.pathname.endsWith('/result');
    setViewResults(isResultRoute || localStorage.getItem(keyViewResults) === 'true');
    setReviewAnswers(localStorage.getItem(keyReviewAnswers) === 'true');

    try {
      const saved = localStorage.getItem(keyUserAnswers);
      setUserAnswers(saved ? JSON.parse(saved) : []);
    } catch {
      setUserAnswers([]);
    }

    const loadQuiz = async () => {
      try {
        const response = await getQuiz();
        if (!mounted) return;
        setQuizData(response);

        // If the backend quiz has been reset (index 0, selectedOption null),
        // wipe out any stale results/answers state
        if (response.currentIndex === 0 && response.selectedOption === null) {
          setUserAnswers([]);
          setViewResults(false);
          setReviewAnswers(false);
          localStorage.removeItem(keyUserAnswers);
          localStorage.removeItem(keyViewResults);
          localStorage.removeItem(keyReviewAnswers);
          if (isResultRoute) {
            navigate('/daily-quiz', { replace: true });
          }
        }
      } catch (error) {
        console.error('Unable to load quiz', error);
      }
    };

    void loadQuiz();

    return () => {
      mounted = false;
    };
  }, [emailSuffix, navigate]);

  const currentQuestion = quizData?.currentQuestion ?? quizData?.questions?.[quizData?.currentIndex ?? 0];
  const progressPercent = quizData?.progressPercent ?? 0;

  // Check if a quiz attempt is currently in progress (answered anything or advanced)
  const isQuizInProgress = quizData && (quizData.currentIndex > 0 || quizData.selectedOption !== null) && !viewResults;

  const handleOptionClick = async (option: string) => {
    if (!quizData || quizData.status !== 'idle') return;

    try {
      const response = await answerQuiz(option);
      setQuizData(response.quiz);
      dispatch(setUser(toUserState(response.user)));

      // If in Test Mode, save the answer details in our local array
      if (quizMode === 'test') {
        const currentQ = currentQuestion;
        if (currentQ) {
          const newAnswer = {
            id: currentQ.id,
            question: currentQ.question,
            options: currentQ.options,
            selectedOption: option,
            correctOption: response.result.correctOption,
            isCorrect: response.result.correct,
            explanation: response.result.toastMessage || '',
          };
          const updatedAnswers = [...userAnswers, newAnswer];
          setUserAnswers(updatedAnswers);
          localStorage.setItem(keyUserAnswers, JSON.stringify(updatedAnswers));
        }
      }
    } catch (error) {
      console.error('Unable to submit quiz answer', error);
    }
  };

  const handleNext = async () => {
    try {
      const response = await nextQuiz();
      setQuizData(response.quiz);
    } catch (error) {
      console.error('Unable to advance quiz', error);
    }
  };

  const handleBack = () => {
    navigate('/dashboard');
  };

  const handleReset = async () => {
    try {
      const response = await resetQuiz();
      setQuizData(response.quiz);

      // Clear local states
      setUserAnswers([]);
      setViewResults(false);
      setReviewAnswers(false);
      localStorage.removeItem(keyUserAnswers);
      localStorage.removeItem(keyViewResults);
      localStorage.removeItem(keyReviewAnswers);
      navigate('/daily-quiz');
    } catch (error) {
      console.error('Unable to reset quiz', error);
    }
  };

  const handleModeSelectorClick = () => {
    setTempMode(quizMode);
    setIsPrefsOpen(true);
  };

  const handleViewResults = () => {
    setViewResults(true);
    localStorage.setItem(keyViewResults, 'true');
    navigate('/quiz/session/result');
  };


  const getOptionClass = (option: string) => {
    if (!quizData || !currentQuestion) {
      return 'border-gray-200 hover:border-brand-purple hover:bg-brand-purpleLight/40 text-gray-700 bg-white';
    }

    const isSelected = quizData.selectedOption === option;

    if (quizData.status === 'idle') {
      return 'border-gray-200 hover:border-brand-purple hover:bg-brand-purpleLight/40 text-gray-700 bg-white';
    }

    // Test Mode styles
    if (quizMode === 'test') {
      if (isSelected) {
        return 'bg-brand-purpleLight/40 border-brand-purple text-brand-purple font-extrabold shadow-sm';
      }
      return 'border-gray-100 bg-gray-50/50 text-gray-400 opacity-60';
    }

    // Practice Mode styles
    const isCorrectOption = option === currentQuestion.correctOption;
    const isWrongSelection = isSelected && option !== currentQuestion.correctOption;

    if (isCorrectOption) {
      return 'bg-green-50 border-brand-green text-brand-greenDark font-extrabold';
    }
    if (isWrongSelection) {
      return 'bg-red-50 border-red-400 text-red-700 font-extrabold';
    }

    return 'border-gray-100 bg-gray-50/50 text-gray-400 opacity-60';
  };

  // Results calculation details
  const totalQuestions = userAnswers.length;
  const correctAnswers = userAnswers.filter((ans) => ans.isCorrect).length;
  const incorrectAnswers = totalQuestions - correctAnswers;
  const accuracyPercentage = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;


  const getPerformanceSummary = (accuracy: number) => {
    if (accuracy >= 90) {
      return 'Outstanding job! You have mastered this topic.';
    } else if (accuracy >= 70) {
      return 'Excellent work! You have a strong understanding of this topic.';
    } else if (accuracy >= 50) {
      return 'Good effort! A bit more review and you will get there.';
    } else {
      return 'Keep practicing! Review the explanations to build your skills.';
    }
  };

  const performanceSummary = getPerformanceSummary(accuracyPercentage);

  if (!quizData || !currentQuestion) {
    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-br from-brand-green to-[#66BB6A] text-white p-5 rounded-3xl shadow-sm">
          <div className="flex items-center gap-3">
            <Button variant="back" onClick={handleBack}>←</Button>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <Badge variant="white">⚡ Quick Quiz</Badge>
                <span className="text-[10px] text-white/80 font-black uppercase tracking-wider">Algebra Revision</span>
              </div>
              <h3 className="text-base md:text-lg font-black leading-tight">Loading quiz...</h3>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative">
      {/* Green Header Card */}
      <div className="bg-gradient-to-br from-brand-green to-[#66BB6A] text-white p-5 rounded-3xl shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="back" onClick={handleBack}>←</Button>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <Badge variant="white">⚡ Quick Quiz</Badge>
                <span className="text-[10px] text-white/80 font-black uppercase tracking-wider">Algebra Revision</span>
              </div>
              <h3 className="text-base md:text-lg font-black leading-tight">Algebra Practice</h3>
            </div>
          </div>

          <div className="w-full md:w-64 flex flex-col items-end gap-2.5 shrink-0">
            {/* Quiz Mode Selector */}
            <button
              type="button"
              onClick={handleModeSelectorClick}
              className="flex items-center gap-1.5 bg-white/15 backdrop-blur-sm hover:bg-white/25 active:scale-95 text-white text-xs font-black px-3.5 py-2 rounded-full transition-all border border-white/10 shadow-sm cursor-pointer select-none"
            >
              <span>{quizMode === 'test' ? '🏆 Test Mode' : '🎯 Practice Mode'}</span>
              <span className="text-[9px] opacity-80">▼</span>
            </button>

            {!viewResults && (
              <div className="w-full space-y-1.5 mt-0.5">
                <div className="flex justify-between text-xs font-extrabold text-white/95 select-none">
                  <span>Question {quizData.currentIndex + 1} of {quizData.questions.length}</span>
                  <span>🔥 On a roll!</span>
                </div>
                <ProgressBar progress={progressPercent} color="white" height={10} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main card switch logic */}
      {viewResults ? (
        reviewAnswers ? (
          /* Review Answers Screen */
          <div className="max-w-2xl mx-auto bg-white border border-gray-100 shadow-sm rounded-3xl p-6 md:p-8 space-y-6 animate-[slideUp_0.2s_ease-out]">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 border-b border-gray-100 pb-4 justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setReviewAnswers(false);
                    localStorage.removeItem(keyReviewAnswers);
                  }}
                  className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 transition active:scale-95 cursor-pointer font-black text-lg select-none"
                >
                  ←
                </button>
                <div>
                  <h4 className="text-base md:text-lg font-black text-gray-800 leading-tight">
                    Review Answers
                  </h4>
                  <p className="text-xs font-semibold text-gray-500">
                    Go through each question to learn from your results
                  </p>
                </div>
              </div>
              <Badge variant="white" className="text-brand-purple border border-brand-purpleBorder px-3 py-1 font-bold shrink-0 self-start sm:self-auto mt-2 sm:mt-0">
                {correctAnswers}/{totalQuestions} Correct
              </Badge>
            </div>

            <div className="space-y-6 max-h-[50vh] overflow-y-auto pr-2">
              {userAnswers.map((ans, idx) => (
                <div key={ans.id} className="border border-gray-100 rounded-2xl p-4 md:p-5 space-y-4 bg-gray-50/30">
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-extrabold text-sm text-gray-800">
                      <span className="text-brand-purple mr-1 font-black">Q{idx + 1}.</span> {ans.question}
                    </div>
                    <Badge variant="white" className={`shrink-0 font-extrabold py-1 px-2.5 text-xs ${
                      ans.isCorrect ? 'text-brand-greenDark bg-brand-greenLight border border-brand-greenBorder' : 'text-red-700 bg-red-50 border border-red-200'
                    }`}>
                      {ans.isCorrect ? 'Correct ✅' : 'Incorrect ❌'}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 gap-2 pl-4 border-l-2 border-gray-200">
                    {ans.options.map((opt: string) => {
                      const isSelected = ans.selectedOption === opt;
                      const isCorrectOption = opt === ans.correctOption;

                      let borderClass = 'border-gray-100 bg-white text-gray-600';
                      if (isCorrectOption) {
                        borderClass = 'border-brand-green bg-green-50 text-brand-greenDark font-bold';
                      } else if (isSelected && !ans.isCorrect) {
                        borderClass = 'border-red-300 bg-red-50 text-red-700 font-bold';
                      }

                      return (
                        <div
                          key={opt}
                          className={`px-4 py-2.5 rounded-xl border text-xs flex items-center justify-between ${borderClass}`}
                        >
                          <span>{opt}</span>
                          {isCorrectOption && <span className="text-sm select-none">✅</span>}
                          {isSelected && !ans.isCorrect && <span className="text-sm select-none">❌</span>}
                        </div>
                      );
                    })}
                  </div>

                  {ans.explanation && (
                    <div className="bg-brand-purpleLight/20 text-gray-700 p-4 rounded-xl text-xs space-y-1.5 border border-brand-purpleBorder/30">
                      <div className="font-black text-brand-purple text-[10px] uppercase tracking-wider flex items-center gap-1 mb-1">
                        <span>💡</span> AI Explanation
                      </div>
                      <AIResponseRenderer content={ans.explanation} />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="border-t border-gray-100 pt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setReviewAnswers(false);
                  localStorage.removeItem(keyReviewAnswers);
                }}
                className="px-5 py-2.5 rounded-xl text-xs font-black text-gray-500 hover:bg-gray-100 transition select-none"
              >
                Back to Results
              </button>
              <Button
                variant="green"
                onClick={handleReset}
                className="px-8"
              >
                Finish & Reset 🔄
              </Button>
            </div>
          </div>
        ) : (
          /* Results Dashboard Screen */
          <div className="max-w-2xl mx-auto bg-white border border-gray-100 shadow-sm rounded-3xl p-6 md:p-8 space-y-6 animate-[slideUp_0.2s_ease-out]">
            <div className="text-center font-nunito px-4 py-2 space-y-2">
              <div className="text-4xl select-none">🏆</div>
              <h4 className="text-xl md:text-2xl font-black text-gray-800">
                Quiz Results
              </h4>
              <p className="text-sm font-semibold text-gray-500">
                Here is how you performed on this quiz!
              </p>
            </div>

            {/* Score Ring / Block */}
            <div className="flex flex-col items-center justify-center p-6 bg-brand-purpleLight/30 border border-brand-purpleBorder rounded-2xl max-w-sm mx-auto text-center space-y-1 shadow-sm">
              <div className="text-xs uppercase tracking-wider font-extrabold text-brand-purple select-none">Accuracy Score</div>
              <div className="text-4xl md:text-5xl font-black text-brand-purple">
                {accuracyPercentage}%
              </div>
              <div className="text-sm font-black text-gray-700">
                {correctAnswers} / {totalQuestions} Correct
              </div>
            </div>

            {/* Metrics Info */}
            <div className="grid grid-cols-3 gap-3.5 max-w-lg mx-auto">
              <div className="bg-gray-50/80 border border-gray-100 p-4 rounded-2xl text-center">
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1 select-none">Total Qs</div>
                <div className="text-lg font-black text-gray-700">{totalQuestions}</div>
              </div>
              <div className="bg-green-50/50 border border-brand-greenBorder p-4 rounded-2xl text-center">
                <div className="text-[10px] font-black text-brand-greenDark uppercase tracking-wider mb-1 select-none">Correct</div>
                <div className="text-lg font-black text-brand-greenDark">{correctAnswers}</div>
              </div>
              <div className="bg-red-50/50 border border-red-200 p-4 rounded-2xl text-center">
                <div className="text-[10px] font-black text-red-500 uppercase tracking-wider mb-1 select-none">Incorrect</div>
                <div className="text-lg font-black text-red-600">{incorrectAnswers}</div>
              </div>
            </div>

            {/* Performance Summary and XP */}
            <div className="max-w-lg mx-auto bg-brand-amberLight border border-brand-amberBorder rounded-2xl p-5 flex items-start gap-4 shadow-sm">
              <div className="text-2xl mt-0.5 select-none">⭐</div>
              <div className="space-y-1">
                <div className="text-sm font-black text-gray-800">
                  Score: {correctAnswers}/{totalQuestions} (Accuracy: {accuracyPercentage}%)
                </div>
                <div className="text-xs md:text-sm font-semibold text-gray-600 leading-relaxed">
                  Performance: {performanceSummary}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="border-t border-gray-100 pt-5 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setReviewAnswers(true);
                  localStorage.setItem(keyReviewAnswers, 'true');
                }}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-brand-purple hover:bg-brand-purpleLight/40 px-6 py-3 text-sm font-black text-brand-purple transition active:scale-95 cursor-pointer select-none"
              >
                <span>👁️</span> Review Answers
              </button>
              <Button
                variant="green"
                onClick={handleReset}
                className="w-full sm:w-auto sm:px-10"
              >
                Finish & Reset 🔄
              </Button>
            </div>
          </div>
        )
      ) : (
        /* Regular Question and Options Card */
        <div className="max-w-2xl mx-auto bg-white border border-gray-100 shadow-sm rounded-3xl p-6 md:p-8 space-y-6">
          <div className="text-center font-nunito px-4 py-2">
            <h4 className="text-base md:text-lg font-extrabold text-gray-800 leading-relaxed">
              {currentQuestion.question}
            </h4>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {currentQuestion.options.map((option) => {
              const isSelected = quizData.selectedOption === option;
              const isCorrectOption = option === currentQuestion.correctOption;

              return (
                <button
                  key={option}
                  onClick={() => void handleOptionClick(option)}
                  disabled={quizData.status !== 'idle'}
                  className={`
                    w-full text-left font-nunito font-semibold text-sm px-5 py-4 rounded-2xl border-2 outline-none cursor-pointer transition-all duration-150 flex items-center justify-between
                    ${getOptionClass(option)}
                  `}
                >
                  <span>{option}</span>
                  {quizMode === 'practice' && quizData.status !== 'idle' && (
                    <>
                      {isCorrectOption && <span className="text-base select-none">✅</span>}
                      {isSelected && !isCorrectOption && <span className="text-base select-none">❌</span>}
                    </>
                  )}
                </button>
              );
            })}
          </div>

          {quizMode === 'practice' && quizData.toastMessage && (
            <div className={`
              p-4 rounded-2xl flex items-center gap-3 animate-[slideUp_0.2s_ease-out] w-full
              ${quizData.status === 'correct' 
                ? 'bg-brand-orange text-white shadow-sm' 
                : 'bg-blue-50 text-brand-blue border border-brand-blueBorder'
              }
            `}>
              <div className="text-2xl select-none shrink-0">
                {quizData.status === 'correct' ? '⭐' : '💡'}
              </div>
              <div className="text-xs md:text-sm font-black leading-tight flex-1">
                <AIResponseRenderer 
                  content={quizData.toastMessage} 
                  className={quizData.status === 'correct' ? 'text-white font-black' : 'text-brand-blue font-black'} 
                />
              </div>
            </div>
          )}

          {quizData.status !== 'idle' && (
            <div className="border-t border-gray-100 pt-4 flex justify-end">
              {quizMode === 'test' && quizData.currentIndex === quizData.questions.length - 1 ? (
                <Button
                  variant="green"
                  onClick={handleViewResults}
                  className="w-full sm:w-auto sm:px-12"
                >
                  View Results 🏆
                </Button>
              ) : (
                <Button
                  variant="green"
                  onClick={quizData.currentIndex < quizData.questions.length - 1 ? handleNext : handleReset}
                  className="w-full sm:w-auto sm:px-12"
                >
                  {quizData.currentIndex < quizData.questions.length - 1 ? 'Next Question →' : 'Finish & Reset 🔄'}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Quiz Preferences Modal Popup */}
      {isPrefsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 font-nunito animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-6 border border-gray-100">
            <div>
              <h3 className="text-xl font-black text-gray-800">Quiz Preferences</h3>
              <p className="text-sm text-gray-500 font-semibold mt-1">Configure your learning experience</p>
            </div>

            <div className="space-y-4">
              <div className="text-xs font-black text-gray-400 uppercase tracking-wider">Quiz Mode</div>
              
              {/* Practice Mode */}
              <label 
                className={`
                  flex items-start gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all duration-150 select-none
                  ${tempMode === 'practice' 
                    ? 'border-brand-purple bg-brand-purpleLight/30 text-gray-800' 
                    : 'border-gray-100 hover:border-gray-200 text-gray-600'
                  }
                `}
              >
                <input 
                  type="radio" 
                  name="quizModeOption" 
                  value="practice"
                  checked={tempMode === 'practice'}
                  onChange={() => setTempMode('practice')}
                  className="mt-1 accent-brand-purple cursor-pointer"
                />
                <div>
                  <div className="font-extrabold text-sm flex items-center gap-1.5">
                    <span>🎯</span> Practice Mode
                  </div>
                  <div className="text-xs text-gray-500 font-semibold mt-1 leading-normal">
                    Show answer immediately after selection and provide instant feedback.
                  </div>
                </div>
              </label>

              {/* Test Mode */}
              <label 
                className={`
                  flex items-start gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all duration-150 select-none
                  ${tempMode === 'test' 
                    ? 'border-brand-purple bg-brand-purpleLight/30 text-gray-800' 
                    : 'border-gray-100 hover:border-gray-200 text-gray-600'
                  }
                `}
              >
                <input 
                  type="radio" 
                  name="quizModeOption" 
                  value="test"
                  checked={tempMode === 'test'}
                  onChange={() => setTempMode('test')}
                  className="mt-1 accent-brand-purple cursor-pointer"
                />
                <div>
                  <div className="font-extrabold text-sm flex items-center gap-1.5">
                    <span>🏆</span> Test Mode
                  </div>
                  <div className="text-xs text-gray-500 font-semibold mt-1 leading-normal">
                    Hide answers during the quiz and show results only after completion.
                  </div>
                </div>
              </label>
            </div>

            {/* Warning if quiz in progress and mode changed */}
            {isQuizInProgress && tempMode !== quizMode && (
              <div className="bg-amber-50 border border-brand-amberBorder rounded-2xl p-4 flex gap-3 text-brand-yellowDark animate-[slideUp_0.15s_ease-out]">
                <span className="text-lg">⚠️</span>
                <p className="text-xs font-bold leading-relaxed">
                  Note: Changing the mode will reset your current quiz progress.
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsPrefsOpen(false);
                  setTempMode(quizMode); // reset temp selection
                }}
                className="px-5 py-2.5 rounded-xl text-sm font-extrabold text-gray-500 hover:bg-gray-100 transition-all select-none cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (isQuizInProgress && tempMode !== quizMode) {
                    await handleReset();
                  }
                  setQuizMode(tempMode);
                  localStorage.setItem(keyQuizMode, tempMode);
                  setIsPrefsOpen(false);
                }}
                className="px-6 py-2.5 rounded-xl bg-brand-purple text-white hover:bg-brand-purple/95 active:scale-95 text-sm font-extrabold shadow-sm hover:shadow transition-all select-none cursor-pointer"
              >
                {isQuizInProgress && tempMode !== quizMode ? 'Reset & Apply' : 'Apply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuizView;
