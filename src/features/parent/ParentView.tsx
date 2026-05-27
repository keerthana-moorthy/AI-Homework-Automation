import React from 'react';
import { useAppDispatch } from '../../store';
import { setActiveScreen } from '../../store/slices/appSlice';
import { PARENT_STATS, RECOMMENDATIONS } from '../../constants/mockData';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import ProgressBar from '../../components/common/ProgressBar';

export const ParentView: React.FC = () => {
  const dispatch = useAppDispatch();

  // Helper to map color codes to text style colors
  const getStatColor = (id: string) => {
    switch (id) {
      case 'streak': return 'text-brand-orange';
      case 'xp': return 'text-brand-purple';
      case 'completed': return 'text-brand-green';
      case 'doubts': return 'text-brand-blue';
      default: return 'text-gray-700';
    }
  };

  const performanceBars = [
    { subject: '📐 Maths', progress: 72, color: 'orange' as const },
    { subject: '🔬 Science', progress: 55, color: 'purple' as const },
    { subject: '📖 English', progress: 88, color: 'green' as const },
    { subject: '🅰 Tamil', progress: 64, color: 'blue' as const },
  ];

  return (
    <div className="space-y-6">
      
      {/* Parent Header */}
      <div className="bg-gradient-to-r from-brand-blue to-[#42A5F5] text-white p-5 rounded-3xl shadow-sm">
        <div className="flex items-center gap-3">
          <Button variant="back" onClick={() => dispatch(setActiveScreen(0))}>←</Button>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <Badge variant="white">👨‍👩‍👧 Parent View</Badge>
              <span className="text-[10px] text-white/85 font-black uppercase tracking-wider">Guardian Panel</span>
            </div>
            <h3 className="text-base md:text-lg font-black leading-tight">Arjun's Progress</h3>
            <p className="text-[11px] text-white/80 font-bold font-nunito">This week • Class 8</p>
          </div>
        </div>
      </div>

      {/* Grid of Key Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {PARENT_STATS.map((stat) => (
          <div 
            key={stat.id} 
            className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className={`text-2xl md:text-3xl font-black ${getStatColor(stat.id)}`}>
              {stat.value}
            </div>
            <div className="text-[11px] text-gray-500 font-extrabold mt-1 select-none">
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Two Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Performance Progress */}
        <div className="lg:col-span-7 bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-4">
          <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider select-none">
            Subject Performance
          </h4>
          
          <div className="space-y-4">
            {performanceBars.map((bar) => (
              <div key={bar.subject} className="space-y-1.5 font-nunito">
                <div className="flex justify-between text-xs md:text-sm font-extrabold text-gray-700 select-none">
                  <span>{bar.subject}</span>
                  <span>{bar.progress}%</span>
                </div>
                <ProgressBar progress={bar.progress} color={bar.color} height={8} />
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: AI Insights */}
        <div className="lg:col-span-5 flex flex-col justify-between gap-6">
          
          {/* AI Recommendation Widget */}
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex-1 space-y-4">
            <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider select-none">
              AI Recommendations
            </h4>
            
            {RECOMMENDATIONS.map((rec) => (
              <div key={rec.id} className="flex gap-3.5 items-start">
                <div className="text-3xl select-none shrink-0">{rec.emoji}</div>
                <div className="font-nunito">
                  <h5 className="text-sm font-extrabold text-gray-800 mb-1 leading-tight">
                    {rec.title}
                  </h5>
                  <p className="text-xs text-gray-500 font-semibold leading-relaxed">
                    {rec.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Download PDF Actions */}
          <Button
            variant="blue"
            onClick={() => alert("Downloading PDF reports is scheduled for release in the production environment!")}
            className="w-full shrink-0"
          >
            📥 Download Full Report
          </Button>

        </div>

      </div>

    </div>
  );
};

export default ParentView;
