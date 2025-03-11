import React from 'react';

interface IconButtonProps {
  icon: React.ReactNode;
  onClick: () => void;
  tooltip?: string;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  onClick,
  tooltip,
  active = false,
  disabled = false,
  className = '',
}) => {
  return (
    <button
      className={`icon-button ${active ? 'active' : ''} ${disabled ? 'disabled' : ''} ${className}`}
      onClick={onClick}
      disabled={disabled}
      title={tooltip}
      aria-label={tooltip}
    >
      {icon}
    </button>
  );
};