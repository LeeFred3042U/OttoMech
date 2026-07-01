import React, { useState } from 'react';
import { LUCKNOW_GARAGES } from '../data/garages';
import { Garage, IssueCategory } from '../types';
import { WifiOff, Search, PhoneCall, MapPin, Star, AlertTriangle } from 'lucide-react';

interface OfflineEmergencyProps {
  onCallMechanic: (garage: Garage) => void;
  activeCategory?: IssueCategory;
  isDark?: boolean;
}

export default function OfflineEmergency({ onCallMechanic, activeCategory, isDark = true }: OfflineEmergencyProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string>('All');

  const neighborhoods = ['All', 'Chinhat', 'Gomti Nagar', 'Hazratganj', 'Lalbagh', 'Alambagh', 'Indira Nagar', 'Transport Nagar'];

  // Filter 30 Lucknow seeded garages purely client-side from the offline cache
  const filteredGarages = LUCKNOW_GARAGES.filter(garage => {
    const matchesSearch = garage.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          garage.address.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesNeighborhood = selectedNeighborhood === 'All' || garage.neighborhood === selectedNeighborhood;
    
    return matchesSearch && matchesNeighborhood;
  });

  return (
    <div className={`flex flex-col h-full overflow-y-auto pb-6 transition-colors duration-300 ${isDark ? 'bg-[#121212] text-slate-100' : 'bg-white text-slate-800'}`}>
      
      {/* Offline Alert Banner */}
      <div className={`border-y px-4 py-3.5 flex items-start gap-3 transition-colors ${isDark ? 'bg-amber-500/10 border-amber-500/20' : 'bg-amber-50 border-amber-200'}`}>
        <WifiOff className="w-6 h-6 text-amber-500 shrink-0 animate-pulse mt-0.5" />
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className={`text-[11px] font-bold tracking-wider uppercase font-mono ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>Offline Backup Engaged</span>
            <span className={`text-[9px] border px-1.5 py-0.2 rounded font-mono ${isDark ? 'bg-amber-950 text-amber-300 border-amber-600/40' : 'bg-amber-100 text-amber-800 border-amber-300'}`}>INDEXEDDB ACTIVE</span>
          </div>
          <p className={`text-xs leading-snug ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            Stranded on <strong className={isDark ? 'text-amber-300' : 'text-amber-800'}>Faizabad Road NH-27</strong> with no network? 
            OttoAssist has loaded 30 cached Lucknow garages offline. Standard phone dispatches remain fully functional.
          </p>
        </div>
      </div>

      {/* Main Content Workspace */}
      <div className="p-4 flex flex-col gap-4">
        
        {/* Urgent Search bar */}
        <div className="flex flex-col gap-1.5">
          <label className={`text-[10px] uppercase font-mono font-bold tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Search Lucknow Offline Cache</label>
          <div className="relative">
            <input 
              type="text" 
              placeholder="Search garage name, road, near me..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full focus:outline-none rounded-xl py-2.5 pl-10 pr-4 text-xs font-sans transition-all ${
                isDark 
                  ? 'bg-[#1a1a1a] border border-[#262626] focus:border-blue-500 text-slate-200 placeholder-slate-500' 
                  : 'bg-slate-50 border border-slate-200 focus:border-blue-600 text-slate-800 placeholder-slate-400'
              }`}
            />
            <Search className="w-4.5 h-4.5 text-slate-400 absolute left-3 top-3" />
          </div>
        </div>

        {/* Neighborhood Tabs */}
        <div className="flex flex-col gap-1.5">
          <span className={`text-[10px] uppercase font-mono font-bold tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Filter Lucknow Sectors</span>
          <div className="flex gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin scrollbar-thumb-slate-800">
            {neighborhoods.map((nh) => (
              <button
                key={nh}
                onClick={() => setSelectedNeighborhood(nh)}
                className={`px-3 py-1.5 text-[10px] font-mono font-semibold rounded-lg shrink-0 border transition-all uppercase tracking-wider cursor-pointer ${
                  selectedNeighborhood === nh 
                    ? isDark 
                      ? 'bg-blue-500/10 text-blue-300 border-blue-500/40' 
                      : 'bg-blue-50 text-blue-700 border-blue-200'
                    : isDark
                      ? 'bg-[#1a1a1a] text-slate-400 border-[#262626] hover:border-[#333]'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {nh}
              </button>
            ))}
          </div>
        </div>

        {/* Callout Info Block */}
        <div className={`border rounded-xl p-3 flex gap-2.5 items-center transition-colors ${isDark ? 'bg-[#1a1a1a]/40 border-[#262626]/40' : 'bg-slate-50 border-slate-100'}`}>
          <AlertTriangle className={`w-5 h-5 shrink-0 ${isDark ? 'text-blue-400/80' : 'text-blue-600/80'}`} />
          <p className={`text-[10px] leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            In Offline Mode, call-outs are completed via direct phone link. Your upfront price quote is estimated, and mechanics will issue manual receipts that sync in-app once your data connection recovers.
          </p>
        </div>

        {/* Directory List of 30 Lucknow Garages */}
        <div className="flex flex-col gap-2.5">
          <div className="flex justify-between items-center px-1">
            <span className={`text-[10px] uppercase font-mono font-bold tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Cached Garages ({filteredGarages.length})
            </span>
            <span className={`text-[9px] font-mono ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>MRI Score (Reliability Index)</span>
          </div>

          {filteredGarages.length === 0 ? (
            <div className={`border border-dashed rounded-xl py-8 text-center px-4 ${isDark ? 'bg-[#1a1a1a]/20 border-[#262626]' : 'bg-slate-50/50 border-slate-200'}`}>
              <span className="text-xs text-slate-500 font-mono block mb-1">No Offline Results</span>
              <p className="text-[10px] text-slate-400">Try changing the neighborhood or typing an alternative query.</p>
            </div>
          ) : (
            filteredGarages.map((garage) => (
              <div 
                key={garage.id} 
                className={`border rounded-xl p-3.5 transition-all flex flex-col gap-3 group relative overflow-hidden ${
                  isDark 
                    ? 'bg-[#1a1a1a] border-[#262626] hover:border-blue-500/30' 
                    : 'bg-white border-slate-200 shadow-xs hover:border-blue-500/40'
                }`}
              >
                {/* Visual Accent for Standby status */}
                <div className={`absolute top-0 left-0 w-1 h-full ${garage.status === 'online' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                
                <div className="flex justify-between items-start gap-2 pl-1.5">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <h4 className={`text-xs font-bold transition-colors ${
                        isDark ? 'text-slate-200 group-hover:text-blue-300' : 'text-slate-800 group-hover:text-blue-600'
                      }`}>
                        {garage.name}
                      </h4>
                      {garage.status === 'online' && (
                        <span className="text-[8px] bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 px-1 rounded uppercase font-mono font-bold">
                          ONLINE
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-slate-500">
                      <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="truncate max-w-[160px]">{garage.neighborhood} Sector</span>
                    </div>
                  </div>

                  {/* MRI Badge */}
                  <div className="flex flex-col items-end">
                    <div className="flex items-center gap-1 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold text-blue-600">
                      <Star className="w-3 h-3 text-blue-500 fill-blue-500 shrink-0" />
                      <span>{garage.mri}</span>
                    </div>
                    <span className="text-[7px] text-slate-400 uppercase tracking-widest font-mono mt-0.5">MRI rating</span>
                  </div>
                </div>

                {/* Mechanic Specific Stats */}
                <div className={`grid grid-cols-3 rounded-lg p-2 text-center text-[9px] font-mono pl-1.5 ${
                  isDark ? 'bg-[#121212]/60 border border-[#262626]/40' : 'bg-slate-50 border border-slate-100'
                }`}>
                  <div>
                    <span className="text-slate-500 block text-[7px] uppercase tracking-wider mb-0.5">Completions</span>
                    <span className={`font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{garage.completions}+</span>
                  </div>
                  <div className={`border-x ${isDark ? 'border-[#262626]/40' : 'border-slate-200/60'}`}>
                    <span className="text-slate-500 block text-[7px] uppercase tracking-wider mb-0.5">Avg Arrival</span>
                    <span className={`font-bold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>{garage.responseMins} min</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[7px] uppercase tracking-wider mb-0.5">Est. Price</span>
                    <span className={`font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{garage.priceEstimate}</span>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 pl-1.5">
                  <button 
                    onClick={() => onCallMechanic(garage)}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/10 active:scale-[0.98] transition-transform cursor-pointer"
                  >
                    <PhoneCall className="w-4.5 h-4.5 text-white" />
                    <span>Call Mechanic Direct</span>
                  </button>
                  
                  <div className={`px-2.5 py-2 border rounded-lg flex items-center justify-center text-[10px] font-mono ${
                    isDark ? 'bg-[#121212] border-[#262626] text-slate-400' : 'bg-slate-50 border-slate-200/80 text-slate-600'
                  }`}>
                    {garage.phone}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
