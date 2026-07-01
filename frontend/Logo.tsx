import React from 'react';

interface LogoProps {
  className?: string;
  showSubtitle?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isDark?: boolean;
}

export default function Logo({ className = '', showSubtitle = true, size = 'md', isDark = true }: LogoProps) {
  const sizeClasses = {
    sm: { svg: 'w-12 h-12', title: 'text-lg', subtitle: 'text-[7px]' },
    md: { svg: 'w-24 h-24', title: 'text-2xl', subtitle: 'text-[9px]' },
    lg: { svg: 'w-36 h-36', title: 'text-3.5xl', subtitle: 'text-[11px]' },
    xl: { svg: 'w-48 h-48', title: 'text-5xl', subtitle: 'text-[14px]' },
  };

  const currentSize = sizeClasses[size];

  return (
    <div className={`flex flex-col items-center justify-center text-center ${className}`}>
      {/* Premium Metallic Concentric Gears and Sweeping Arrow Logo */}
      <svg 
        className={`${currentSize.svg} drop-shadow-[0_10px_20px_rgba(30,58,138,0.25)]`} 
        viewBox="0 0 512 512" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Outer Gear Gradient - Deep Royal and Indigo Blue */}
          <linearGradient id="outerGearGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="30%" stopColor="#1d4ed8" />
            <stop offset="70%" stopColor="#1e3a8a" />
            <stop offset="100%" stopColor="#172554" />
          </linearGradient>
{/* Inner Gear Gradient - Brighter Steel and Ice Blue */}
          <linearGradient id="innerGearGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#93c5fd" />
            <stop offset="40%" stopColor="#60a5fa" />
            <stop offset="80%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>

          {/* Crescent Tail Gradient - Deep Navy to Solid Blue */}
          <linearGradient id="crescentGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#1e3a8a" />
            <stop offset="50%" stopColor="#1d4ed8" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>

          {/* Main Arrow Body Gradient - Chrome Metallic to Brilliant White */}
          <linearGradient id="arrowGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#1d4ed8" />
            <stop offset="25%" stopColor="#2563eb" />
            <stop offset="55%" stopColor="#3b82f6" />
            <stop offset="75%" stopColor="#93c5fd" />
            <stop offset="90%" stopColor="#e2e8f0" />
            <stop offset="100%" stopColor="#ffffff" />
          </linearGradient>

          {/* Inner Glossy Highlight Gradient */}
          <linearGradient id="arrowHighlightGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.1" />
            <stop offset="60%" stopColor="#ffffff" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.9" />
          </linearGradient>

          {/* Subtle Glow Filter */}
          <filter id="softGlow" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
 {/* 1. OUTER GEAR (Base Layer) */}
        <g id="outer-gear-group">
          {/* 12 Outer Gear Teeth */}
          {Array.from({ length: 12 }).map((_, i) => (
            <path
              key={`outer-tooth-${i}`}
              d="M 238 130 L 243 91 Q 244 86 249 86 L 263 86 Q 268 86 269 91 L 274 130 Z"
              fill="url(#outerGearGrad)"
              transform={`rotate(${i * 30}, 256, 256)`}
            />
          ))}
          {/* Main Outer Gear Circular Ring */}
          <circle 
            cx="256" 
            cy="256" 
            r="127.5" 
            stroke="url(#outerGearGrad)" 
            strokeWidth="35" 
            fill="none" 
          />
          {/* Outer Ring Inner Metallic Rim Highlight */}
          <circle 
            cx="256" 
            cy="256" 
            r="145" 
            stroke="#93c5fd" 
            strokeWidth="1.5" 
            strokeOpacity="0.45" 
            fill="none" 
          />
          <circle 
            cx="256" 
            cy="256" 
            r="110" 
            stroke="#172554" 
            strokeWidth="2" 
            strokeOpacity="0.5" 
            fill="none" 
   />
        </g>

        {/* 2. INNER GEAR (Rotated slightly for interlocking depth) */}
        <g id="inner-gear-group">
          {/* 12 Inner Gear Teeth */}
          {Array.from({ length: 12 }).map((_, i) => (
            <path
              key={`inner-tooth-${i}`}
              d="M 245 171 L 248 141 Q 249 137 253 137 L 259 137 Q 263 137 264 141 L 267 171 Z"
              fill="url(#innerGearGrad)"
              transform={`rotate(${i * 30 + 15}, 256, 256)`}
            />
          ))}
          {/* Main Inner Gear Ring */}
          <circle 
            cx="256" 
            cy="256" 
            r="82.5" 
            stroke="url(#innerGearGrad)" 
            strokeWidth="25" 
            fill="none" 
          />
          {/* Inner Ring Highlight Borders */}
          <circle 
            cx="256" 
            cy="256" 
            r="95" 
            stroke="#ffffff" 
            strokeWidth="1.2" 
            strokeOpacity="0.5" 
            fill="none" 
          />
          <circle 
            cx="256" 
            cy="256" 
            r="70" 
            stroke="#1d4ed8" 
 strokeWidth="1.5" 
            strokeOpacity="0.4" 
            fill="none" 
          />
        </g>

        {/* 3. DYNAMIC BOTTOM-LEFT SWEEPING CRESCENT (Tail Swoosh) */}
        <path 
          d="M 80 195 C 75 270, 110 355, 240 375 C 310 385, 360 360, 395 320 C 330 345, 260 345, 195 325 C 145 310, 115 260, 115 195 Z" 
          fill="url(#crescentGrad)"
          filter="url(#softGlow)"
        />

        {/* 4. MAIN SWEEPING ARROW WITH HIGH-TECH REFLECTIONS */}
        <g id="sweeping-arrow-group">
          {/* 3D Arrow Bottom Bevel / Shadow Offset */}
          <path 
            d="M 160 374 C 230 334, 310 254, 400 179 L 380 159 L 475 64 L 455 84 L 435 144 C 350 234, 270 314, 160 374 Z" 
            fill="#1e3b8a" 
            opacity="0.6" 
          />

          {/* Solid Glossy Arrow Body */}
          <path 
            d="M 160 370 C 230 330, 310 250, 400 175 L 380 155 L 475 60 L 455 80 L 435 140 C 350 230, 270 310, 160 370 Z" 
            fill="url(#arrowGrad)" 
            filter="url(#softGlow)"
          />

          {/* White High-Contrast Edge Highlight Along Upper Sweep */}
          <path 
            d="M 160 370 C 230 330, 310 250, 400 175" 
            stroke="url(#arrowHighlightGrad)" 
            strokeWidth="4" 
            strokeLinecap="round" 
            fill="none"
          />
  {/* Silver Highlight on Left Arrowhead Blade */}
          <path 
            d="M 380 155 L 475 60" 
            stroke="#ffffff" 
            strokeWidth="2.2" 
            strokeLinecap="round" 
            fill="none"
          />

          {/* Subtle Accent Shadow in Arrow Center */}
          <path 
            d="M 180 360 C 245 325, 320 255, 390 195" 
            stroke="#1d4ed8" 
            strokeWidth="2" 
            strokeOpacity="0.45" 
            strokeLinecap="round" 
            fill="none"
          />
        </g>
      </svg>

      {/* Brand Name */}
      <h1 className={`${currentSize.title} font-bold tracking-wider mt-4 font-sans uppercase ${isDark ? 'text-[#f3f3f3]' : 'text-slate-900'}`}>
        Otto<span className="text-[#2563eb]">Assist</span>
      </h1>

      {/* Subtitle */}
      {showSubtitle && (
        <div className="flex items-center gap-1 mt-1 text-gray-500">
          <div className={`h-[1px] w-8 ${isDark ? 'bg-blue-500/40' : 'bg-blue-500/20'}`} />
          <span className={`${currentSize.subtitle} font-mono uppercase tracking-[0.25em] font-semibold text-[#2563eb]`}>
            PRECISION & AUTOMATION
          </span>
          <div className={`h-[1px] w-8 ${isDark ? 'bg-blue-500/40' : 'bg-blue-500/20'}`} />
        </div>
      )}
    </div>
  );
}
