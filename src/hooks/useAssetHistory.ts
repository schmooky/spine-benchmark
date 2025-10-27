import { useState, useCallback, useEffect } from 'react';
import { useSafeLocalStorage } from './useSafeLocalStorage';
interface StoredFile {
  name: string;
  type: string;
  size: number;
  data: string;
}

export interface AssetHistoryEntry {
  id: string;
  name: string;
  loadedAt: string;
  jsonUrl?: string;
  atlasUrl?: string;
  files?: Array<{ name: string; type: string; size: number }>;
  storedFiles?: StoredFile[];
  ciValue?: number;
  riValue?: number;
  analysisData?: any;
  isReloadable: boolean;
  source: 'url' | 'files';
}

const MAX_HISTORY_ENTRIES = 20;
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const convertFilesToStoredFiles = async (files: FileList): Promise<StoredFile[]> => {
  const storedFiles: StoredFile[] = [];
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    if (file.size > MAX_FILE_SIZE) {
      console.warn(`File ${file.name} is too large (${file.size} bytes) to store in history`);
      continue;
    }
    
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      
      storedFiles.push({
        name: file.name,
        type: file.type,
        size: file.size,
        data
      });
    } catch (error) {
      console.error(`Failed to read file ${file.name}:`, error);
    }
  }
  
  return storedFiles;
};

const convertStoredFilesToFileList = async (storedFiles: StoredFile[]): Promise<FileList> => {
  const files: File[] = [];
  
  for (const storedFile of storedFiles) {
    try {
      const response = await fetch(storedFile.data);
      const blob = await response.blob();
      
      const file = new File([blob], storedFile.name, { type: storedFile.type });
      files.push(file);
    } catch (error) {
      console.error(`Failed to convert stored file ${storedFile.name}:`, error);
    }
  }
  
  const fileList = {
    length: files.length,
    item: (index: number) => files[index] || null,
    [Symbol.iterator]: function* () {
      for (let i = 0; i < files.length; i++) {
        yield files[i];
      }
    }
  };
  
  files.forEach((file, index) => {
    (fileList as any)[index] = file;
  });
  
  return fileList as FileList;
};

export function useAssetHistory() {
  const [historyEntries, setHistoryEntries] = useSafeLocalStorage<AssetHistoryEntry[]>('spine-asset-history', []);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);

  const addHistoryEntry = useCallback((entry: Omit<AssetHistoryEntry, 'id' | 'loadedAt'>) => {
    const newEntry: AssetHistoryEntry = {
      ...entry,
      id: crypto.randomUUID(),
      loadedAt: new Date().toISOString()
    };

    setHistoryEntries(prev => {
      const filtered = prev.filter(e => e.name !== entry.name);
      
      const updated = [newEntry, ...filtered];
      
      return updated.slice(0, MAX_HISTORY_ENTRIES);
    });
  }, [setHistoryEntries]);

  const removeHistoryEntry = useCallback((id: string) => {
    setHistoryEntries(prev => prev.filter(entry => entry.id !== id));
  }, [setHistoryEntries]);

  const clearHistory = useCallback(() => {
    setHistoryEntries([]);
  }, [setHistoryEntries]);

  const updateEntryAnalysis = useCallback((id: string, ciValue: number, riValue: number, analysisData: any) => {
    setHistoryEntries(prev => 
      prev.map(entry => 
        entry.id === id 
          ? { ...entry, ciValue, riValue, analysisData }
          : entry
      )
    );
  }, [setHistoryEntries]);

  const openHistoryDrawer = useCallback(() => {
    setIsHistoryDrawerOpen(true);
  }, []);

  const closeHistoryDrawer = useCallback(() => {
    setIsHistoryDrawerOpen(false);
  }, []);

  const toggleHistoryDrawer = useCallback(() => {
    setIsHistoryDrawerOpen(prev => !prev);
  }, []);

  return {
    historyEntries,
    isHistoryDrawerOpen,
    addHistoryEntry,
    removeHistoryEntry,
    clearHistory,
    updateEntryAnalysis,
    openHistoryDrawer,
    closeHistoryDrawer,
    toggleHistoryDrawer,
    convertFilesToStoredFiles,
    convertStoredFilesToFileList
  };
}