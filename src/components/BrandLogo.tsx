import React from 'react';

interface BrandLogoProps {
  compact?: boolean;
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ compact = false, className = '' }) => {
  return (
    <span className={`inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 ${className}`}>
      <svg
        width="34"
        height="34"
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <defs>
          <linearGradient id="aqmGrad" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#3B82F6" />
            <stop offset="55%" stopColor="#7C3AED" />
            <stop offset="100%" stopColor="#06B6D4" />
          </linearGradient>
        </defs>
        {/* 3D Hexagon Crystal Frame */}
        <polygon
          points="20,2 36,11 36,29 20,38 4,29 4,11"
          fill="url(#aqmGrad)"
          fillOpacity="0.16"
          stroke="url(#aqmGrad)"
          strokeWidth="1.6"
        />
        {/* Graduation Cap Top */}
        <polygon points="20,7 31,12 20,17 9,12" fill="url(#aqmGrad)" />
        <line x1="29" y1="13" x2="29" y2="19" stroke="#06B6D4" strokeWidth="1.5" strokeLinecap="round" />
        {/* Neural Brain Arcs */}
        <path
          d="M12.5 22.5C12.5 18.8 15.8 16.5 20 16.5C24.2 16.5 27.5 18.8 27.5 22.5C27.5 26.2 24.4 29 20 29C15.6 29 12.5 26.2 12.5 22.5Z"
          stroke="#60A5FA"
          strokeWidth="1.5"
          fill="#0F172A"
          fillOpacity="0.65"
        />
        {/* Digital Question Mark */}
        <path
          d="M17.8 20.6C17.8 19.3 18.8 18.4 20.1 18.4C21.4 18.4 22.3 19.2 22.3 20.3C22.3 21.3 21.5 21.8 20.6 22.4C20.1 22.7 19.9 23.1 19.9 23.8"
          stroke="#E0F2FE"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <circle cx="20" cy="26.4" r="1.15" fill="#22D3EE" />
        {/* Circuit Nodes */}
        <circle cx="11" cy="22.5" r="1.3" fill="#3B82F6" />
        <circle cx="29" cy="22.5" r="1.3" fill="#8B5CF6" />
      </svg>
      {!compact && (
        <span className="font-display text-base sm:text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
          AI QUIZ MASTER
        </span>
      )}
    </span>
  );
};
