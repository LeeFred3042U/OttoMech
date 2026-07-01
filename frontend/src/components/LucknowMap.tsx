import React, { useEffect, useState, useRef } from 'react';
import { Garage, Coords } from '../types';
import { Compass, Navigation2, MapPin, Wrench } from 'lucide-react';

interface LucknowMapProps {
  driverCoords: Coords;
  driverAddress: string;
  selectedMechanic: Garage | null;
  isDispatching: boolean;
  onArrived?: () => void;
  isOffline?: boolean;
  isDark?: boolean;
}

export default function LucknowMap({
  driverCoords,
  driverAddress,
  selectedMechanic,
  isDispatching,
  onArrived,
  isOffline = false,
  isDark = true
}: LucknowMapProps) {
  const [mechanicProgress, setMechanicProgress] = useState(0); // 0 to 100%
  const [animating, setAnimating] = useState(false);
  const animationRef = useRef<number | null>(null);

  // Seeded Lucknow locations for map overlays
  const overlayLocations = [
    { name: "Hazratganj", x: 120, y: 190 },
    { name: "Lalbagh (Hub)", x: 100, y: 150 },
    { name: "Gomti Nagar", x: 240, y: 180 },
    { name: "Indira Nagar", x: 210, y: 90 },
    { name: "Chinhat Intersection", x: 340, y: 110 },
    { name: "Transport Nagar", x: 60, y: 310 },
    { name: "Alambagh Metro", x: 80, y: 240 },
  ];

  // Helper to map lat/long relative offsets inside Lucknow onto a 400x400 map box
  const getMapXY = (lat: number, lng: number) => {
    const minLat = 26.75;
    const maxLat = 26.92;
    const minLng = 80.85;
    const maxLng = 81.06;

    const normalizedY = (lat - minLat) / (maxLat - minLat); // 0 at south, 1 at north
    const normalizedX = (lng - minLng) / (maxLng - minLng); // 0 at west, 1 at east

    const x = 30 + normalizedX * 340;
    const y = 370 - normalizedY * 340; 

    return { x: Math.round(x), y: Math.round(y) };
  };

  const driverXY = getMapXY(driverCoords.lat, driverCoords.lng);
  const mechanicXY = selectedMechanic 
    ? getMapXY(selectedMechanic.lat, selectedMechanic.lng)
    : { x: driverXY.x - 60, y: driverXY.y + 70 }; // fallback starting point

  // Linear interpolation for animating the mechanic pin
  const currentMechX = mechanicXY.x + (driverXY.x - mechanicXY.x) * (mechanicProgress / 100);
  const currentMechY = mechanicXY.y + (driverXY.y - mechanicXY.y) * (mechanicProgress / 100);

  // Dispatch progress animation
  useEffect(() => {
    if (isDispatching && selectedMechanic) {
      setAnimating(true);
      setMechanicProgress(0);
      
      const startTime = Date.now();
      const duration = 25000; // 25 seconds simulation crawl to arrive

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min((elapsed / duration) * 100, 100);
        
        setMechanicProgress(progress);

        if (progress < 100) {
          animationRef.current = requestAnimationFrame(animate);
        } else {
          setAnimating(false);
          if (onArrived) {
            onArrived();
          }
        }
      };

      animationRef.current = requestAnimationFrame(animate);
    } else {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      setMechanicProgress(0);
      setAnimating(false);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isDispatching, selectedMechanic]);

  // Theme-specific colors
  const mapBg = isDark ? 'bg-slate-950 border-slate-800' : 'bg-blue-50/20 border-slate-200';
  const gridColor = isDark ? 'rgba(37,99,235,0.04)' : 'rgba(37,99,235,0.03)';
  const roadStrokeBase = isDark ? '#1e293b' : '#e2e8f0';
  const roadStrokeMid = isDark ? '#334155' : '#cbd5e1';
  const riverColor = isDark ? '#1d3557' : '#bfdbfe';
  const riverBorder = isDark ? '#457b9d' : '#93c5fd';
  const labelColor = isDark ? '#94a3b8' : '#64748b';
  const labelDotColor = isDark ? '#475569' : '#94a3b8';
  const hudBg = isDark ? 'bg-slate-900/95 border-slate-800/80' : 'bg-white/95 border-slate-200';

  return (
    <div className={`relative w-full h-[240px] border rounded-2xl overflow-hidden shadow-inner flex flex-col transition-all duration-300 ${mapBg}`}>
      
      {/* Grid Canvas Overlay */}
      <div 
        className="absolute inset-0 pointer-events-none" 
        style={{
          backgroundImage: `linear-gradient(${gridColor} 1px, transparent 1px), linear-gradient(90deg, ${gridColor} 1px, transparent 1px)`,
          backgroundSize: '16px 16px'
        }}
      />

      {/* Connection Mode Indicator (Top Bar inside map) */}
      <div className="absolute top-2 left-2 right-2 z-10 flex justify-between items-center pointer-events-none">
        <div className={`px-2 py-0.5 rounded text-[9px] font-mono font-semibold flex items-center gap-1 uppercase tracking-wider shadow ${
          isOffline 
            ? 'bg-amber-950/90 text-amber-400 border border-amber-800/60' 
            : isDark 
              ? 'bg-emerald-950/90 text-emerald-400 border border-emerald-800/60'
              : 'bg-emerald-50/95 text-emerald-700 border border-emerald-200'
        }`}>
          <div className={`w-1.5 h-1.5 rounded-full ${isOffline ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500 animate-pulse'}`} />
          {isOffline ? 'Offline LUCKNOW Cache' : 'Live Tracking GPS'}
        </div>

        <div className={`border px-1.5 py-0.5 rounded text-[8px] font-mono flex items-center gap-1 ${
          isDark ? 'bg-slate-900/90 text-slate-400 border-slate-800' : 'bg-white/90 text-slate-600 border-slate-200'
        }`}>
          <Compass className="w-3 h-3 text-[#2563eb] animate-spin-slow" />
          UP-32 SECTOR
        </div>
      </div>

      {/* SVG Map Layout */}
      <svg className="w-full h-full" viewBox="0 0 400 400">
        
        {/* Core Lucknow Highways & Connecting Roads */}
        {/* NH-27 (Faizabad Road going out northeast) */}
        <path 
          d="M 50 180 Q 150 150 200 110 T 380 90" 
          stroke={roadStrokeBase} 
          strokeWidth="8" 
          fill="none" 
          strokeLinecap="round" 
        />
        <path 
          d="M 50 180 Q 150 150 200 110 T 380 90" 
          stroke={roadStrokeMid} 
          strokeWidth="2" 
          strokeDasharray="4 4" 
          fill="none" 
          strokeLinecap="round" 
        />
        <text x="310" y="80" fill={labelColor} className="text-[10px] font-mono font-semibold uppercase tracking-wider" opacity="0.6">NH-27</text>

        {/* NH-30 (Kanpur Road going southwest) */}
        <path 
          d="M 30 280 L 120 220 L 160 170" 
          stroke={roadStrokeBase} 
          strokeWidth="6" 
          fill="none" 
          strokeLinecap="round" 
        />
        <path 
          d="M 30 280 L 120 220 L 160 170" 
          stroke="#2563eb" 
          strokeWidth="1.5" 
          opacity="0.3" 
          fill="none" 
          strokeLinecap="round" 
        />
        <text x="35" y="295" fill={labelColor} className="text-[10px] font-mono font-semibold uppercase tracking-wider" opacity="0.6">NH-30</text>

        {/* Outer Ring Road Link */}
        <path 
          d="M 380 90 L 370 280 Q 250 360 80 280" 
          stroke={isDark ? '#0f172a' : '#f1f5f9'} 
          strokeWidth="5" 
          fill="none" 
          strokeLinecap="round" 
        />

        {/* Sector Grid lines and River Gomti Curve */}
        <path 
          d="M 30 350 C 130 310, 180 210, 260 140 C 310 90, 350 40, 390 30" 
          stroke={riverColor} 
          strokeWidth="12" 
          fill="none" 
          opacity={isDark ? "0.4" : "0.6"} 
          strokeLinecap="round" 
        />
        <path 
          d="M 30 350 C 130 310, 180 210, 260 140 C 310 90, 350 40, 390 30" 
          stroke={riverBorder} 
          strokeWidth="1" 
          fill="none" 
          opacity="0.3" 
        />
        <text x="250" y="125" fill={isDark ? '#38bdf8' : '#2563eb'} className="text-[8px] font-sans italic" opacity="0.5">Gomti River</text>

        {/* City Neighborhood Seeded Label Pins */}
        {overlayLocations.map((loc, idx) => (
          <g key={idx} opacity={isDark ? "0.35" : "0.6"}>
            <circle cx={loc.x} cy={loc.y} r="3" fill={labelDotColor} />
            <text x={loc.x + 6} y={loc.y + 3} fill={labelColor} className="text-[9px] font-mono font-light select-none">{loc.name}</text>
          </g>
        ))}

        {/* Seeded Offline Mechanics (Standby dots shown on offline map) */}
        {isOffline && (
          <g opacity="0.6">
            <circle cx="210" cy="110" r="4" fill="#2563eb" className="animate-pulse" />
            <circle cx="95" cy="160" r="4" fill="#2563eb" />
            <circle cx="75" cy="250" r="4" fill="#2563eb" />
          </g>
        )}

        {/* --- DYNAMIC TRACKING ROUTE --- */}
        {selectedMechanic && (
          <>
            {/* Pulsating route path from garage to driver */}
            <path 
              d={`M ${mechanicXY.x} ${mechanicXY.y} L ${driverXY.x} ${driverXY.y}`} 
              stroke="#2563eb" 
              strokeWidth="3.5" 
              strokeLinecap="round" 
              opacity="0.4" 
              fill="none"
            />
            <path 
              d={`M ${mechanicXY.x} ${mechanicXY.y} L ${driverXY.x} ${driverXY.y}`} 
              stroke="#60a5fa" 
              strokeWidth="2" 
              strokeDasharray="6 4" 
              strokeLinecap="round" 
              fill="none"
              className="animate-[dash_2s_linear_infinite]"
              style={{
                strokeDashoffset: animating ? undefined : 0
              }}
            />

            {/* Garage Base Marker */}
            <g transform={`translate(${mechanicXY.x - 8}, ${mechanicXY.y - 8})`}>
              <circle cx="8" cy="8" r="8" fill={isDark ? "#1e293b" : "#f8fafc"} stroke="#2563eb" strokeWidth="1" />
              <Wrench className="w-3 h-3 text-[#2563eb] absolute inset-0 m-auto" style={{ transform: 'translate(2px, 2px)' }} />
            </g>
          </>
        )}

        {/* Stranded Driver Marker */}
        <g transform={`translate(${driverXY.x - 12}, ${driverXY.y - 24})`}>
          <circle cx="12" cy="12" r="12" fill="#ef4444" opacity="0.25" className="animate-ping origin-center" style={{ transformOrigin: '12px 12px' }} />
          <circle cx="12" cy="12" r="6" fill="#ef4444" opacity="0.4" className="animate-pulse origin-center" style={{ transformOrigin: '12px 12px' }} />
          {/* Map Pin */}
          <path 
            d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" 
            fill="#ef4444" 
          />
          <circle cx="12" cy="9" r="3.5" fill="#020617" />
        </g>

        {/* Dynamic Approaching Mechanic Pin */}
        {selectedMechanic && (
          <g transform={`translate(${currentMechX - 10}, ${currentMechY - 10})`}>
            {/* Glowing tracker ring */}
            <circle cx="10" cy="10" r="14" fill="#2563eb" opacity="0.2" className="animate-pulse" />
            <circle cx="10" cy="10" r="10" fill="#1e3a8a" stroke="#60a5fa" strokeWidth="2" />
            {/* Tiny navigation vehicle icon */}
            <Navigation2 className="w-3.5 h-3.5 text-[#60a5fa] absolute inset-0 m-auto animate-bounce" style={{ transform: 'translate(3px, 3px) rotate(45deg)' }} />
          </g>
        )}
      </svg>

      {/* Map Bottom HUD details */}
      <div className={`absolute bottom-0 inset-x-0 border-t px-3 py-1.5 flex justify-between items-center z-10 ${hudBg}`}>
        <div className="flex flex-col">
          <span className="text-[8px] text-slate-500 uppercase tracking-widest font-mono">My Breakdown Point</span>
          <span className={`text-[10px] truncate max-w-[220px] font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{driverAddress}</span>
        </div>

        {selectedMechanic && (
          <div className="flex items-center gap-1.5 text-right">
            <span className="text-[14px] font-bold text-[#2563eb] font-mono">
              {mechanicProgress >= 100 
                ? 'Arrived' 
                : `${Math.ceil((1 - mechanicProgress / 100) * selectedMechanic.responseMins)} min`}
            </span>
            <span className="text-[8px] text-slate-400 uppercase tracking-wider font-mono">ETA</span>
          </div>
        )}
      </div>

      <style>{`
        @keyframes dash {
          to {
            stroke-dashoffset: -20;
          }
        }
        .animate-spin-slow {
          animation: spin 8s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
