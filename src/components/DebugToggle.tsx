import React from 'react';
import { ToggleSwitch } from './ToggleSwitch';

// Icon for the meshes debug button
export const MeshIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
  </svg>
);

// Icon for the physics debug button
export const PhysicsIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714a2.25 2.25 0 0 0 .659 1.591L19.5 14.5M9.75 3.104c.14.049.282.1.423.152m.423-.152a5.96 5.96 0 0 1 1.905 0c.14.049.282.1.423.152M9.75 17.5l-4-2.5v-6M19.5 17.5l-4-2.5v-6" />
  </svg>
);

// Icon for the IK constraints debug button
export const IkIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
    <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fill="currentColor" fontSize="10" fontWeight="bold">IK</text>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 3v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10Z" strokeOpacity="0.6" />
  </svg>
);

interface DebugToggleProps {
  onChange: (checked: boolean) => void;
  checked: boolean;
  tooltip: string;
  variant?: 'default' | 'yellow' | 'magenta' | 'cyan';
  label?: string;
}

export const DebugToggle: React.FC<DebugToggleProps> = ({
  onChange,
  checked,
  tooltip,
  variant = 'default',
  label
}) => {
  return (
    <ToggleSwitch
      checked={checked}
      onChange={onChange}
      tooltip={tooltip}
      variant={variant}
      label={label}
    />
  );
};

// Legacy component for backward compatibility
interface LegacyDebugToggleProps {
  onClick: () => void;
  active: boolean;
  tooltip: string;
  icon: React.ReactNode;
}

export const LegacyDebugToggle: React.FC<LegacyDebugToggleProps> = ({ onClick, active, tooltip, icon }) => {
  return (
    <button
      className={`icon-button ${active ? 'active' : ''}`}
      onClick={onClick}
      title={tooltip}
    >
      {icon}
    </button>
  );
};