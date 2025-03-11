import React, { createContext, useContext } from 'react';
import { toast, ToastContainer as ToastifyContainer, ToastOptions } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

interface ToastContextType {
  addToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Configure default toast options
const toastOptions: ToastOptions = {
  position: "top-center",
  autoClose: 1000,
  hideProgressBar: false,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: true,
  progress: undefined,
  theme: "dark",
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const addToast = (message: string, type: ToastType = 'info') => {
    switch (type) {
      case 'success':
        toast.success(message, toastOptions);
        break;
      case 'warning':
        toast.warning(message, toastOptions);
        break;
      case 'error':
        toast.error(message, toastOptions);
        break;
      case 'info':
      default:
        toast.info(message, toastOptions);
    }
  };

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

// Custom ToastContainer component with dark theme
export const ToastContainer: React.FC = () => {
  return (
    <ToastifyContainer
      position="top-center"
      autoClose={1000}
      hideProgressBar={false}
      newestOnTop
      closeOnClick
      rtl={false}
      pauseOnFocusLoss
      draggable
      pauseOnHover
      theme="dark"
    />
  );
};