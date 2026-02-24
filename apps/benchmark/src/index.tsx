import React from 'react';
import { createRoot } from 'react-dom/client';
import { ToastProvider } from './hooks/ToastContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RouterProvider } from '@tanstack/react-router';
import { router } from './router';
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
        <RouterProvider router={router} />
      </ErrorBoundary>
    </ToastProvider>
  </React.StrictMode>
);
