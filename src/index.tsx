import React from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import App from './App';
import { ToastProvider } from './hooks/ToastContext';
import i18n from './i18n/config';
import './styles.css';
// Import the custom toastify styles
import './toastify.css';

// Create root element
const container = document.getElementById('root');
if (!container) {
  throw new Error('Failed to find the root element');
}

const root = createRoot(container);

// Render the app
root.render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </I18nextProvider>
  </React.StrictMode>
);