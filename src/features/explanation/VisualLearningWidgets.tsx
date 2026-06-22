import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  MapPin,
  Calendar,
  Sliders,
  Layers,
  Globe,
  RefreshCw,
  BookOpen,
  Award,
  Sparkles,
  AlertCircle,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// ICON RESOLUTION HELPER
// Maps step/event titles and keywords to relevant emojis when backend omits them
// ─────────────────────────────────────────────────────────────────────────────
const KEYWORD_ICON_MAP: [RegExp, string][] = [
  // Water cycle / Weather
  [/evapor/i, '☀️'],
  [/transpir/i, '🌿'],
  [/condens/i, '☁️'],
  [/precipit|rain|snow|hail/i, '🌧️'],
  [/collect|runoff|groundwater/i, '💧'],
  [/infiltrat/i, '🌍'],
  [/glacier/i, '🏔️'],
  // Photosynthesis / Biology
  [/photosynthes/i, '🌱'],
  [/sunlight|light energy/i, '☀️'],
  [/chlorophyll/i, '🍃'],
  [/oxygen|CO2|carbon/i, '💨'],
  [/glucose|sugar|food/i, '🍬'],
  [/root|absorb/i, '🌾'],
  [/respir/i, '🫁'],
  [/digest/i, '🍽️'],
  [/heart|blood|circulat/i, '❤️'],
  [/dna|gene|chromosome/i, '🧬'],
  [/cell|mitosis|meiosis/i, '🔬'],
  [/brain|nerve|neuron/i, '🧠'],
  [/muscle|bone|skeleton/i, '🦴'],
  // Geography
  [/plain|flat|grass/i, '🌾'],
  [/mountain|peak|summit|hill/i, '⛰️'],
  [/plateau|tableland/i, '🏔️'],
  [/river|stream|lake/i, '🌊'],
  [/desert|arid|sand/i, '🏜️'],
  [/forest|jungle|rainforest/i, '🌳'],
  [/coast|sea|ocean/i, '🌊'],
  [/volcano|lava|eruption/i, '🌋'],
  [/earthquake|seismic/i, '📊'],
  [/city|urban|town/i, '🏙️'],
  // History
  [/empire|kingdom|dynasty/i, '👑'],
  [/war|battle|revolt|freedom/i, '⚔️'],
  [/independence|revolution/i, '🎗️'],
  [/trade|economy|commerce/i, '💰'],
  [/art|culture|temple|monument/i, '🏛️'],
  [/religion|faith|buddhism|hinduism/i, '🙏'],
  [/mughal|sultan|delhi/i, '🕌'],
  [/maurya|gupta|ancient/i, '🏺'],
  [/british|colonial/i, '🗺️'],
  [/discovery|exploration|voyage/i, '⛵'],
  // Science / Physics / Chemistry
  [/atom|molecule|element/i, '⚛️'],
  [/force|gravity|newton/i, '🍎'],
  [/energy|heat|kinetic/i, '⚡'],
  [/electricity|current|circuit/i, '🔋'],
  [/magnet|magnetic/i, '🧲'],
  [/light|optic|prism/i, '🌈'],
  [/sound|wave|frequency/i, '🎵'],
  [/acid|base|chemical/i, '⚗️'],
  [/reaction|compound|solution/i, '🧪'],
  // Mathematics
  [/formula|equation|function/i, '📐'],
  [/graph|plot|curve/i, '📈'],
  [/area|volume|perimeter/i, '📏'],
  [/triangle|circle|square/i, '🔷'],
  [/fraction|decimal|ratio/i, '➗'],
  // Generic fallbacks by subject
  [/history|ancient|medieval/i, '📜'],
  [/science|physics|chemist|biolog/i, '🔬'],
  [/geograph|earth|map/i, '🌍'],
  [/math|algebra|geometry/i, '🔢'],
];

export const resolveStepIcon = (title: string, fallback?: string): string => {
  if (fallback && fallback.trim()) return fallback.trim();
  for (const [pattern, icon] of KEYWORD_ICON_MAP) {
    if (pattern.test(title)) return icon;
  }
  return '📌';
};

// ─────────────────────────────────────────────────────────────────────────────
// LOADING SKELETON
// ─────────────────────────────────────────────────────────────────────────────
export const VisualLearningLoading: React.FC = () => (
  <div className="space-y-5 animate-pulse">
    <div className="h-24 bg-gradient-to-r from-orange-50 to-purple-50 rounded-2xl border border-gray-100" />
    <div className="bg-white border border-gray-100 rounded-3xl p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gray-100" />
        <div className="h-4 bg-gray-100 rounded-lg w-48" />
        <div className="ml-auto h-8 bg-gray-100 rounded-full w-28" />
      </div>
      <div className="h-56 bg-gradient-to-br from-blue-50 to-white rounded-2xl border border-gray-100 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="text-3xl animate-spin-slow">⚙️</div>
          <p className="text-xs font-extrabold text-gray-400">Generating visual learning content…</p>
        </div>
      </div>
      <div className="h-20 bg-blue-50/40 rounded-2xl border border-blue-100" />
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// ERROR FALLBACK
// ─────────────────────────────────────────────────────────────────────────────
export const VisualLearningError: React.FC<{ message?: string }> = ({ message }) => (
  <div className="bg-red-50 border border-red-100 rounded-3xl p-8 text-center space-y-3">
    <AlertCircle className="mx-auto text-red-400" size={32} />
    <h4 className="font-extrabold text-sm text-red-700">Unable to Load Visuals</h4>
    <p className="text-xs text-red-500 font-semibold max-w-xs mx-auto leading-relaxed">
      {message || 'Visual content could not be generated for this homework. Try re-opening the explanation.'}
    </p>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// 1. PROCESS / DIAGRAM WIDGET  (e.g. Water Cycle, Photosynthesis)
//    ILLUSTRATED: large emoji nodes + title label; no plain numbers
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
      }, 3500);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isPlaying, steps.length]);

  if (!steps.length) return (
    <VisualLearningError message="No diagram steps were returned by the AI for this topic." />
  );

  const activeData = steps[activeStep];
  const activeIcon = resolveStepIcon(activeData?.title ?? '', activeData?.icon);

  // Colour palette for steps (cycles)
  const NODE_COLOURS = [
    { bg: 'bg-orange-100', ring: 'ring-orange-300', text: 'text-orange-700', active: 'bg-brand-orange text-white ring-brand-orange/30' },
    { bg: 'bg-blue-100',   ring: 'ring-blue-300',   text: 'text-blue-700',   active: 'bg-brand-blue text-white ring-brand-blue/30' },
    { bg: 'bg-green-100',  ring: 'ring-green-300',  text: 'text-green-700',  active: 'bg-brand-green text-white ring-brand-green/30' },
    { bg: 'bg-purple-100', ring: 'ring-purple-300', text: 'text-purple-700', active: 'bg-brand-purple text-white ring-brand-purple/30' },
    { bg: 'bg-amber-100',  ring: 'ring-amber-300',  text: 'text-amber-700',  active: 'bg-brand-amber text-white ring-brand-amber/30' },
    { bg: 'bg-teal-100',   ring: 'ring-teal-300',   text: 'text-teal-700',   active: 'bg-teal-500 text-white ring-teal-300/30' },
  ];

  return (
    <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h4 className="text-base font-extrabold text-gray-800 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-brand-orange animate-ping" />
            {title}
          </h4>
          <p className="text-xs text-gray-400 font-semibold mt-0.5">Click any stage node to inspect details</p>
        </div>
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-black text-white bg-brand-orange hover:bg-brand-orangeHover transition-all active:scale-95 cursor-pointer shadow-sm select-none"
        >
          {isPlaying ? <><Pause size={12} fill="white" /> Pause</> : <><Play size={12} fill="white" /> AutoPlay</>}
        </button>
      </div>

      {/* Visual Canvas */}
      <div className="relative h-72 bg-gradient-to-br from-blue-50/40 via-white to-purple-50/20 rounded-2xl border border-gray-100 overflow-hidden shadow-inner">
        {/* Grid dots */}
        <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1.5px,transparent_1.5px)] [background-size:22px_22px] opacity-50 pointer-events-none" />

        {/* SVG connector lines */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {steps.map((step: any, index: number) => {
            const next = steps[(index + 1) % steps.length];
            const isActive = activeStep === index;
            return (
              <line
                key={`line-${index}`}
                x1={`${step.x}%`} y1={`${step.y}%`}
                x2={`${next.x}%`} y2={`${next.y}%`}
                stroke={isActive ? '#FF6B35' : '#CBD5E1'}
                strokeWidth={isActive ? 2.5 : 1.5}
                strokeDasharray={isActive ? '7 5' : 'none'}
                style={{ transition: 'stroke 0.4s ease' }}
              />
            );
          })}
        </svg>

        {/* Illustrated Nodes */}
        {steps.map((step: any, index: number) => {
          const isActive = activeStep === index;
          const palette = NODE_COLOURS[index % NODE_COLOURS.length];
          const icon = resolveStepIcon(step.title ?? '', step.icon);
          const shortTitle = (step.title ?? '').split(' ').slice(0, 2).join(' ');

          return (
            <button
              key={`node-${index}`}
              onClick={() => { setActiveStep(index); setIsPlaying(false); }}
              style={{ left: `${step.x}%`, top: `${step.y}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 cursor-pointer select-none group z-10"
            >
              {/* Emoji node bubble */}
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-md transition-all duration-300 border-2 border-white
                ${isActive
                  ? 'bg-brand-orange ring-4 ring-brand-orange/25 scale-115 shadow-lg shadow-orange-200'
                  : `${palette.bg} ring-2 ${palette.ring} hover:scale-110 hover:shadow-md`
                }`}
              >
                {icon}
              </div>
              {/* Step title label */}
              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow-sm whitespace-nowrap max-w-[90px] truncate text-center
                ${isActive ? 'bg-brand-orange text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
              >
                {shortTitle}
              </span>
            </button>
          );
        })}

        {/* Loop hint */}
        <div className="absolute bottom-2.5 right-3 text-[10px] text-gray-400 font-extrabold flex items-center gap-1 select-none">
          <span>Looping Process</span>
          <RefreshCw size={10} className="animate-spin-slow" />
        </div>
      </div>

      {/* Active Step Detail Card */}
      <div className="bg-gradient-to-r from-orange-50 to-amber-50/30 border border-orange-100 rounded-2xl p-5 flex items-start gap-4 transition-all duration-300 shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-brand-orange text-white flex items-center justify-center shrink-0 text-2xl shadow-md">
          {activeIcon}
        </div>
        <div className="space-y-1.5 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h5 className="font-extrabold text-sm text-gray-800">{activeData?.title}</h5>
            <span className="text-[10px] bg-brand-orange/10 text-brand-orange border border-orange-200 px-2 py-0.5 rounded-full font-bold select-none">
              Stage {activeStep + 1} of {steps.length}
            </span>
          </div>
          <p className="text-xs text-gray-600 font-semibold leading-relaxed">
            {activeData?.description}
          </p>
        </div>
      </div>

      {/* Step navigation dots */}
      <div className="flex items-center justify-center gap-2 pt-1">
        {steps.map((_: any, i: number) => (
          <button
            key={i}
            onClick={() => { setActiveStep(i); setIsPlaying(false); }}
            className={`rounded-full transition-all cursor-pointer border-none outline-none
              ${i === activeStep ? 'w-6 h-2 bg-brand-orange' : 'w-2 h-2 bg-gray-200 hover:bg-gray-300'}`}
          />
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. INTERACTIVE MAP WIDGET
// ─────────────────────────────────────────────────────────────────────────────
export const MapWidget: React.FC<{ elements: any; title: string }> = ({ elements, title }) => {
  const locations = elements?.locations || [];
  const [selectedLoc, setSelectedLoc] = useState<any>(locations[0] || null);
  const [mapTheme, setMapTheme] = useState<'terrain' | 'political'>('terrain');

  if (!locations.length) return (
    <VisualLearningError message="No map locations were provided for this geography topic." />
  );

  return (
    <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h4 className="text-base font-extrabold text-gray-800 flex items-center gap-1.5">
            <Globe size={18} className="text-brand-purple" />
            {title}
          </h4>
          <p className="text-xs text-gray-500 font-semibold mt-0.5">Explore geographical places & regions</p>
        </div>
        <div className="bg-gray-100 p-0.5 rounded-full flex gap-0.5">
          {(['terrain', 'political'] as const).map((theme) => (
            <button key={theme} onClick={() => setMapTheme(theme)}
              className={`px-3 py-1 rounded-full text-[10px] font-black uppercase select-none transition cursor-pointer
                ${mapTheme === theme ? 'bg-brand-purple text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {theme}
            </button>
          ))}
        </div>
      </div>

      {/* Map board */}
      <div className={`relative h-64 rounded-2xl border border-gray-100 overflow-hidden shadow-inner transition-all duration-500
        ${mapTheme === 'terrain'
          ? 'bg-gradient-to-br from-teal-50 via-emerald-50/50 to-amber-50/40'
          : 'bg-gradient-to-br from-blue-50/80 via-slate-50 to-orange-50/30'
        }`}
      >
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#cbd5e1_1px,transparent_1px),linear-gradient(to_bottom,#cbd5e1_1px,transparent_1px)] bg-[size:30px_30px] opacity-15 pointer-events-none" />

        {mapTheme === 'terrain' && (
          <>
            <div className="absolute left-[10%] top-[20%] w-48 h-32 bg-emerald-100/50 rounded-full blur-xl" />
            <div className="absolute right-[15%] bottom-[10%] w-40 h-40 bg-yellow-100/50 rounded-full blur-2xl" />
          </>
        )}

        {/* Location pins with emoji */}
        {locations.map((loc: any, idx: number) => {
          const isSelected = selectedLoc?.label === loc.label;
          const icon = resolveStepIcon(loc.label ?? '', loc.icon);
          return (
            <button
              key={idx}
              onClick={() => setSelectedLoc(loc)}
              style={{ left: `${loc.x || 50}%`, top: `${loc.y || 50}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2 group cursor-pointer flex flex-col items-center gap-0.5 select-none"
            >
              {/* Tooltip */}
              <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-800 text-white text-[9px] font-bold py-1 px-2 rounded-lg shadow-md whitespace-nowrap z-20">
                {loc.label}
              </div>
              {/* Illustrated pin */}
              <div className={`w-9 h-9 rounded-2xl flex items-center justify-center text-xl shadow-md transition-all duration-300 border-2 border-white
                ${isSelected
                  ? 'bg-brand-purple ring-4 ring-brand-purple/20 scale-125 z-10 shadow-purple-200'
                  : 'bg-white hover:scale-110 hover:shadow-lg'
                }`}
              >
                {icon}
              </div>
              <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-full shadow-sm whitespace-nowrap
                ${isSelected ? 'bg-brand-purple text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
              >
                {(loc.label ?? '').split(' ')[0]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected info card */}
      {selectedLoc && (
        <div className="bg-brand-purpleLight/50 border border-brand-purpleBorder/30 rounded-2xl p-5 flex items-start gap-3.5 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-brand-purple text-white flex items-center justify-center text-xl shadow-md shrink-0">
            {resolveStepIcon(selectedLoc.label ?? '', selectedLoc.icon)}
          </div>
          <div className="space-y-1 flex-1">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h5 className="font-extrabold text-sm text-gray-800">{selectedLoc.label}</h5>
              <span className="text-[10px] text-brand-purple font-extrabold select-none">
                Position: {selectedLoc.x}%, {selectedLoc.y}%
              </span>
            </div>
            <p className="text-xs text-gray-600 font-semibold leading-relaxed">{selectedLoc.description}</p>
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. HISTORY TIMELINE WIDGET
// ─────────────────────────────────────────────────────────────────────────────
export const TimelineWidget: React.FC<{ elements: any; title: string }> = ({ elements, title }) => {
  const events = elements?.events || [];
  const [importanceFilter, setImportanceFilter] = useState<'all' | 'high'>('all');
  const [selectedEventIndex, setSelectedEventIndex] = useState<number>(0);

  const filteredEvents = events.filter((ev: any) =>
    importanceFilter === 'all' || ev.importance?.toLowerCase() === 'high'
  );
  const selectedEvent = filteredEvents[selectedEventIndex] || filteredEvents[0];

  if (!events.length) return (
    <VisualLearningError message="No timeline events were generated for this history topic." />
  );

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
        <div className="bg-gray-100 p-0.5 rounded-full flex gap-0.5 self-start sm:self-auto">
          <button onClick={() => { setImportanceFilter('all'); setSelectedEventIndex(0); }}
            className={`px-3 py-1 rounded-full text-[10px] font-black uppercase transition cursor-pointer select-none
              ${importanceFilter === 'all' ? 'bg-brand-purple text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >All Events</button>
          <button onClick={() => { setImportanceFilter('high'); setSelectedEventIndex(0); }}
            className={`px-3 py-1 rounded-full text-[10px] font-black uppercase transition cursor-pointer select-none
              ${importanceFilter === 'high' ? 'bg-brand-purple text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >🔥 Critical</button>
        </div>
      </div>

      {/* Horizontal timeline track */}
      <div className="relative border border-gray-100 rounded-2xl p-5 overflow-x-auto bg-gray-50/50">
        <div className="absolute left-6 right-6 top-[44%] h-0.5 bg-gray-200 pointer-events-none" />
        <div className="flex items-center justify-between min-w-[500px] gap-6 px-4 py-3">
          {filteredEvents.map((ev: any, idx: number) => {
            const isSelected = selectedEvent?.title === ev.title;
            const isHigh = ev.importance?.toLowerCase() === 'high';
            const icon = resolveStepIcon(ev.title ?? '', ev.icon);
            return (
              <button
                key={idx}
                onClick={() => setSelectedEventIndex(idx)}
                className="relative z-10 flex flex-col items-center select-none cursor-pointer focus:outline-none shrink-0 group"
              >
                {/* Period badge */}
                <div className={`text-[10px] font-black mb-3 px-2.5 py-0.5 rounded-full border transition-all duration-300
                  ${isSelected ? 'bg-brand-purple text-white border-brand-purple shadow-sm' : 'bg-white border-gray-200 text-gray-500'}`}
                >
                  {ev.period}
                </div>
                {/* Illustrated node */}
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl border-2 border-white shadow-md transition-all duration-300
                  ${isSelected
                    ? 'bg-brand-purple ring-4 ring-brand-purple/20 scale-120 shadow-purple-200'
                    : isHigh ? 'bg-orange-100 ring-2 ring-orange-200 hover:scale-110' : 'bg-gray-100 hover:scale-110'
                  }`}
                >
                  {icon}
                </div>
                {/* Title label */}
                <div className={`text-[11px] font-extrabold mt-2 tracking-tight max-w-[100px] text-center truncate
                  ${isSelected ? 'text-brand-purple font-black' : 'text-gray-600'}`}
                >
                  {ev.title}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected event detail */}
      {selectedEvent && (
        <div className="bg-brand-purpleLight/40 border border-brand-purpleBorder/30 rounded-2xl p-5 shadow-sm space-y-2 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-brand-purple text-white flex items-center justify-center text-xl shadow-md shrink-0">
            {resolveStepIcon(selectedEvent.title ?? '', selectedEvent.icon)}
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <h5 className="font-extrabold text-sm text-gray-800">{selectedEvent.title}</h5>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-extrabold bg-brand-purple/10 text-brand-purpleDark px-2.5 py-0.5 rounded-full border border-brand-purpleBorder select-none">
                  ⏳ {selectedEvent.period}
                </span>
                {selectedEvent.importance && (
                  <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full select-none
                    ${selectedEvent.importance.toLowerCase() === 'high'
                      ? 'bg-red-50 text-red-600 border border-red-200'
                      : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {selectedEvent.importance} Priority
                  </span>
                )}
              </div>
            </div>
            <p className="text-xs text-gray-600 font-semibold leading-relaxed">{selectedEvent.description}</p>
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. COMPARISON WIDGET
// ─────────────────────────────────────────────────────────────────────────────
export const ComparisonWidget: React.FC<{ elements: any; title: string }> = ({ elements, title }) => {
  const headers = elements?.headers || [];
  const rows = elements?.rows || [];
  const [activeTabIdx, setActiveTabIdx] = useState<number>(0);

  if (!rows.length) return (
    <VisualLearningError message="No comparison data was generated for this topic." />
  );

  const conceptColumns = headers.slice(1);

  return (
    <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm space-y-6">
      <div>
        <h4 className="text-base font-extrabold text-gray-800 flex items-center gap-1.5">
          <Layers size={18} className="text-brand-orange" />
          {title}
        </h4>
        <p className="text-xs text-gray-500 font-semibold mt-0.5">Differentiate and contrast key educational concepts</p>
      </div>

      {/* Mobile tab switcher */}
      <div className="flex md:hidden bg-gray-100 p-0.5 rounded-full gap-0.5">
        {conceptColumns.map((col: string, idx: number) => (
          <button key={idx} onClick={() => setActiveTabIdx(idx)}
            className={`flex-1 py-2 text-center rounded-full text-xs font-black select-none cursor-pointer transition
              ${activeTabIdx === idx ? 'bg-brand-orange text-white shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}
          >
            {col}
          </button>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-hidden rounded-2xl border border-gray-100 shadow-sm">
        <table className="min-w-full divide-y divide-gray-100 text-left">
          <thead className="bg-gray-50">
            <tr>
              {headers.map((hdr: string, idx: number) => (
                <th key={idx} className="px-5 py-3.5 text-xs font-black text-gray-500 uppercase tracking-wider select-none">
                  {hdr}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-50 text-xs text-gray-600 font-semibold">
            {rows.map((row: any, rowIdx: number) => (
              <tr key={rowIdx} className="hover:bg-gray-50/40 transition">
                <td className="px-5 py-4 font-extrabold text-gray-800 bg-gray-50/20 select-none">{row.attribute}</td>
                {row.values?.map((val: string, valIdx: number) => (
                  <td key={valIdx} className="px-5 py-4 leading-relaxed">{val}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card view */}
      <div className="block md:hidden space-y-4 animate-[slideUp_0.15s_ease-out]">
        <div className="bg-brand-amberLight border-2 border-brand-amberBorder/60 rounded-2xl p-5 shadow-sm space-y-4">
          <h5 className="font-extrabold text-sm text-brand-orange border-b border-brand-amberBorder/30 pb-2.5">
            {conceptColumns[activeTabIdx]}
          </h5>
          <div className="space-y-4 divide-y divide-gray-100">
            {rows.map((row: any, idx: number) => (
              <div key={idx} className={`${idx > 0 ? 'pt-3' : ''} space-y-1`}>
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider select-none">{row.attribute}</div>
                <div className="text-xs text-gray-700 font-semibold leading-relaxed">{row.values?.[activeTabIdx] || '-'}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. LABELED HOTSPOT VISUAL (e.g. Science Heart anatomy, Plant cell)
//    ILLUSTRATED: emoji hotspot markers
// ─────────────────────────────────────────────────────────────────────────────
export const LabeledVisualWidget: React.FC<{ elements: any; title: string }> = ({ elements, title }) => {
  const hotspots = elements?.hotspots || [];
  const [activeSpot, setActiveSpot] = useState<any>(hotspots[0] || null);

  if (!hotspots.length) return (
    <VisualLearningError message="No anatomy or structure hotspots were generated for this topic." />
  );

  return (
    <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm space-y-6">
      <div>
        <h4 className="text-base font-extrabold text-gray-800 flex items-center gap-1.5">
          <BookOpen size={18} className="text-brand-green" />
          {title}
        </h4>
        <p className="text-xs text-gray-500 font-semibold mt-0.5">Interact with diagram hotspots to learn components</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Hotspot canvas */}
        <div className="lg:col-span-7 relative h-72 bg-gradient-to-br from-brand-greenLight/20 via-white to-gray-50 border border-gray-100 rounded-2xl overflow-hidden shadow-inner flex items-center justify-center select-none">
          <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1.2px,transparent_1.2px)] [background-size:16px_16px] opacity-40 pointer-events-none" />

          {/* Schematic background shape */}
          <div className="relative w-44 h-44 rounded-full bg-brand-greenLight border-4 border-brand-greenBorder flex items-center justify-center opacity-60">
            <div className="w-24 h-24 rounded-full bg-white/80 border-2 border-brand-green/30 flex items-center justify-center text-4xl">
              🔬
            </div>
            <div className="absolute inset-0 border-t-2 border-dashed border-brand-greenBorder/40" style={{top: '50%'}} />
          </div>

          {/* Illustrated hotspots */}
          {hotspots.map((spot: any, idx: number) => {
            const isSelected = activeSpot?.label === spot.label;
            const icon = resolveStepIcon(spot.label ?? '', spot.icon);
            return (
              <button
                key={idx}
                onClick={() => setActiveSpot(spot)}
                style={{ left: `${spot.x || 50}%`, top: `${spot.y || 50}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer focus:outline-none flex flex-col items-center gap-0.5 z-10"
              >
                {/* Outer ping */}
                <span className={`absolute inline-flex h-10 w-10 rounded-full opacity-40 animate-ping
                  ${isSelected ? 'bg-brand-green' : 'bg-brand-green/40'}`}
                />
                {/* Emoji node */}
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg shadow-md border-2 border-white transition-all duration-300
                  ${isSelected
                    ? 'bg-brand-greenDark ring-4 ring-brand-green/20 scale-115 shadow-green-200'
                    : 'bg-brand-green hover:bg-brand-greenDark hover:scale-110'
                  }`}
                >
                  {icon}
                </div>
                <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-full shadow-sm whitespace-nowrap
                  ${isSelected ? 'bg-brand-greenDark text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
                >
                  {idx + 1}
                </span>
              </button>
            );
          })}
        </div>

        {/* Hotspot list */}
        <div className="lg:col-span-5 space-y-4 flex flex-col justify-center">
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {hotspots.map((spot: any, idx: number) => {
              const isSelected = activeSpot?.label === spot.label;
              const icon = resolveStepIcon(spot.label ?? '', spot.icon);
              return (
                <button
                  key={idx}
                  onClick={() => setActiveSpot(spot)}
                  className={`w-full text-left px-4 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-3 transition cursor-pointer select-none
                    ${isSelected
                      ? 'border-brand-green bg-brand-greenLight text-brand-greenDark font-extrabold shadow-sm'
                      : 'border-gray-100 hover:border-gray-200 text-gray-600 bg-white'
                    }`}
                >
                  <span className="text-base shrink-0">{icon}</span>
                  <span className="truncate">{spot.label}</span>
                </button>
              );
            })}
          </div>

          {activeSpot && (
            <div className="bg-brand-greenLight/30 border border-brand-greenBorder/30 rounded-2xl p-4 shadow-sm space-y-1.5 animate-[fadeIn_0.15s_ease-out]">
              <h6 className="font-extrabold text-xs text-brand-greenDark uppercase tracking-wider flex items-center gap-1.5">
                <Award size={13} />
                {activeSpot.label}
              </h6>
              <p className="text-xs text-gray-600 font-semibold leading-relaxed">{activeSpot.description}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. MATH FORMULA & GRAPHING WIDGET
// ─────────────────────────────────────────────────────────────────────────────
export const MathFormulaWidget: React.FC<{ elements: any; title: string }> = ({ elements, title }) => {
  const latex = elements?.latex || 'f(x) = ax² + bx + c';
  const variables = elements?.variables || [];
  const plottingExpression = elements?.plottingExpression || 'a * x * x';
  const xRange = elements?.xRange || [-10, 10];
  const yRange = elements?.yRange || [-10, 10];

  const [params, setParams] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    variables.forEach((v: any) => { initial[v.symbol] = typeof v.default === 'number' ? v.default : 1; });
    if (!variables.length) { initial['a'] = 1; initial['b'] = 0; initial['c'] = 0; }
    return initial;
  });

  const evalY = (x: number): number => {
    try {
      const a = params['a'] ?? 0, b = params['b'] ?? 0, c = params['c'] ?? 0;
      const expr = plottingExpression
        .replace(/\ba\b/g, String(a))
        .replace(/\bb\b/g, String(b))
        .replace(/\bc\b/g, String(c))
        .replace(/\bx\b/g, String(x));
      return Function(`"use strict"; return (${expr})`)();
    } catch { return 0; }
  };

  const width = 300, height = 220, pad = 22;
  const mapX = (v: number) => pad + ((v - xRange[0]) / (xRange[1] - xRange[0])) * (width - 2 * pad);
  const mapY = (v: number) => height - pad - ((v - yRange[0]) / (yRange[1] - yRange[0])) * (height - 2 * pad);

  const gridLinesX = Array.from({ length: 11 }, (_, i) => xRange[0] + i * (xRange[1] - xRange[0]) / 10);
  const gridLinesY = Array.from({ length: 11 }, (_, i) => yRange[0] + i * (yRange[1] - yRange[0]) / 10);

  const points: { x: number; y: number }[] = [];
  const dx = (xRange[1] - xRange[0]) / 80;
  for (let i = 0; i <= 80; i++) {
    const x = xRange[0] + i * dx;
    const y = evalY(x);
    if (!isNaN(y) && isFinite(y)) points.push({ x: mapX(x), y: mapY(y) });
  }
  const dAttr = points.length > 0
    ? `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
    : '';

  const activeSymbols = variables.length ? variables : [
    { symbol: 'a', name: 'Quadratic (a)', min: -3, max: 3, default: 1 },
    { symbol: 'b', name: 'Linear (b)', min: -5, max: 5, default: 0 },
    { symbol: 'c', name: 'Constant (c)', min: -5, max: 5, default: 0 },
  ];

  return (
    <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-base font-extrabold text-gray-800 flex items-center gap-1.5">
            <Sliders size={18} className="text-brand-blue" />
            {title}
          </h4>
          <p className="text-xs text-gray-500 font-semibold mt-0.5">Adjust sliders to plot the equation in real time</p>
        </div>
        <div className="text-3xl select-none">📊</div>
      </div>

      {/* Formula display */}
      <div className="bg-brand-blueLight/30 border border-brand-blueBorder/30 rounded-2xl p-4 text-center shadow-inner relative overflow-hidden select-all">
        <span className="absolute left-3 top-2.5 text-[8px] uppercase tracking-wider font-extrabold text-brand-blueDark opacity-60">Formula</span>
        <div className="font-poppins text-base font-bold text-brand-blueDark tracking-wide select-text">{latex}</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
        {/* SVG graph */}
        <div className="md:col-span-6 flex justify-center bg-gray-50 border border-gray-100 rounded-2xl p-3 relative shadow-inner overflow-hidden select-none">
          <svg width={width} height={height} className="overflow-visible">
            {gridLinesX.map((gX, i) => (
              <line key={`gx-${i}`} x1={mapX(gX)} y1={pad} x2={mapX(gX)} y2={height - pad} stroke="#e2e8f0" strokeWidth={0.7} />
            ))}
            {gridLinesY.map((gY, i) => (
              <line key={`gy-${i}`} x1={pad} y1={mapY(gY)} x2={width - pad} y2={mapY(gY)} stroke="#e2e8f0" strokeWidth={0.7} />
            ))}
            {xRange[0] <= 0 && xRange[1] >= 0 && (
              <line x1={mapX(0)} y1={pad} x2={mapX(0)} y2={height - pad} stroke="#94a3b8" strokeWidth={1.5} />
            )}
            {yRange[0] <= 0 && yRange[1] >= 0 && (
              <line x1={pad} y1={mapY(0)} x2={width - pad} y2={mapY(0)} stroke="#94a3b8" strokeWidth={1.5} />
            )}
            {dAttr && (
              <path d={dAttr} fill="none" stroke="#2196F3" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="transition-all duration-150" />
            )}
          </svg>
          <div className="absolute top-2 right-2.5 text-[8.5px] bg-white border border-gray-100 font-extrabold text-gray-500 rounded px-1.5 py-0.5 select-none shadow-sm">
            Interactive Plot
          </div>
        </div>

        {/* Sliders */}
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
                  onChange={(e) => setParams(prev => ({ ...prev, [sym]: parseFloat(e.target.value) }))}
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

export const VisualLearningContainer: React.FC<WidgetProps> = ({ data }) => {
  const { title, description, visualType, elements } = data;

  // Guard: if elements is missing or empty, show an error
  const hasContent = elements && (
    elements.steps?.length ||
    elements.locations?.length ||
    elements.events?.length ||
    elements.rows?.length ||
    elements.hotspots?.length ||
    elements.latex
  );

  const renderWidget = () => {
    if (!hasContent) return <VisualLearningError />;
    switch (visualType) {
      case 'diagram':       return <DiagramWidget elements={elements} title={title} />;
      case 'map':           return <MapWidget elements={elements} title={title} />;
      case 'timeline':      return <TimelineWidget elements={elements} title={title} />;
      case 'comparison':    return <ComparisonWidget elements={elements} title={title} />;
      case 'labeled_visual': return <LabeledVisualWidget elements={elements} title={title} />;
      case 'math_formula':  return <MathFormulaWidget elements={elements} title={title} />;
      default:              return <ComparisonWidget elements={elements} title={title} />;
    }
  };

  return (
    <div className="space-y-5 animate-[fadeIn_0.2s_ease-out]">
      {/* AI header banner */}
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
            {description || 'Tap, explore, and interact with the visual below to understand this topic deeply.'}
          </p>
        </div>
      </div>

      {/* Main widget */}
      {renderWidget()}
    </div>
  );
};

export default VisualLearningContainer;
