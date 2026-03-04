import React from 'react';

// Common SVG props that all icons share
interface IconProps {
  className?: string;
  size?: number;
}

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

export const FolderOpenIcon = createIcon(
  <>
    <path d="M3 7a2 2 0 0 1 2-2h4.5l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M3 10h18" />
  </>
);

export const RabbitIcon = createIcon(
  <>
    <path d="M9 7c0-2.2.8-4 1.8-4S13 4.8 13 7" />
    <path d="M12 7c0-2.2.8-4 1.8-4S16 4.8 16 7" />
    <path d="M5.5 14a6.5 6.5 0 0 1 13 0v2a4.5 4.5 0 0 1-4.5 4.5h-4A4.5 4.5 0 0 1 5.5 16z" />
    <circle cx="10" cy="14" r=".5" />
    <circle cx="14" cy="14" r=".5" />
  </>
);

export const ChevronDownIcon = createIcon(
  <path d="M6 9l6 6 6-6" />
);

export const CheckIcon = createIcon(
  <path d="M20 6L9 17l-5-5" />
);

export const TelegramIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={`icon ${className}`}
    aria-hidden="true"
  >
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
  </svg>
);

export const GitHubIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={`icon ${className}`}
    aria-hidden="true"
  >
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
);
