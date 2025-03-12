import React, { useRef } from 'react';
import { ImageIcon } from './Icons';
import { IconButton } from './IconButton';

interface BackgroundImageUploaderProps {
  onImageSelect: (imageUrl: string) => void;
}

export const BackgroundImageUploader: React.FC<BackgroundImageUploaderProps> = ({ onImageSelect }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleButtonClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      
      // Check if the file is an image
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file.');
        return;
      }
      
      // Create a URL for the selected image
      const imageUrl = URL.createObjectURL(file);
      onImageSelect(imageUrl);
      
      // Reset the input to allow selecting the same file again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="background-image-uploader">
      <IconButton 
        icon={<ImageIcon />} 
        onClick={handleButtonClick}
        tooltip="Upload Background Image"
      />
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        style={{ display: 'none' }}
      />
    </div>
  );
};