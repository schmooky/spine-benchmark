import { useCallback } from 'react';
import { useToast } from './ToastContext';

export const useFileProcessor = () => {
  const { addToast } = useToast();

  const processDroppedFiles = useCallback(async (items: DataTransferItemList): Promise<File[]> => {
    const fileList: File[] = [];
    
    // Helper function to read entries recursively
    const readEntries = async (dirReader: FileSystemDirectoryReader): Promise<File[]> => {
      return new Promise((resolve, reject) => {
        dirReader.readEntries(async (entries) => {
          try {
            if (entries.length === 0) {
              resolve([]);
            } else {
              const files: File[] = [];
              for (const entry of entries) {
                if (entry.isFile) {
                  const file = await new Promise<File>((res, rej) => {
                    (entry as FileSystemFileEntry).file(res, rej);
                  });
                  // Add the full path to the file for identification
                  Object.defineProperty(file, 'fullPath', {
                    value: entry.fullPath,
                    writable: false
                  });
                  files.push(file);
                } else if (entry.isDirectory) {
                  const subFiles = await readEntries((entry as FileSystemDirectoryEntry).createReader());
                  files.push(...subFiles);
                }
              }
              const moreFiles = await readEntries(dirReader);
              resolve([...files, ...moreFiles]);
            }
          } catch (error) {
            reject(error);
          }
        });
      });
    };

    // Process each item
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          fileList.push(file);
        }
      } else if (item.kind === 'directory') {
        // Handle directory (Chrome only)
        const entry = item.webkitGetAsEntry();
        if (entry && entry.isDirectory) {
          try {
            const dirFiles = await readEntries((entry as FileSystemDirectoryEntry).createReader());
            fileList.push(...dirFiles);
          } catch (error) {
            console.error('Error reading directory:', error);
            addToast('Failed to read directory contents', 'error');
          }
        }
      }
    }
    
    return fileList;
  }, [addToast]);

  const collectFilesFromDataTransfer = useCallback(async (dataTransfer: DataTransfer): Promise<File[]> => {
    const items = dataTransfer.items;
    if (items && items.length > 0) {
      return processDroppedFiles(items);
    } else {
      // Fallback for browsers that don't support items
      const files: File[] = [];
      for (let i = 0; i < dataTransfer.files.length; i++) {
        files.push(dataTransfer.files[i]);
      }
      return files;
    }
  }, [processDroppedFiles]);

  return {
    collectFilesFromDataTransfer
  };
};