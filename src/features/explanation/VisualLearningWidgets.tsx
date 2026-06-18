import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  MapPin, 
  Calendar, 
  ArrowRight, 
  HelpCircle, 
  Sliders, 
  Layers, 
  Globe, 
  RefreshCw, 
  BookOpen, 
  Maximize2,
  Minimize2,
  Award,
  ChevronRight,
  Sparkles
} from 'lucide-react';

interface WidgetProps {
  data: {
    concept: string;
    subject: string;
    visualType: string;
    title: string;
    description: string;
    elements: any;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. PROCESS / DIAGRAM WIDGET (e.g. Water Cycle, Photosynthesis)
// ─────────────────────────────────────────────────────────────────────────────
export const DiagramWidget: React.FC<{ elements: any; title: string }> = ({ elements, title }) => {
  const steps = elements?.steps || [];
  const [activeStep, setActiveStep] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        setActiveStep((prev) => (prev + 1) % steps.length);
      }, 4000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, steps.length]);

  if (!steps.length) return <div className="text-gray-400 text-sm">No diagram steps found.</div>;

  return (
    <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-base font-extrabold text-gray-800 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-brand-orange animate-ping" />
            {title}
          </h4>
          <p className="text-xs text-gray-500 font-semibold mt-0.5">Click any stage to inspect the process details</p>
        </div>
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-black text-white bg-brand-orange hover:bg-brand-orangeHover transition-all active:scale-95 cursor-pointer shadow-sm select-none"
        >
          {isPlaying ? (
            <>
              <Pause size={12} fill="white" /> Pause AutoPlay
            </>
          ) : (
            <>
              <Play size={12} fill="white" /> AutoPlay Cycle
            </>
          )}
        </button>
      </div>

      {/* Visual Canvas */}
      <div className="relative h-64 bg-gradient-to-br from-brand-blueLight/20 via-white to-brand-purpleLight/10 rounded-2xl border border-gray-100/50 overflow-hidden shadow-inner flex flex-col items-center justify-center">
        {/* Decorative Grid Lines */}
        <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1.5px,transparent_1.5px)] [background-size:20px_20px] opacity-60 pointer-events-none" />

        {/* SVG Connections */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {steps.map((step: any, index: number) => {
            const nextStep = steps[(index + 1) % steps.length];
            const startX = `${step.x}%`;
            const startY = `${step.y}%`;
            const endX = `${nextStep.x}%`;
            const endY = `${nextStep.y}%`;
            const isActive = activeStep === index;

            return (
              <line
                key={`line-${index}`}
                x1={startX}
                y1={startY}
                x2={endX}
                y2={endY}
                stroke={isActive ? '#FF6B35' : '#BDD9F5'}
                strokeWidth={isActive ? 3 : 1.5}
                strokeDasharray={isActive ? '6, 6' : 'none'}
                className={isActive ? 'animate-[dash_2s_linear_infinite]' : ''}
                style={{
                  strokeDashoffset: isActive ? 100 : 0,
                  transition: 'all 0.5s ease'
                }}
              />
            );
          })}
        </svg>

        {/* Node Buttons */}
        {steps.map((step: any, index: number) => {
          const isActive = activeStep === index;
          return (
            <button
              key={`node-${index}`}
              onClick={() => {
                setActiveStep(index);
                setIsPlaying(false);
              }}
              style={{ left: `${step.x}%`, top: `${step.y}%` }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center font-black text-sm transition-all duration-300 shadow-md cursor-pointer select-none
                ${isActive 
                  ? 'bg-brand-orange text-white ring-4 ring-brand-orange/30 scale-110 z-10' 
                  : 'bg-white border-2 border-brand-blueBorder text-brand-blueDark hover:border-brand-orange hover:scale-105'
                }
              `}
            >
              {step.stepNum || index + 1}
            </button>
          );
        })}

        {/* Process Loop Hint */}
        <div className="absolute bottom-2.5 right-3 text-[10px] text-gray-400 font-extrabold flex items-center gap-1 select-none">
          <span>Looping Process</span>
          <RefreshCw size={10} className="animate-spin-slow" />
        </div>
      </div>

      {/* Selected Step Description Card */}
      <div className="bg-brand-blueLight/30 border border-brand-blueBorder/40 rounded-2xl p-5 flex items-start gap-4 transition-all duration-300 shadow-sm">
        <div className="w-9 h-9 rounded-full bg-brand-blue text-white flex items-center justify-center shrink-0 font-black text-sm select-none shadow-sm">
          {steps[activeStep].stepNum}
        </div>
        <div className="space-y-1">
          <h5 className="font-extrabold text-sm text-gray-800 flex items-center gap-1.5">
            {steps[activeStep].title}
            <span className="text-[10px] bg-brand-blue/10 text-brand-blueDark border border-brand-blueBorder px-2 py-0.5 rounded-full font-bold select-none">
              Stage {activeStep + 1} of {steps.length}
            </span>
          </h5>
          <p className="text-xs text-gray-600 font-semibold leading-relaxed">
            {steps[activeStep].description}
          </p>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. INTERACTIVE MAP WIDGET (e.g. Geography Rivers/Deserts, History Kingdoms)
// ─────────────────────────────────────────────────────────────────────────────
export const MapWidget: React.FC<{ elements: any; title: string }> = ({ elements, title }) => {
  const locations = elements?.locations || [];
  const [selectedLoc, setSelectedLoc] = useState<any>(locations[0] || null);
  const [mapTheme, setMapTheme] = useState<'terrain' | 'political'>('terrain');

  if (!locations.length) return <div className="text-gray-400 text-sm">No map locations specified.</div>;

  return (
    <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-base font-extrabold text-gray-800 flex items-center gap-1.5">
            <Globe size={18} className="text-brand-purple" />
            {title}
          </h4>
          <p className="text-xs text-gray-500 font-semibold mt-0.5">Explore geographical places & regions of interest</p>
        </div>
        {/* Style Selector */}
        <div className="bg-gray-100 p-0.5 rounded-full flex gap-0.5">
          {(['terrain', 'political'] as const).map((theme) => (
            <button
              key={theme}
              onClick={() => setMapTheme(theme)}
              className={`px-3 py-1 rounded-full text-[10px] font-black uppercase select-none transition cursor-pointer
                ${mapTheme === theme ? 'bg-brand-purple text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}
              `}
            >
              {theme}
            </button>
          ))}
        </div>
      </div>

      {/* Styled Map Board */}
      <div className={`relative h-64 rounded-2xl border border-gray-100 overflow-hidden shadow-inner flex items-center justify-center transition-all duration-500
        ${mapTheme === 'terrain' 
          ? 'bg-gradient-to-br from-teal-50 via-emerald-50/50 to-amber-50/30' 
          : 'bg-gradient-to-br from-blue-50/80 via-slate-50 to-orange-50/30'
        }
      `}>
        {/* Simple grid coordinate system */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#cbd5e1_1px,transparent_1px),linear-gradient(to_bottom,#cbd5e1_1px,transparent_1px)] bg-[size:30px_30px] opacity-20 pointer-events-none" />

        {/* Simulated Land/Sea Contours */}
        {mapTheme === 'terrain' ? (
          <>
            <div className="absolute left-[10%] top-[20%] w-48 h-32 bg-emerald-100/40 rounded-full blur-xl filter" />
            <div className="absolute right-[15%] bottom-[10%] w-40 h-40 bg-yellow-100/40 rounded-full blur-2xl filter" />
            <div className="absolute left-[40%] bottom-[30%] w-24 h-24 bg-teal-100/30 rounded-full blur-xl filter" />
          </>
        ) : (
          <>
            <div className="absolute left-0 top-0 w-full h-full border-r-[40px] border-b-[80px] border-orange-100/20 pointer-events-none" />
            <div className="absolute right-0 top-0 w-full h-full border-l-[60px] border-t-[50px] border-blue-100/20 pointer-events-none" />
          </>
        )}

        {/* Location Pins */}
        {locations.map((loc: any, idx: number) => {
          const isSelected = selectedLoc?.label === loc.label;
          return (
            <button
              key={idx}
              onClick={() => setSelectedLoc(loc)}
              style={{ left: `${loc.x || 50}%`, top: `${loc.y || 50}%` }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 group cursor-pointer flex flex-col items-center select-none`}
            >
              {/* Tooltip on hover */}
              <div className="absolute bottom-full mb-1.5 hidden group-hover:block bg-gray-800 text-white text-[9px] font-bold py-1 px-2 rounded-lg shadow-md whitespace-nowrap z-20">
                {loc.label}
              </div>

              {/* Ping Marker */}
              <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center transition-all duration-300 shadow-md border-2 border-white
                ${isSelected 
                  ? 'bg-brand-purple ring-4 ring-brand-purple/20 scale-125 z-10' 
                  : 'bg-brand-purple/60 hover:bg-brand-purple hover:scale-110'
                }
              `} />
            </button>
          );
        })}
      </div>

      {/* Selected Location Info Card */}
      {selectedLoc ? (
        <div className="bg-brand-purpleLight/40 border border-brand-purpleBorder/30 rounded-2xl p-5 flex items-start gap-3.5 transition-all shadow-sm">
          <div className="p-2.5 bg-brand-purple text-white rounded-xl shadow-sm shrink-0">
            <MapPin size={18} fill="white" />
          </div>
          <div className="space-y-1 flex-1">
            <h5 className="font-extrabold text-sm text-gray-800 flex items-center justify-between">
              <span>{selectedLoc.label}</span>
              <span className="text-[10px] text-brand-purple font-extrabold select-none">
                Coordinates: {selectedLoc.x}E, {selectedLoc.y}N
              </span>
            </h5>
            <p className="text-xs text-gray-600 font-semibold leading-relaxed">
              {selectedLoc.description}
            </p>
          </div>
        </div>
      ) : (
        <div className="text-center py-4 text-xs font-bold text-gray-400">
          Click any map marker to show geographical insights
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. HISTORY TIMELINE WIDGET (e.g. Kingdoms, Freedom Struggles, Key Dates)
// ─────────────────────────────────────────────────────────────────────────────
export const TimelineWidget: React.FC<{ elements: any; title: string }> = ({ elements, title }) => {
  const events = elements?.events || [];
  const [importanceFilter, setImportanceFilter] = useState<'all' | 'high'>('all');
  const [selectedEventIndex, setSelectedEventIndex] = useState<number>(0);

  const filteredEvents = events.filter((ev: any) => 
    importanceFilter === 'all' || ev.importance?.toLowerCase() === 'high'
  );

  const selectedEvent = filteredEvents[selectedEventIndex] || filteredEvents[0];

  if (!events.length) return <div className="text-gray-400 text-sm">No timeline events found.</div>;

  return (
    <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h4 className="text-base font-extrabold text-gray-800 flex items-center gap-1.5">
            <Calendar size={18} className="text-brand-purple" />
            {title}
          </h4>
          <p className="text-xs text-gray-500 font-semibold mt-0.5">Chronology of key dates and epoch chapters</p>
        </div>

        {/* Filter Toggle */}
        <div className="bg-gray-100 p-0.5 rounded-full flex gap-0.5 self-start sm:self-auto">
          <button
            onClick={() => { setImportanceFilter('all'); setSelectedEventIndex(0); }}
            className={`px-3 py-1 rounded-full text-[10px] font-black uppercase transition cursor-pointer select-none
              ${importanceFilter === 'all' ? 'bg-brand-purple text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}
            `}
          >
            All Events
          </button>
          <button
            onClick={() => { setImportanceFilter('high'); setSelectedEventIndex(0); }}
            className={`px-3 py-1 rounded-full text-[10px] font-black uppercase transition cursor-pointer select-none
              ${importanceFilter === 'high' ? 'bg-brand-purple text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}
            `}
          >
            🔥 Critical
          </button>
        </div>
      </div>

      {/* Horizontal Timeline Track */}
      <div className="relative border border-gray-100 rounded-2xl p-5 overflow-x-auto bg-gray-50/50 min-w-full">
        {/* Timeline Path Line */}
        <div className="absolute left-6 right-6 top-[44%] h-0.5 bg-gray-200 pointer-events-none" />

        <div className="flex items-center justify-between min-w-[500px] gap-6 px-4 py-3">
          {filteredEvents.map((ev: any, idx: number) => {
            const isSelected = selectedEvent?.title === ev.title;
            const isHigh = ev.importance?.toLowerCase() === 'high';

            return (
              <button
                key={idx}
                onClick={() => setSelectedEventIndex(idx)}
                className="relative z-10 flex flex-col items-center select-none cursor-pointer focus:outline-none shrink-0"
              >
                {/* Period Badge */}
                <div className={`text-[10px] font-black mb-3 px-2.5 py-0.5 rounded-full border transition-all duration-300
                  ${isSelected 
                    ? 'bg-brand-purple text-white border-brand-purple shadow-sm font-extrabold' 
                    : 'bg-white border-gray-200 text-gray-500 font-bold'
                  }
                `}>
                  {ev.period}
                </div>

                {/* Node Dot */}
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all duration-300
                  ${isSelected 
                    ? 'bg-brand-purple border-white ring-4 ring-brand-purple/20 scale-125' 
                    : isHigh
                      ? 'bg-brand-orange border-white ring-2 ring-brand-orange/10'
                      : 'bg-white border-brand-purple/40 hover:border-brand-purple'
                  }
                `}>
                  {isHigh && !isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />}
                </div>

                {/* Short Title Label */}
                <div className={`text-[11px] font-extrabold mt-3 tracking-tight max-w-[100px] text-center truncate
                  ${isSelected ? 'text-brand-purple font-black scale-105' : 'text-gray-600'}
                `}>
                  {ev.title}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Event Details Panel */}
      {selectedEvent && (
        <div className="bg-brand-purpleLight/40 border border-brand-purpleBorder/30 rounded-2xl p-5 shadow-sm space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h5 className="font-extrabold text-sm text-gray-800">
              {selectedEvent.title}
            </h5>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-extrabold bg-brand-purple/10 text-brand-purpleDark px-2.5 py-0.5 rounded-full border border-brand-purpleBorder select-none">
                ⏳ {selectedEvent.period}
              </span>
              {selectedEvent.importance && (
                <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full select-none
                  ${selectedEvent.importance.toLowerCase() === 'high' 
                    ? 'bg-red-50 text-red-600 border border-red-200' 
                    : 'bg-gray-100 text-gray-500'
                  }
                `}>
                  {selectedEvent.importance} Priority
                </span>
              )}
            </div>
          </div>
          <p className="text-xs text-gray-600 font-semibold leading-relaxed">
            {selectedEvent.description}
          </p>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. COMPARISON WIDGET (e.g. Plains vs Mountains vs Plateaus, Concepts contrasts)
// ─────────────────────────────────────────────────────────────────────────────
export const ComparisonWidget: React.FC<{ elements: any; title: string }> = ({ elements, title }) => {
  const headers = elements?.headers || [];
  const rows = elements?.rows || [];
  const [activeTabIdx, setActiveTabIdx] = useState<number>(0);

  if (!rows.length) return <div className="text-gray-400 text-sm">No comparison rows available.</div>;

  const conceptColumns = headers.slice(1); // Exclude the attribute column name

  return (
    <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm space-y-6">
      <div>
        <h4 className="text-base font-extrabold text-gray-800 flex items-center gap-1.5">
          <Layers size={18} className="text-brand-orange" />
          {title}
        </h4>
        <p className="text-xs text-gray-500 font-semibold mt-0.5">Differentiate and contrast key educational concepts</p>
      </div>

      {/* Concept Switcher for Mobile Side-by-side or Flippable cards */}
      <div className="block md:hidden bg-gray-100 p-0.5 rounded-full flex gap-0.5">
        {conceptColumns.map((col: string, idx: number) => (
          <button
            key={idx}
            onClick={() => setActiveTabIdx(idx)}
            className={`flex-1 py-2 text-center rounded-full text-xs font-black select-none cursor-pointer transition
              ${activeTabIdx === idx ? 'bg-brand-orange text-white shadow-sm' : 'text-gray-600 hover:text-gray-800'}
            `}
          >
            {col}
          </button>
        ))}
      </div>

      {/* Grid Comparison Layout (Desktop & Tablet) */}
      <div className="hidden md:block overflow-hidden rounded-2xl border border-gray-100 shadow-sm">
        <table className="min-w-full divide-y divide-gray-100 text-left">
          <thead className="bg-gray-50">
            <tr>
              {headers.map((hdr: string, idx: number) => (
                <th
                  key={idx}
                  className="px-5 py-3.5 text-xs font-black text-gray-500 uppercase tracking-wider select-none"
                >
                  {hdr}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-50 text-xs text-gray-600 font-semibold">
            {rows.map((row: any, rowIdx: number) => (
              <tr key={rowIdx} className="hover:bg-gray-50/40 transition">
                <td className="px-5 py-4 font-extrabold text-gray-800 bg-gray-50/20 select-none">
                  {row.attribute}
                </td>
                {row.values?.map((val: string, valIdx: number) => (
                  <td key={valIdx} className="px-5 py-4 leading-relaxed">
                    {val}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Card Comparison Layout (Mobile) */}
      <div className="block md:hidden space-y-4 animate-[slideUp_0.15s_ease-out]">
        <div className="bg-brand-amberLight border-2 border-brand-amberBorder/60 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-brand-amberBorder/30 pb-2.5">
            <h5 className="font-extrabold text-sm text-brand-orange">
              {conceptColumns[activeTabIdx]}
            </h5>
            <Badge variant="orange" className="text-[9px] font-bold">Contrast View</Badge>
          </div>

          <div className="space-y-4 divide-y divide-gray-100">
            {rows.map((row: any, idx: number) => (
              <div key={idx} className={`${idx > 0 ? 'pt-3' : ''} space-y-1`}>
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider select-none">
                  {row.attribute}
                </div>
                <div className="text-xs text-gray-700 font-semibold leading-relaxed">
                  {row.values?.[activeTabIdx] || '-'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. LABELED HOTSPOT VISUAL (e.g. Science Heart anatomy, Plant cell structures)
// ─────────────────────────────────────────────────────────────────────────────
export const LabeledVisualWidget: React.FC<{ elements: any; title: string }> = ({ elements, title }) => {
  const hotspots = elements?.hotspots || [];
  const [activeSpot, setActiveSpot] = useState<any>(hotspots[0] || null);

  if (!hotspots.length) return <div className="text-gray-400 text-sm">No structure hotspots found.</div>;

  return (
    <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm space-y-6">
      <div>
        <h4 className="text-base font-extrabold text-gray-800 flex items-center gap-1.5">
          <BookOpen size={18} className="text-brand-green" />
          {title}
        </h4>
        <p className="text-xs text-gray-500 font-semibold mt-0.5">Interact with diagram hotspots to learn components and functions</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Hotspot Board Canvas */}
        <div className="lg:col-span-7 relative h-72 bg-gradient-to-br from-brand-greenLight/20 via-white to-gray-50 border border-gray-100 rounded-2xl overflow-hidden shadow-inner flex items-center justify-center select-none">
          <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1.2px,transparent_1.2px)] [background-size:16px_16px] opacity-40 pointer-events-none" />

          {/* Simple Vector Schematic Shapes simulating an Educational Diagram */}
          <div className="relative w-48 h-48 rounded-full bg-brand-greenLight border-4 border-brand-greenBorder flex items-center justify-center opacity-70 animate-pulse-slow">
            <div className="w-24 h-24 rounded-full bg-white/70 border-2 border-brand-green/30 flex items-center justify-center">
              <div className="w-8 h-8 rounded-full bg-brand-green/10" />
            </div>
            {/* Cross Lines */}
            <div className="absolute inset-0 border-t-2 border-dashed border-brand-greenBorder/40 top-1/2 -translate-y-1/2" />
            <div className="absolute inset-0 border-l-2 border-dashed border-brand-greenBorder/40 left-1/2 -translate-x-1/2" />
          </div>

          {/* Hotspots */}
          {hotspots.map((spot: any, idx: number) => {
            const isSelected = activeSpot?.label === spot.label;
            return (
              <button
                key={idx}
                onClick={() => setActiveSpot(spot)}
                style={{ left: `${spot.x || 50}%`, top: `${spot.y || 50}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer focus:outline-none flex items-center justify-center z-10"
              >
                {/* Outer Ring */}
                <span className={`absolute inline-flex h-7 w-7 rounded-full opacity-75 animate-ping
                  ${isSelected ? 'bg-brand-green' : 'bg-brand-green/30'}
                `} />

                {/* Center Core dot */}
                <span className={`w-4.5 h-4.5 rounded-full flex items-center justify-center text-[9px] font-black text-white shadow-md border border-white transition-all duration-300
                  ${isSelected 
                    ? 'bg-brand-greenDark scale-110 ring-4 ring-brand-green/20' 
                    : 'bg-brand-green hover:bg-brand-greenDark'
                  }
                `}>
                  {idx + 1}
                </span>
              </button>
            );
          })}
        </div>

        {/* Hotspots List and description */}
        <div className="lg:col-span-5 space-y-4 flex flex-col justify-center">
          <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
            {hotspots.map((spot: any, idx: number) => {
              const isSelected = activeSpot?.label === spot.label;
              return (
                <button
                  key={idx}
                  onClick={() => setActiveSpot(spot)}
                  className={`w-full text-left px-4 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-3 transition cursor-pointer select-none
                    ${isSelected
                      ? 'border-brand-green bg-brand-greenLight text-brand-greenDark font-extrabold shadow-sm'
                      : 'border-gray-100 hover:border-gray-200 text-gray-600 bg-white'
                    }
                  `}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black shrink-0
                    ${isSelected ? 'bg-brand-greenDark text-white' : 'bg-gray-100 text-gray-500'}
                  `}>
                    {idx + 1}
                  </span>
                  <span className="truncate">{spot.label}</span>
                </button>
              );
            })}
          </div>

          {activeSpot && (
            <div className="bg-brand-greenLight/30 border border-brand-greenBorder/30 rounded-2xl p-4.5 shadow-sm space-y-1.5 animate-[fadeIn_0.15s_ease-out]">
              <h6 className="font-extrabold text-xs text-brand-greenDark uppercase tracking-wider flex items-center gap-1.5">
                <Award size={13} />
                Part {hotspots.indexOf(activeSpot) + 1}: {activeSpot.label}
              </h6>
              <p className="text-xs text-gray-600 font-semibold leading-relaxed">
                {activeSpot.description}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. MATH FORMULA & GRAPHING WIDGET (e.g. Geometry curves, algebra graphs)
// ─────────────────────────────────────────────────────────────────────────────
export const MathFormulaWidget: React.FC<{ elements: any; title: string }> = ({ elements, title }) => {
  const latex = elements?.latex || 'f(x) = ax^2 + bx + c';
  const variables = elements?.variables || [];
  const plottingExpression = elements?.plottingExpression || 'a * x * x';
  const xRange = elements?.xRange || [-10, 10];
  const yRange = elements?.yRange || [-10, 10];

  // Map variable parameters state
  const [params, setParams] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    variables.forEach((v: any) => {
      initial[v.symbol] = typeof v.default === 'number' ? v.default : 1;
    });
    // Fallback constants if no variables parsed
    if (!variables.length) {
      initial['a'] = 1;
      initial['b'] = 0;
      initial['c'] = 0;
    }
    return initial;
  });

  const handleSliderChange = (symbol: string, value: number) => {
    setParams((prev) => ({
      ...prev,
      [symbol]: value
    }));
  };

  const evalY = (x: number): number => {
    try {
      // Evaluate function values safely
      const a = params['a'] ?? 0;
      const b = params['b'] ?? 0;
      const c = params['c'] ?? 0;
      
      // Basic expression parser support for standard parameters
      if (plottingExpression.includes('a') || plottingExpression.includes('b') || plottingExpression.includes('c')) {
        // Evaluate JS math
        const expr = plottingExpression
          .replace(/\ba\b/g, String(a))
          .replace(/\bb\b/g, String(b))
          .replace(/\bc\b/g, String(c))
          .replace(/\bx\b/g, String(x));
        // Simple eval equivalent mapping
        return Function(`"use strict"; return (${expr})`)();
      } else {
        // Fallback standard quadratic behavior
        return a * x * x + b * x + c;
      }
    } catch {
      return 0;
    }
  };

  // Generate SVG Path coordinates mapping
  const width = 300;
  const height = 220;
  const pad = 20;

  const mapX = (xVal: number) => {
    const range = xRange[1] - xRange[0];
    const ratio = (xVal - xRange[0]) / range;
    return pad + ratio * (width - 2 * pad);
  };

  const mapY = (yVal: number) => {
    const range = yRange[1] - yRange[0];
    const ratio = (yVal - yRange[0]) / range;
    // Invert Y axis for screen space
    return height - pad - ratio * (height - 2 * pad);
  };

  // Build grid lines
  const gridLinesX = [];
  const gridLinesY = [];
  const xStep = (xRange[1] - xRange[0]) / 10;
  const yStep = (yRange[1] - yRange[0]) / 10;

  for (let i = 0; i <= 10; i++) {
    const xVal = xRange[0] + i * xStep;
    gridLinesX.push(xVal);
    const yVal = yRange[0] + i * yStep;
    gridLinesY.push(yVal);
  }

  // Draw plot curve points
  const points = [];
  const steps = 60;
  const dx = (xRange[1] - xRange[0]) / steps;
  for (let i = 0; i <= steps; i++) {
    const x = xRange[0] + i * dx;
    const y = evalY(x);
    // Clamp coordinates to prevent SVG rendering explosion
    if (!isNaN(y) && isFinite(y)) {
      points.push({ x: mapX(x), y: mapY(y) });
    }
  }

  // Build SVG Path 'd' string
  let dAttr = '';
  if (points.length > 0) {
    dAttr = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
  }

  // Active variable symbols keys list
  const activeSymbols = variables.length ? variables : [
    { symbol: 'a', name: 'Width / Dir (a)', min: -3, max: 3, default: 1 },
    { symbol: 'b', name: 'Slant / Shift (b)', min: -5, max: 5, default: 0 },
    { symbol: 'c', name: 'Vertical Shift (c)', min: -5, max: 5, default: 0 }
  ];

  return (
    <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-base font-extrabold text-gray-800 flex items-center gap-1.5">
            <Sliders size={18} className="text-brand-blue" />
            {title}
          </h4>
          <p className="text-xs text-gray-500 font-semibold mt-0.5">Modify parameters to plot the math curve in real time</p>
        </div>
      </div>

      {/* Formula Display block */}
      <div className="bg-brand-blueLight/30 border border-brand-blueBorder/30 rounded-2xl p-4.5 text-center shadow-inner relative overflow-hidden select-all">
        <span className="absolute left-2.5 top-2.5 text-[8px] uppercase tracking-wider font-extrabold text-brand-blueDark opacity-60">LaTeX Formula</span>
        <div className="font-poppins text-base font-bold text-brand-blueDark tracking-wide select-text">
          {latex}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
        {/* SVG Graph Plotter */}
        <div className="md:col-span-6 flex justify-center bg-gray-50 border border-gray-100 rounded-2xl p-3 relative shadow-inner overflow-hidden select-none">
          <svg width={width} height={height} className="overflow-visible">
            {/* Grid background lines */}
            {gridLinesX.map((gX, idx) => (
              <line
                key={`gx-${idx}`}
                x1={mapX(gX)}
                y1={pad}
                x2={mapX(gX)}
                y2={height - pad}
                stroke="#e2e8f0"
                strokeWidth={0.7}
              />
            ))}
            {gridLinesY.map((gY, idx) => (
              <line
                key={`gy-${idx}`}
                x1={pad}
                y1={mapY(gY)}
                x2={width - pad}
                y2={mapY(gY)}
                stroke="#e2e8f0"
                strokeWidth={0.7}
              />
            ))}

            {/* Axes */}
            {xRange[0] <= 0 && xRange[1] >= 0 && (
              <line
                x1={mapX(0)}
                y1={pad}
                x2={mapX(0)}
                y2={height - pad}
                stroke="#94a3b8"
                strokeWidth={1.5}
              />
            )}
            {yRange[0] <= 0 && yRange[1] >= 0 && (
              <line
                x1={pad}
                y1={mapY(0)}
                x2={width - pad}
                y2={mapY(0)}
                stroke="#94a3b8"
                strokeWidth={1.5}
              />
            )}

            {/* Plot Path */}
            {dAttr && (
              <path
                d={dAttr}
                fill="none"
                stroke="#2196F3"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="transition-all duration-150"
              />
            )}
          </svg>
          <div className="absolute top-2 right-2.5 text-[8.5px] bg-white border border-gray-100 font-extrabold text-gray-500 rounded px-1.5 py-0.5 select-none shadow-sm">
            Interactive Plot Canvas
          </div>
        </div>

        {/* Variable Sliders */}
        <div className="md:col-span-6 space-y-4">
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1 select-none">Adjust Coefficients</div>
          {activeSymbols.map((item: any, idx: number) => {
            const sym = item.symbol;
            const curVal = params[sym] ?? item.default ?? 1;

            return (
              <div key={idx} className="space-y-1.5">
                <div className="flex justify-between text-xs font-bold text-gray-700 select-none">
                  <span className="flex items-center gap-1">
                    <span className="w-5 h-5 rounded-md bg-brand-blueLight border border-brand-blueBorder text-brand-blueDark flex items-center justify-center font-extrabold text-[10px]">
                      {sym}
                    </span>
                    <span className="text-gray-500 text-[11px] truncate max-w-[120px]">{item.name}</span>
                  </span>
                  <span className="font-extrabold text-brand-blueDark bg-brand-blueLight px-2 py-0.5 rounded text-[11px]">
                    {Number(curVal).toFixed(1)}
                  </span>
                </div>
                <input
                  type="range"
                  min={item.min ?? -5}
                  max={item.max ?? 5}
                  step={0.1}
                  value={curVal}
                  onChange={(e) => handleSliderChange(sym, parseFloat(e.target.value))}
                  className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-blue"
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. CONTAINER SWITCHER & COMPONENT ASSEMBLY
// ─────────────────────────────────────────────────────────────────────────────
export const VisualLearningContainer: React.FC<WidgetProps> = ({ data }) => {
  const { title, description, visualType, elements } = data;

  const renderWidget = () => {
    switch (visualType) {
      case 'diagram':
        return <DiagramWidget elements={elements} title={title} />;
      case 'map':
        return <MapWidget elements={elements} title={title} />;
      case 'timeline':
        return <TimelineWidget elements={elements} title={title} />;
      case 'comparison':
        return <ComparisonWidget elements={elements} title={title} />;
      case 'labeled_visual':
        return <LabeledVisualWidget elements={elements} title={title} />;
      case 'math_formula':
        return <MathFormulaWidget elements={elements} title={title} />;
      default:
        // Default comparison fallback
        return <ComparisonWidget elements={elements} title={title} />;
    }
  };

  return (
    <div className="space-y-5 animate-[fadeIn_0.2s_ease-out]">
      {/* Intro Header */}
      <div className="bg-gradient-to-r from-brand-amberLight via-white to-brand-purpleLight/10 rounded-2xl p-5 border border-brand-amberBorder/30 shadow-sm relative overflow-hidden flex items-start gap-4">
        <div className="p-3 bg-brand-orange text-white rounded-2xl shadow-md shrink-0 flex items-center justify-center animate-bounce-slow">
          <Sparkles size={20} fill="white" />
        </div>
        <div>
          <span className="text-[9px] font-black text-brand-orange uppercase tracking-widest bg-brand-amberLight px-2 py-0.5 rounded border border-brand-amberBorder select-none">
            AI Visual Learning Active
          </span>
          <h3 className="text-base font-extrabold text-gray-800 mt-1">{title || 'Topic Visualization Workspace'}</h3>
          <p className="text-xs text-gray-500 font-semibold mt-1 leading-relaxed">
            {description || 'Automatically analyzed homework concepts. Tap, slide, and explore details below to understand this topic visually.'}
          </p>
        </div>
      </div>

      {/* Main Interactive Widget */}
      {renderWidget()}
    </div>
  );
};

export default VisualLearningContainer;
