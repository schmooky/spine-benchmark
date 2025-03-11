import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useToast, Toast } from '../hooks/ToastContext';
import { XMarkIcon } from './Icons';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToast();
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    // Find or create toast container
    let element = document.getElementById('toast-container');
    if (!element) {
      element = document.createElement('div');
      element.id = 'toast-container';
      document.body.appendChild(element);
    }
    setContainer(element);

    return () => {
      // Clean up if component unmounts
      if (element && element.parentNode && element.childNodes.length === 0) {
        element.parentNode.removeChild(element);
      }
    };
  }, []);

  if (!container) return null;

  return createPortal(
    <div className="toast-wrapper">
      {toasts.map((toast) => (
        <ToastItem 
          key={toast.id} 
          toast={toast} 
          onClose={() => removeToast(toast.id)} 
        />
      ))}
    </div>,
    container
  );
};

interface ToastItemProps {
  toast: Toast;
  onClose: () => void;
}

// Individual toast component with fade-out animation
const ToastItem: React.FC<ToastItemProps> = ({ toast, onClose }) => {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // Auto-remove toast after 5 seconds
    const timeoutId = setTimeout(() => {
      setIsExiting(true);
      // Delay actual removal to allow for animation
      setTimeout(onClose, 300);
    }, 5000);

    return () => clearTimeout(timeoutId);
  }, [onClose]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(onClose, 300);
  };

  return (
    <div 
      className={`toast toast-${toast.type} ${isExiting ? 'exiting' : ''}`}
      onClick={handleClose}
      role="alert"
    >
      <div className="toast-content">
        <p>{toast.message}</p>
        <button className="toast-close" aria-label="Close">
          <XMarkIcon size={16} />
        </button>
      </div>
    </div>
  );
};