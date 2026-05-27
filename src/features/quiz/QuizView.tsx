import React from 'react';
import { useAppDispatch, useAppSelector } from '../../store';
import { selectOption, nextQuestion } from '../../store/slices/quizSlice';
import { addXp, setActiveScreen } from '../../store/slices/appSlice';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import ProgressBar from '../../components/common/ProgressBar';

export const QuizView: React.FC = () => {
  const dispatch = useAppDispatch();
  const { questions, currentIndex, selectedOption, status, toastMessage } = useAppSelector((state) => state.quiz);

  const currentQuestion = questions[currentIndex];
  const progressPercent = ((currentIndex + 1) / questions.length) * 100;

  const handleOptionClick = (option: string) => {
    if (status !== 'idle') return; // already answered
    
    dispatch(selectOption(option));
    
    // If answer is correct, award XP points globally in appSlice
    if (option === currentQuestion.correctOption) {
      dispatch(addXp(10));
    }
  };

  const handleNext = () => {
    dispatch(nextQuestion());
  };

  // Helper to determine tailwind classes for options
  const getOptionClass = (option: string) => {
    const isSelected = selectedOption === option;
    
    if (status === 'idle') {
      return 'border-gray-200 hover:border-brand-purple hover:bg-brand-purpleLight/40 text-gray-700 bg-white';
    }
    
    // Question has been evaluated
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

  return (
    <div className="space-y-6">
      
      {/* Quiz Header */}
      <div className="bg-gradient-to-br from-brand-green to-[#66BB6A] text-white p-5 rounded-3xl shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="back" onClick={() => dispatch(setActiveScreen(0))}>←</Button>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <Badge variant="white">⚡ Quick Quiz</Badge>
                <span className="text-[10px] text-white/80 font-black uppercase tracking-wider">Algebra Revision</span>
              </div>
              <h3 className="text-base md:text-lg font-black leading-tight">Algebra Practice</h3>
            </div>
          </div>
          
          {/* Progress Tracker inside Header */}
          <div className="w-full md:w-64 space-y-1.5 shrink-0">
            <div className="flex justify-between text-xs font-extrabold text-white/95 select-none">
              <span>Question {currentIndex + 1} of {questions.length}</span>
              <span>🔥 On a roll!</span>
            </div>
            <ProgressBar progress={progressPercent} color="white" height={10} />
          </div>
        </div>
      </div>

      {/* Main Workspace Card */}
      <div className="max-w-2xl mx-auto bg-white border border-gray-100 shadow-sm rounded-3xl p-6 md:p-8 space-y-6">
        
        {/* Question Statement */}
        <div className="text-center font-nunito px-4 py-2">
          <h4 className="text-base md:text-lg font-extrabold text-gray-800 leading-relaxed">
            {currentQuestion.question}
          </h4>
        </div>

        {/* Options Selection Grid */}
        <div className="grid grid-cols-1 gap-3">
          {currentQuestion.options.map((option) => {
            const isSelected = selectedOption === option;
            const isCorrectOption = option === currentQuestion.correctOption;
            
            return (
              <button
                key={option}
                onClick={() => handleOptionClick(option)}
                disabled={status !== 'idle'}
                className={`
                  w-full text-left font-nunito font-semibold text-sm px-5 py-4 rounded-2xl border-2 outline-none cursor-pointer transition-all duration-150 flex items-center justify-between
                  ${getOptionClass(option)}
                `}
              >
                <span>{option}</span>
                {status !== 'idle' && isCorrectOption && <span className="text-base select-none">✅</span>}
                {status !== 'idle' && isSelected && !isCorrectOption && <span className="text-base select-none">❌</span>}
              </button>
            );
          })}
        </div>

        {/* XP Toast Notification */}
        {toastMessage && (
          <div className={`
            p-4 rounded-2xl flex items-center gap-3 animate-[slideUp_0.2s_ease-out]
            ${status === 'correct' 
              ? 'bg-brand-orange text-white shadow-sm' 
              : 'bg-blue-50 text-brand-blue border border-brand-blueBorder'
            }
          `}>
            <div className="text-2xl select-none">
              {status === 'correct' ? '⭐' : '💡'}
            </div>
            <div className="text-xs md:text-sm font-black leading-tight">
              {toastMessage}
            </div>
          </div>
        )}

        {/* Action Panel */}
        {status !== 'idle' && (
          <div className="border-t border-gray-100 pt-4 flex justify-end">
            <Button
              variant="green"
              onClick={handleNext}
              className="w-full sm:w-auto sm:px-12"
            >
              {currentIndex < questions.length - 1 ? 'Next Question →' : 'Finish & Reset 🔄'}
            </Button>
          </div>
        )}

      </div>

    </div>
  );
};

export default QuizView;
