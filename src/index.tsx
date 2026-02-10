import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ToastProvider } from './hooks/ToastContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';
// Import the custom toastify styles
import './toastify.css'; // Make sure to create this file with the custom styles
// Initialize i18n
import './i18n';

// Create root element
const container = document.getElementById('root');
if (!container) {
  throw new Error('Failed to find the root element');
}

const root = createRoot(container);

// Render the app
root.render(
  <React.StrictMode>
    <ToastProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </ToastProvider>
  </React.StrictMode>
);
