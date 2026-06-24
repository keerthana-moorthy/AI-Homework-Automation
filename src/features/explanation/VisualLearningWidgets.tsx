import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, MapPin, Calendar, GitBranch, Image as ImageIcon, Sliders } from 'lucide-react';
import mermaid from 'mermaid';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix leaflet default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

mermaid.initialize({ startOnLoad: false, theme: 'default' });

export const VisualLearningLoading: React.FC = () => (
  <div className="space-y-5 animate-pulse">
    <div className="h-24 bg-gradient-to-r from-orange-50 to-purple-50 rounded-2xl border border-gray-100" />
    <div className="bg-white border border-gray-100 rounded-3xl p-6 space-y-4">
      <div className="h-56 bg-gradient-to-br from-blue-50 to-white rounded-2xl border border-gray-100 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="text-3xl animate-spin-slow">⚙️</div>
          <p className="text-xs font-extrabold text-gray-400">Generating dynamic visualization…</p>
        </div>
      </div>
    </div>
  </div>
);

export const VisualLearningError: React.FC<{ message?: string }> = ({ message }) => (
  <div className="bg-red-50 border border-red-100 rounded-3xl p-8 text-center space-y-3">
    <AlertCircle className="mx-auto text-red-400" size={32} />
    <h4 className="font-extrabold text-sm text-red-700">Unable to Load Visuals</h4>
    <p className="text-xs text-red-500 font-semibold max-w-xs mx-auto leading-relaxed">
      {message || 'Visual content could not be generated for this homework context.'}
    </p>
  </div>
);

const MermaidWidget: React.FC<{ payload: any }> = ({ payload }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const code = payload?.code || 'graph TD; A[No Data]';
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (containerRef.current) {
      setError(null);
      containerRef.current.innerHTML = '';
      mermaid.render(`mermaid-${Date.now()}`, code)
        .then(({ svg }) => {
          if (isMounted && containerRef.current) {
            containerRef.current.innerHTML = svg;
          }
        })
        .catch((e) => {
          console.error("Mermaid error:", e);
          if (isMounted) setError("Failed to render diagram. The AI generated invalid flowchart syntax.");
        });
    }
    return () => { isMounted = false; };
  }, [code]);

  return (
    <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm space-y-4">
      <h4 className="font-extrabold text-gray-800 flex items-center gap-2"><GitBranch size={18}/> Flowchart / Diagram (Mermaid)</h4>
      {error ? <VisualLearningError message={error} /> : <div ref={containerRef} className="overflow-auto flex justify-center py-4" />}
    </div>
  );
};

const OpenStreetMapWidget: React.FC<{ payload: any }> = ({ payload }) => {
  const center = payload?.center || [0, 0];
  const zoom = payload?.zoom || 2;
  const markers = payload?.markers || [];

  return (
    <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm space-y-4">
      <h4 className="font-extrabold text-gray-800 flex items-center gap-2"><MapPin size={18}/> Interactive Map</h4>
      <div className="h-80 rounded-2xl overflow-hidden border border-gray-200">
        <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/">OSM</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {markers.map((m: any, i: number) => (
            <Marker key={i} position={m.position}>
              <Popup>{m.label}<br/>{m.description}</Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
};

const TimelineJSWidget: React.FC<{ payload: any }> = ({ payload }) => {
  const events = payload?.events || [];
  return (
    <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm space-y-4">
      <h4 className="font-extrabold text-gray-800 flex items-center gap-2"><Calendar size={18}/> Timeline</h4>
      <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
        {events.map((ev: any, idx: number) => (
          <div key={idx} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
            <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-slate-300 group-[.is-active]:bg-brand-purple text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
              <Calendar size={16} />
            </div>
            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-slate-200 bg-white shadow">
              <div className="flex items-center justify-between space-x-2 mb-1">
                <div className="font-bold text-brand-purple">{ev.year}</div>
              </div>
              <div className="text-slate-700 font-extrabold mb-1">{ev.title}</div>
              <div className="text-slate-500 text-xs">{ev.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const MathWidget: React.FC<{ payload: any }> = ({ payload }) => {
  const expression = payload?.expression || '';
  return (
    <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm space-y-4">
      <h4 className="font-extrabold text-gray-800 flex items-center gap-2"><Sliders size={18}/> Interactive Graph (Desmos)</h4>
      <p className="text-xs text-gray-500 font-semibold mb-2">{payload?.description}</p>
      <div className="h-80 rounded-2xl overflow-hidden border border-gray-200 relative">
        <iframe 
           src="https://www.desmos.com/calculator"
           title="Desmos Graph"
           width="100%"
           height="100%"
           style={{ border: 0 }}
        />
      </div>
      <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">Expression mapped from homework: <strong>{expression}</strong>. (Enter this in the calculator to plot).</div>
    </div>
  );
};

const AIImagePlaceholderWidget: React.FC<{ payload: any }> = ({ payload }) => {
  return (
    <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm space-y-4">
      <h4 className="font-extrabold text-gray-800 flex items-center gap-2"><ImageIcon size={18}/> AI Visual Generation</h4>
      <div className="bg-brand-greenLight/30 border border-brand-greenBorder p-6 rounded-2xl text-center space-y-3">
        <div className="text-4xl">🤖🖼️</div>
        <h5 className="font-bold text-gray-700">Image Generation API Pending</h5>
        <p className="text-xs text-gray-600">The architecture is ready to plug in an AI image generation model (e.g. DALL-E, Midjourney) for highly accurate educational diagrams.</p>
        <div className="text-left bg-white p-4 rounded-xl border border-gray-100 text-xs text-gray-500 mt-4">
          <p className="font-bold mb-1 text-gray-800">Generated Prompt:</p>
          <code className="text-[10px] break-words">{payload?.prompt || 'No prompt generated.'}</code>
        </div>
      </div>
    </div>
  );
};

export const VisualLearningContainer: React.FC<{ data: any }> = ({ data }) => {
  if (!data || !data.tool) return <VisualLearningError message="Invalid visualization schema received or no visualization available for this homework." />;

  const { tool, subject, topic, payload } = data;

  return (
    <div className="space-y-4 animate-[fadeIn_0.15s_ease-out]">
      <div className="bg-brand-purpleLight/30 border border-brand-purple/20 p-4 rounded-2xl">
        <div className="text-xs font-black text-brand-purple uppercase tracking-wider mb-1">Homework Context Isolation</div>
        <div className="text-sm font-bold text-gray-800">Detected Subject: {subject}</div>
        <div className="text-sm text-gray-600">Extracted Topic: {topic}</div>
      </div>

      {tool === 'mermaid' && <MermaidWidget payload={payload} />}
      {tool === 'openstreetmap' && <OpenStreetMapWidget payload={payload} />}
      {tool === 'timelinejs' && <TimelineJSWidget payload={payload} />}
      {tool === 'geogebra' && <MathWidget payload={payload} />}
      {tool === 'ai_image' && <AIImagePlaceholderWidget payload={payload} />}
      
      {/* Fallback for unknown tools */}
      {!['mermaid', 'openstreetmap', 'timelinejs', 'geogebra', 'ai_image'].includes(tool) && (
        <VisualLearningError message={`The dynamic routing selected tool "${tool}", but the frontend renderer is missing.`} />
      )}
    </div>
  );
};

export default VisualLearningContainer;
