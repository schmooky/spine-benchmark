/**
 * Utility functions for handling file trees and folder drops
 */

// Interface for FileSystemEntry (needed for TypeScript support)
interface FileSystemEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath?: string;
  file(callback: (file: File) => void, errorCallback?: (error: any) => void): void;
  createReader(): FileSystemDirectoryReader;
}

interface FileSystemDirectoryReader {
  readEntries(callback: (entries: FileSystemEntry[]) => void, errorCallback?: (error: any) => void): void;
}

// Extending DataTransferItem to include webkitGetAsEntry
interface ExtendedDataTransferItem extends DataTransferItem {
  webkitGetAsEntry(): FileSystemEntry | null;
}

/**
 * Recursively traverses a file tree and collects all files
 */
export const traverseFileTree = async (
  item: FileSystemEntry, 
  path: string = '',
  fileList: File[] = []
): Promise<File[]> => {
  if (item.isFile) {
    // Get file and add to file list
    const file = await new Promise<File>((resolve, reject) => {
      item.file((file) => {
        resolve(file);
      }, (error) => {
        reject(error);
      });
    });
    
    // Create a new file with the correct path to preserve folder structure
    const fullPath = path + file.name;
    const fileWithPath = new File(
      [file], 
      fullPath, 
      { type: file.type }
    );
    
    // Store the original relative path for later use
    Object.defineProperty(fileWithPath, 'webkitRelativePath', {
      writable: false,
      value: fullPath
    });
    
    fileList.push(fileWithPath);
    return fileList;
  } else if (item.isDirectory) {
    // Get folder contents
    const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      const dirReader = item.createReader();
      const allEntries: FileSystemEntry[] = [];
      
      // Directory readers can only read a certain number of entries at a time
      // We need to keep calling readEntries until it returns an empty array
      const readEntries = () => {
        dirReader.readEntries((entries) => {
          if (entries.length) {
            allEntries.push(...entries);
            readEntries(); // Continue reading if there are more entries
          } else {
            resolve(allEntries); // No more entries, we're done
          }
        }, (error) => {
          reject(error);
        });
      };
      
      readEntries();
    });
    
    // Process all directory entries recursively
    for (const entry of entries) {
      await traverseFileTree(entry, path + item.name + '/', fileList);
    }
    
    return fileList;
  }
  
  return fileList;
};

/**
 * Handle drop event and collect all files from the dropped items
 */
export const handleDroppedItems = async (items: DataTransferItemList): Promise<File[]> => {
  console.log('Processing dropped items:', items.length);
  console.log(items[0],items[1],items[2])
  const allFiles: File[] = [];
  
  // First try to handle as directory drops via webkitGetAsEntry
  if (items[0] && 'webkitGetAsEntry' in items[0]) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i] as ExtendedDataTransferItem;
      const entry = item.webkitGetAsEntry();
      
      if (entry) {
        const files = await traverseFileTree(entry);
        allFiles.push(...files);
      }
    }
  } else {
    // Fallback for browsers that don't support webkitGetAsEntry
    console.log('Fallback: webkitGetAsEntry not supported');
  }
  
  // If no files were found through the directory API, try to get files directly
  if (allFiles.length === 0) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          allFiles.push(file);
        }
      }
    }
  }
  
  console.log('Total files collected:', allFiles.length);
  console.log('File names:', allFiles.map(f => f.name));
  
  return allFiles;
};

/**
 * Converts an array of Files to a FileList-like object
 */
export const filesToFileList = (files: File[]): FileList => {
  const dataTransfer = new DataTransfer();
  files.forEach(file => dataTransfer.items.add(file));
  return dataTransfer.files;
};