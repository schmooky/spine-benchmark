import React, { useState } from 'react';
import { SwatchIcon } from './Icons';
import { IconButton } from './IconButton';

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({ color, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  const predefinedColors = [
    '#282b30', // Default dark
    '#1a1a1a', // Darker
    '#333333', // Dark gray
    '#121212', // Almost black
    '#2c2c2c', // Charcoal
    '#2b2d42', // Navy blue
    '#1d3557', // Dark blue
    '#3c096c', // Dark purple
    '#240046', // Deep purple
    '#1b263b', // Slate blue
  ];
  
  const togglePicker = () => {
    setIsOpen(!isOpen);
  };
  
  const handleColorSelect = (selectedColor: string) => {
    onChange(selectedColor);
    setIsOpen(false);
  };
  
  const handleCustomColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };
  
  return (
    <div className="color-picker-container">
      <IconButton 
        icon={<SwatchIcon />} 
        onClick={togglePicker}
        tooltip="Change Background Color"
        active={isOpen}
      />
      
      {isOpen && (
        <div className="color-picker-dropdown">
          <div className="color-picker-swatches">
            {predefinedColors.map((c, index) => (
              <button
                key={index}
                className={`color-swatch ${c === color ? 'active' : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => handleColorSelect(c)}
                title={c}
              />
            ))}
          </div>
          
          <div className="color-picker-custom">
            <input
              type="color"
              value={color}
              onChange={handleCustomColorChange}
              title="Custom color"
            />
            <input 
              type="text"
              value={color}
              onChange={(e) => onChange(e.target.value)}
              pattern="^#[0-9A-Fa-f]{6}$"
              title="Hex color code (e.g. #282b30)"
            />
          </div>
        </div>
      )}
    </div>
  );
};