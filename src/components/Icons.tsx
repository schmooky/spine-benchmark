import React from 'react';

// Common SVG props that all icons share
interface IconProps {
  className?: string;
  size?: number;
}

const defaultProps = {
  className: '',
  size: 24,
};

// Helper function to create icon components
const createIcon = (path: React.ReactNode, viewBox = '0 0 24 24') => {
  return ({ className = '', size = 24 }: IconProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`icon ${className}`}
      aria-hidden="true"
    >
      {path}
    </svg>
  );
};

// Document Icon
export const DocumentTextIcon = createIcon(
  <>
    <path d="M8 14H16M8 10H16M13 18H8C6.89543 18 6 17.1046 6 16V8C6 6.89543 6.89543 6 8 6H16C17.1046 6 18 6.89543 18 8V13" />
    <path d="M15 18L18 21M18 21L21 18M18 21V15" />
  </>
);

// Question Mark Circle Icon
export const QuestionMarkCircleIcon = createIcon(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16V16.01M12 13C12.5523 13 13 12.5523 13 12C13 11.4477 12.5523 11 12 11C11.4477 11 11 11.4477 11 12V12.5C11 12.7761 11.2239 13 11.5 13H12Z" />
  </>
);

// Play Icon
export const PlayIcon = createIcon(
  <path d="M5 3L19 12L5 21V3Z" />
);

// Pause Icon
export const PauseIcon = createIcon(
  <>
    <rect x="6" y="4" width="4" height="16" />
    <rect x="14" y="4" width="4" height="16" />
  </>
);

// Stop Icon
export const StopIcon = createIcon(
  <rect x="5" y="5" width="14" height="14" />
);

// Rewind Icon
export const RewindIcon = createIcon(
  <>
    <path d="M4 16V8L10 12L4 16Z" />
    <path d="M12 16V8L18 12L12 16Z" />
  </>
);

// Forward Icon
export const ForwardIcon = createIcon(
  <>
    <path d="M6 16V8L12 12L6 16Z" />
    <path d="M14 16V8L20 12L14 16Z" />
  </>
);

// Arrow Path (Refresh) Icon
export const ArrowPathIcon = createIcon(
  <path d="M16.023 9h4.977v-4M7.977 15h-4.977v4M16.5 7.5c-1.333-1.333-3.5-3-6.5-3-4.142 0-7.5 3.358-7.5 7.5 0 1.487.433 2.873 1.179 4.038M7.5 16.5c1.333 1.333 3.5 3 6.5 3 4.142 0 7.5-3.358 7.5-7.5 0-1.487-.433-2.873-1.179-4.038" />
);

// X Mark (Close) Icon
export const XMarkIcon = createIcon(
  <path d="M6 18L18 6M6 6L18 18" />
);

// Swatch (Color Palette) Icon
export const SwatchIcon = createIcon(
  <>
    <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
    <path d="M15 10l5 5" />
  </>
);

// Image Icon
export const ImageIcon = createIcon(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="M21 15l-5-5L5 21" />
  </>
);

// Cog (Settings) Icon 
export const CogIcon = createIcon(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
  </>
);