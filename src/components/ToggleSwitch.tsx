import React from 'react';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  variant?: 'default' | 'yellow' | 'magenta' | 'cyan';
  disabled?: boolean;
  tooltip?: string;
  className?: string;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  label,
  variant = 'default',
  disabled = false,
  tooltip,
  className = '',
}) => {
  const handleToggle = () => {
    if (!disabled) {
      onChange(!checked);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      handleToggle();
    }
  };

  return (
    <div 
      className={`toggle-switch-container ${className}`}
      title={tooltip}
    >
      <div
        className={`toggle-switch ${variant} ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}`}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        tabIndex={disabled ? -1 : 0}
        role="switch"
        aria-checked={checked}
        aria-label={label || tooltip}
        aria-disabled={disabled}
      >
        <div className="toggle-track">
          <div className="toggle-thumb" />
        </div>
      </div>
      {label && (
        <label 
          className="toggle-label"
          onClick={handleToggle}
        >
          {label}
        </label>
      )}
    </div>
  );
};