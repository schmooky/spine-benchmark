import React, { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../hooks/ToastContext';

interface DropZoneProps {
  onFilesDrop: (files: FileList) => void;
}

export const DropZone: React.FC<DropZoneProps> = ({ onFilesDrop }) => {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.dataTransfer.items) {
      const items = e.dataTransfer.items;
      const fileItems: DataTransferItem[] = [];
      
      for (let i = 0; i < items.length; i++) {
        fileItems.push(items[i]);
      }
      
      const fileList: (File | FileSystemDirectoryEntry)[] = [];
      for (const item of fileItems) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            fileList.push(file);
          }
        } else if (item.kind === 'directory') {
          const entry = item.webkitGetAsEntry();
          if (entry && entry.isDirectory) {
            fileList.push(entry as FileSystemDirectoryEntry);
          }
        }
      }
      
      if (fileList.length > 0) {
        const dataTransfer = new DataTransfer();
        fileList.forEach(file => {
          if (file instanceof File) {
            dataTransfer.items.add(file);
          }
        });
        onFilesDrop(dataTransfer.files);
      }
    } else {
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        onFilesDrop(files);
      }
    }
  }, [onFilesDrop]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesDrop(e.target.files);
    }
  }, [onFilesDrop]);

  const triggerFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div 
      className="drop-zone"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={triggerFileSelect}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".json,.skel,.atlas,.png,.jpg,.jpeg"
        onChange={handleFileInput}
        style={{ display: 'none' }}
      />
      <div className="drop-zone-content">
        <div className="drop-zone-icon">📁</div>
        <p>{t('ui.dropFilesHere', 'Drop Spine files here')}</p>
        <p className="drop-zone-subtext">
          {t('ui.supportedFormats', 'Supports .json, .skel, .atlas, and image files')}
        </p>
        <button className="browse-button" type="button">
          {t('ui.browseFiles', 'Browse Files')}
        </button>
      </div>
    </div>
  );
};