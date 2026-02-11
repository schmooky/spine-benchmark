import { SpineLoader } from '../SpineLoader';
import { Application } from 'pixi.js';
import { assertCompleteAssetBundle } from '../storage/assetStore';

/**
 * FileProcessor - Utility class for handling file processing operations
 * 
 * This class encapsulates all file processing logic to reduce complexity in App.tsx
 * and improve testability and reusability of file handling operations.
 */
export class FileProcessor {
  private app: Application | null;
  private loader: SpineLoader | null;

  constructor(app: Application | null) {
    this.app = app;
    this.loader = app ? new SpineLoader(app) : null;
  }

  /**
   * Process dropped items (files and directories) using the File API
   * @param items - DataTransferItem array from drag and drop event
   * @returns Promise<File[]> - Array of processed files
   */
  async processItems(items: DataTransferItem[]): Promise<File[]> {
    const fileList: File[] = [];
    const promises = items.map(item => this.processItem(item, "", fileList));
    await Promise.all(promises);
    return fileList;
  }

  /**
   * Process a single item (file or directory)
   * @param item - DataTransferItem to process
   * @param path - Current path in directory traversal
   * @param fileList - Accumulated file list
   * @returns Promise<void>
   */
  private async processItem(item: any, path: string, fileList: File[]): Promise<void> {
    const entry = item.webkitGetAsEntry();
    if (entry) {
      await this.traverseEntry(entry, path, fileList);
    }
  }

  /**
   * Traverse a file system entry recursively
   * @param entry - FileSystemEntry to traverse
   * @param path - Current path in traversal
   * @param fileList - Accumulated file list
   * @returns Promise<void>
   */
  private async traverseEntry(entry: any, path: string, fileList: File[]): Promise<void> {
    if (entry.isFile) {
      await this.processFile(entry, path, fileList);
    } else if (entry.isDirectory) {
      await this.processDirectory(entry, path, fileList);
    }
  }

  /**
   * Process a single file entry
   * @param entry - FileEntry to process
   * @param path - Path to the file
   * @param fileList - Accumulated file list
   * @returns Promise<void>
   */
  private async processFile(entry: any, path: string, fileList: File[]): Promise<void> {
    return new Promise((resolve, reject) => {
      entry.file((file: File) => {
        // Store the path in a custom property
        Object.defineProperty(file, 'fullPath', {
          value: path + file.name,
          writable: false
        });
        fileList.push(file);
        resolve();
      }, reject);
    });
  }

  /**
   * Process a directory entry recursively
   * @param entry - DirectoryEntry to process
   * @param path - Path to the directory
   * @param fileList - Accumulated file list
   * @returns Promise<void>
   */
  private async processDirectory(entry: any, path: string, fileList: File[]): Promise<void> {
    const dirReader = entry.createReader();
    
    // Function to read all entries in the directory
    const readAllEntries = (entries: any[] = []): Promise<any[]> => {
      return new Promise((resolveEntries, rejectEntries) => {
        dirReader.readEntries((results: any[]) => {
          if (results.length) {
            // More entries to process
            entries = entries.concat(Array.from(results));
            readAllEntries(entries).then(resolveEntries).catch(rejectEntries);
          } else {
            // No more entries, we have all of them
            resolveEntries(entries);
          }
        }, rejectEntries);
      });
    };
    
    const entries = await readAllEntries();
    
    // Process all entries in the directory
    const promises = entries.map(entry => 
      this.traverseEntry(entry, path + entry.name + "/", fileList)
    );
    
    await Promise.all(promises);
  }

  /**
   * Convert File array to FileList-like object
   * @param files - Array of files to convert
   * @returns FileList-like object
   */
  convertToFileList(files: File[]): FileList {
    const dataTransfer = new DataTransfer();
    files.forEach(file => dataTransfer.items.add(file));
    return dataTransfer.files;
  }

  /**
   * Handle Spine files with version checking and modification if needed
   * @param files - FileList to process
   * @returns Promise<FileList> - Processed files
   */
  async handleSpineFiles(files: FileList): Promise<FileList> {
    // Check for JSON skeleton file
    const jsonFile = Array.from(files).find(file => file.name.endsWith('.json'));
    if (jsonFile) {
      const content = await jsonFile.text();
      if (content.includes('"spine":"4.1')) {
        // Create a modified file with version replaced
        const modifiedContent = content.replace(/"spine":"4.1[^"]*"/, '"spine":"4.2.0"');
        const modifiedFile = new File([modifiedContent], jsonFile.name, { type: 'application/json' });
        
        // Replace the original file in the list
        const newFileList = Array.from(files);
        const index = newFileList.findIndex(f => f.name === jsonFile.name);
        if (index !== -1) {
          newFileList[index] = modifiedFile;
          return this.convertToFileList(newFileList);
        }
      }
    }
    
    return files;
  }

  /**
   * Validate that we have the required files for Spine loading
   * @param files - FileList to validate
   * @throws Error if required files are missing
   */
  validateFiles(files: FileList): void {
    assertCompleteAssetBundle(Array.from(files));
  }
}
