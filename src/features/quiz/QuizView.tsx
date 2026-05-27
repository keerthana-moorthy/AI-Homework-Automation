import React, { useEffect, useState } from 'react';
import { useAppDispatch } from '../../store';
import { setActiveScreen, setUser } from '../../store/slices/appSlice';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
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
  const dispatch = useAppDispatch();
  const [quizData, setQuizData] = useState<Awaited<ReturnType<typeof getQuiz>> | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadQuiz = async () => {
      try {
        const response = await getQuiz();
        if (!mounted) return;
        setQuizData(response);
      } catch (error) {
        console.error('Unable to load quiz', error);
      }
    };

    void loadQuiz();

    return () => {
      mounted = false;
    };
  }, []);

  const currentQuestion = quizData?.currentQuestion ?? quizData?.questions?.[quizData?.currentIndex ?? 0];
  const progressPercent = quizData?.progressPercent ?? 0;

  const handleOptionClick = async (option: string) => {
    if (!quizData || quizData.status !== 'idle') return;

    try {
      const response = await answerQuiz(option);
      setQuizData(response.quiz);
      dispatch(setUser(toUserState(response.user)));
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
    dispatch(setActiveScreen(0));
    void updateScreen(0).catch((error) => {
      console.error('Unable to persist screen change', error);
    });
  };

  const handleReset = async () => {
    try {
      const response = await resetQuiz();
      setQuizData(response.quiz);
    } catch (error) {
      console.error('Unable to reset quiz', error);
    }
  };

  const getOptionClass = (option: string) => {
    if (!quizData || !currentQuestion) {
      return 'border-gray-200 hover:border-brand-purple hover:bg-brand-purpleLight/40 text-gray-700 bg-white';
    }

    const isSelected = quizData.selectedOption === option;

    if (quizData.status === 'idle') {
      return 'border-gray-200 hover:border-brand-purple hover:bg-brand-purpleLight/40 text-gray-700 bg-white';
    }

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
    <div className="space-y-6">
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

          <div className="w-full md:w-64 space-y-1.5 shrink-0">
            <div className="flex justify-between text-xs font-extrabold text-white/95 select-none">
              <span>Question {quizData.currentIndex + 1} of {quizData.questions.length}</span>
              <span>🔥 On a roll!</span>
            </div>
            <ProgressBar progress={progressPercent} color="white" height={10} />
          </div>
        </div>
      </div>

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
                {quizData.status !== 'idle' && isCorrectOption && <span className="text-base select-none">✅</span>}
                {quizData.status !== 'idle' && isSelected && !isCorrectOption && <span className="text-base select-none">❌</span>}
              </button>
            );
          })}
        </div>

        {quizData.toastMessage && (
          <div className={`
            p-4 rounded-2xl flex items-center gap-3 animate-[slideUp_0.2s_ease-out]
            ${quizData.status === 'correct' 
              ? 'bg-brand-orange text-white shadow-sm' 
              : 'bg-blue-50 text-brand-blue border border-brand-blueBorder'
            }
          `}>
            <div className="text-2xl select-none">
              {quizData.status === 'correct' ? '⭐' : '💡'}
            </div>
            <div className="text-xs md:text-sm font-black leading-tight">
              {quizData.toastMessage}
            </div>
          </div>
        )}

        {quizData.status !== 'idle' && (
          <div className="border-t border-gray-100 pt-4 flex justify-end">
            <Button
              variant="green"
              onClick={quizData.currentIndex < quizData.questions.length - 1 ? handleNext : handleReset}
              className="w-full sm:w-auto sm:px-12"
            >
              {quizData.currentIndex < quizData.questions.length - 1 ? 'Next Question →' : 'Finish & Reset 🔄'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuizView;
