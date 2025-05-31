const fs = require('fs');
const path = require('path');

// Configuration
const outputFile = 'concatenated_files.md';
const dirsToSearch = ['./src'];
const excludedDirs = ['node_modules', 'examples', 'assets', '.git'];

// Improved function to check if a path should be excluded
function shouldExclude(filePath) {
  const normalizedPath = path.normalize(filePath);
  
  // Check if the path contains any of the excluded directories
  for (const excludedDir of excludedDirs) {
    // Check various path formats that could match
    if (
      normalizedPath === excludedDir ||
      normalizedPath.startsWith(`${excludedDir}${path.sep}`) ||
      normalizedPath.includes(`${path.sep}${excludedDir}${path.sep}`) ||
      normalizedPath.endsWith(`${path.sep}${excludedDir}`)
    ) {
      return true;
    }
  }
  
  return false;
}

// Function to recursively get all files in a directory
function getAllFiles(dirPath, arrayOfFiles = []) {
  // First check if the directory itself should be excluded
  if (shouldExclude(dirPath)) {
    return arrayOfFiles;
  }

  try {
    const files = fs.readdirSync(dirPath);

    files.forEach(file => {
      const fullPath = path.join(dirPath, file);
      
      // Skip excluded directories
      if (shouldExclude(fullPath)) {
        return;
      }
      
      if (fs.statSync(fullPath).isDirectory()) {
        arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
      } else {
        arrayOfFiles.push(fullPath);
      }
    });
  } catch (err) {
    console.error(`Error reading directory ${dirPath}: ${err.message}`);
  }

  return arrayOfFiles;
}

// Main function to concatenate files
async function concatenateFiles() {
  try {
    // Get all files from directories to search
    let allFiles = [];
    for (const dir of dirsToSearch) {
      if (fs.existsSync(dir)) {
        allFiles = allFiles.concat(getAllFiles(dir));
      } else {
        console.warn(`Warning: Directory ${dir} does not exist and will be skipped.`);
      }
    }
    
    // Remove duplicates (in case src is a subdirectory of current directory)
    allFiles = [...new Set(allFiles)];
    
    // Sort files for consistent output
    allFiles.sort();
    
    // Create or clear the output file
    fs.writeFileSync(outputFile, '');
    
    console.log(`Starting to process ${allFiles.length} files...`);
    let processedCount = 0;
    
    // Process each file
    for (const filePath of allFiles) {
      try {
        // Read file content
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Write file path and content to output file
        const mdHeader = `\n\n## ${filePath}\n\n\`\`\`\n`;
        const mdFooter = '\n```\n';
        
        fs.appendFileSync(outputFile, mdHeader + content + mdFooter);
        processedCount++;
        
        // Log progress periodically
        if (processedCount % 10 === 0 || processedCount === allFiles.length) {
          console.log(`Progress: ${processedCount}/${allFiles.length} files processed`);
        }
      } catch (err) {
        console.error(`Error processing file ${filePath}: ${err.message}`);
      }
    }
    
    console.log(`\nConcatenation complete! ${processedCount} files were merged into ${outputFile}`);
  } catch (err) {
    console.error(`Error during concatenation: ${err.message}`);
  }
}

// Run the script
concatenateFiles();