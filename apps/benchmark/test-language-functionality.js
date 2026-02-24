// Test script to validate language switching functionality
// This script will be run in the browser console to test the implementation

console.log('🧪 Starting Language Switching Functionality Test');

// Test 1: Check if command registry has the language command
function testCommandRegistration() {
  console.log('\n📋 Test 1: Command Registration');
  
  // Access the command registry from the global scope
  const commands = window.commandRegistry?.getAllCommands() || [];
  const languageCommand = commands.find(cmd => cmd.id === 'language.change');
  
  if (languageCommand) {
    console.log('✅ Language command found:', languageCommand);
    console.log('   - Title:', languageCommand.title);
    console.log('   - Category:', languageCommand.category);
    console.log('   - Keywords:', languageCommand.keywords);
  } else {
    console.log('❌ Language command NOT found');
    console.log('Available commands:', commands.map(cmd => ({ id: cmd.id, title: cmd.title })));
  }
  
  return !!languageCommand;
}

// Test 2: Check if command palette opens with Ctrl+K
function testCommandPaletteOpen() {
  console.log('\n⌨️  Test 2: Command Palette Opening');
  
  // Simulate Ctrl+K keypress
  const event = new KeyboardEvent('keydown', {
    key: 'k',
    ctrlKey: true,
    bubbles: true
  });
  
  document.dispatchEvent(event);
  
  // Check if command palette is visible
  setTimeout(() => {
    const palette = document.querySelector('.command-palette-backdrop');
    if (palette && palette.style.display !== 'none') {
      console.log('✅ Command palette opened successfully');
      return true;
    } else {
      console.log('❌ Command palette did not open');
      return false;
    }
  }, 100);
}

// Test 3: Search for language command in palette
function testLanguageCommandSearch() {
  console.log('\n🔍 Test 3: Language Command Search');
  
  // Find the command palette input
  const input = document.querySelector('.command-palette-input');
  if (input) {
    // Type "language" in the search
    input.value = 'language';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    
    setTimeout(() => {
      const commandItems = document.querySelectorAll('.command-item');
      const languageCommandItem = Array.from(commandItems).find(item => 
        item.textContent.toLowerCase().includes('language')
      );
      
      if (languageCommandItem) {
        console.log('✅ Language command found in search results');
        console.log('   - Command text:', languageCommandItem.textContent);
      } else {
        console.log('❌ Language command NOT found in search results');
        console.log('Available commands:', Array.from(commandItems).map(item => item.textContent));
      }
    }, 100);
  } else {
    console.log('❌ Command palette input not found');
  }
}

// Test 4: Test language modal opening
function testLanguageModalOpen() {
  console.log('\n🌐 Test 4: Language Modal Opening');
  
  // Try to execute the language command directly
  if (window.commandRegistry) {
    try {
      window.commandRegistry.executeCommand('language.change');
      
      setTimeout(() => {
        const modal = document.querySelector('.language-modal-backdrop');
        if (modal && modal.style.display !== 'none') {
          console.log('✅ Language modal opened successfully');
          
          // Check if languages are displayed
          const languageOptions = document.querySelectorAll('.language-option');
          console.log(`   - Found ${languageOptions.length} language options`);
          
          languageOptions.forEach((option, index) => {
            console.log(`   - Language ${index + 1}:`, option.textContent);
          });
          
        } else {
          console.log('❌ Language modal did not open');
        }
      }, 100);
    } catch (error) {
      console.log('❌ Error executing language command:', error);
    }
  } else {
    console.log('❌ Command registry not available');
  }
}

// Test 5: Test modal keyboard navigation
function testModalKeyboardNavigation() {
  console.log('\n⌨️  Test 5: Modal Keyboard Navigation');
  
  const modal = document.querySelector('.language-modal-backdrop');
  if (modal) {
    // Test arrow down
    const arrowDownEvent = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true
    });
    document.dispatchEvent(arrowDownEvent);
    
    setTimeout(() => {
      const focusedElement = document.activeElement;
      if (focusedElement && focusedElement.classList.contains('language-option')) {
        console.log('✅ Arrow key navigation working');
        console.log('   - Focused element:', focusedElement.textContent);
      } else {
        console.log('❌ Arrow key navigation not working');
        console.log('   - Active element:', focusedElement);
      }
    }, 100);
  } else {
    console.log('❌ Language modal not open for keyboard test');
  }
}

// Test 6: Test modal closing
function testModalClosing() {
  console.log('\n❌ Test 6: Modal Closing');
  
  const modal = document.querySelector('.language-modal-backdrop');
  if (modal) {
    // Test Escape key
    const escapeEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true
    });
    document.dispatchEvent(escapeEvent);
    
    setTimeout(() => {
      const modalAfterEscape = document.querySelector('.language-modal-backdrop');
      if (!modalAfterEscape || modalAfterEscape.style.display === 'none') {
        console.log('✅ Modal closes with Escape key');
      } else {
        console.log('❌ Modal does not close with Escape key');
      }
    }, 100);
  } else {
    console.log('❌ No modal to close');
  }
}

// Run all tests
async function runAllTests() {
  console.log('🚀 Running comprehensive language functionality tests...\n');
  
  // Wait for React to be ready
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  testCommandRegistration();
  
  await new Promise(resolve => setTimeout(resolve, 500));
  testCommandPaletteOpen();
  
  await new Promise(resolve => setTimeout(resolve, 500));
  testLanguageCommandSearch();
  
  await new Promise(resolve => setTimeout(resolve, 500));
  testLanguageModalOpen();
  
  await new Promise(resolve => setTimeout(resolve, 500));
  testModalKeyboardNavigation();
  
  await new Promise(resolve => setTimeout(resolve, 500));
  testModalClosing();
  
  console.log('\n🏁 Test suite completed!');
}

// Export functions for manual testing
window.languageTests = {
  runAllTests,
  testCommandRegistration,
  testCommandPaletteOpen,
  testLanguageCommandSearch,
  testLanguageModalOpen,
  testModalKeyboardNavigation,
  testModalClosing
};

console.log('📝 Test functions available at window.languageTests');
console.log('💡 Run window.languageTests.runAllTests() to start testing');