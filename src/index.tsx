import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ToastProvider } from './hooks/ToastContext';
import './styles.css';
// Import the custom toastify styles
import './toastify.css'; // Make sure to create this file with the custom styles

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
      <App />
    </ToastProvider>
  </React.StrictMode>
);